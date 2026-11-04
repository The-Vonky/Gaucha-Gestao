// Cache privado, volátil e independente de domínio. O Core informa o contexto de acesso;
// os módulos continuam responsáveis por autorizar/carregar seus próprios objetos.
type Entry = { url: string; bytes: number; expiresAt: number; timer: ReturnType<typeof setTimeout> };
type Pending = { controller: AbortController; promise: Promise<void> };
type Loader = (signal: AbortSignal) => Promise<{ blob: Blob; expiresAt: number }>;
export const PRIVATE_IMAGE_BYTES = 24 * 1024 * 1024;
export const PRIVATE_IMAGE_TTL = 60_000;
const MAX_PENDING = 100;
const unavailable = () => new Error("Imagem indisponível. Tente novamente.");
export class PrivateImageCache {
  private access = "";
  private epoch = 0;
  private bytes = 0;
  private entries = new Map<string, Entry>();
  private pending = new Map<string, Pending>();
  private listeners = new Set<() => void>();
  private running = 0;
  private queue: (() => void)[] = [];
  constructor(private maxBytes = PRIVATE_IMAGE_BYTES) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  getAccessVersion = () => this.epoch;
  private notify() { for (const listener of this.listeners) listener(); }
  setAccess(key: string) {
    if (key === this.access) return;
    this.access = key;
    this.epoch++;
    this.clear();
  }
  clear() {
    for (const key of new Set([...this.entries.keys(), ...this.pending.keys()])) this.drop(key);
    this.notify();
  }
  private drop(key: string) {
    const entry = this.entries.get(key);
    if (entry) {
      clearTimeout(entry.timer);
      URL.revokeObjectURL(entry.url);
      this.bytes -= entry.bytes;
      this.entries.delete(key);
    }
    this.pending.get(key)?.controller.abort();
    this.pending.delete(key);
  }
  invalidate(key: string) { this.drop(key); this.notify(); }
  invalidateMatching(matches: (key: string) => boolean) {
    for (const key of new Set([...this.entries.keys(), ...this.pending.keys()])) if (matches(key)) this.drop(key);
    this.notify();
  }
  reconcile(prefix: string, valid: ReadonlySet<string>) {
    for (const key of new Set([...this.entries.keys(), ...this.pending.keys()]))
      if (key.startsWith(prefix) && !valid.has(key)) this.drop(key);
    this.notify();
  }
  // Snapshot estável para useSyncExternalStore; nunca entrega uma entrada vencida.
  peek = (key: string) => {
    const entry = this.entries.get(key);
    return entry && entry.expiresAt > Date.now() ? entry.url : "";
  };
  private async slot(signal: AbortSignal) {
    if (signal.aborted) throw unavailable();
    if (this.running >= 2) await new Promise<void>((resolve, reject) => {
      const abort = () => {
        this.queue = this.queue.filter(wake => wake !== resume);
        reject(unavailable());
      };
      const resume = () => { signal.removeEventListener("abort", abort); this.running++; resolve(); };
      this.queue.push(resume);
      signal.addEventListener("abort", abort, { once: true });
    });
    else this.running++;
    if (signal.aborted) { this.running--; this.queue.shift()?.(); throw unavailable(); }
  }
  async load(key: string, loader: Loader): Promise<void> {
    const epoch = this.epoch;
    if (!this.access) throw unavailable();
    if (this.peek(key)) {
      const entry = this.entries.get(key)!;
      this.entries.delete(key); this.entries.set(key, entry); // LRU
      return;
    }
    const existing = this.pending.get(key);
    if (existing) {
      await existing.promise;
      if (epoch !== this.epoch || !this.peek(key)) throw unavailable();
      return;
    }
    if (this.pending.size >= MAX_PENDING) throw unavailable();
    const controller = new AbortController();
    const request = { controller, promise: Promise.resolve() };
    const current = () => epoch === this.epoch && this.pending.get(key) === request && !controller.signal.aborted;
    request.promise = (async () => {
      await this.slot(controller.signal);
      // Inclui assinatura e transferência; requisições travadas não retêm slots indefinidamente.
      const timeout = setTimeout(() => controller.abort(), 30_000);
      try {
        if (!current()) throw unavailable();
        const { blob, expiresAt } = await new Promise<Awaited<ReturnType<Loader>>>((resolve, reject) => {
          const abort = () => reject(unavailable());
          controller.signal.addEventListener("abort", abort, { once: true });
          void loader(controller.signal).then(resolve, reject).finally(() => controller.signal.removeEventListener("abort", abort));
        });
        if (!current() || expiresAt <= Date.now() || blob.size <= 0 || blob.size > this.maxBytes) throw unavailable();
        this.drop(key);
        while (this.bytes + blob.size > this.maxBytes) this.drop(this.entries.keys().next().value!);
        const url = URL.createObjectURL(blob);
        const timer = setTimeout(() => this.invalidate(key), expiresAt - Date.now());
        this.entries.set(key, { url, bytes: blob.size, expiresAt, timer });
        this.bytes += blob.size;
        this.notify();
      } finally {
        clearTimeout(timeout);
        this.running--;
        this.queue.shift()?.();
      }
    })().finally(() => { if (this.pending.get(key) === request) this.pending.delete(key); });
    this.pending.set(key, request);
    await request.promise;
    // Uma troca pode ocorrer entre a resolução da promise e a continuação do consumidor.
    if (epoch !== this.epoch || !this.peek(key)) throw unavailable();
  }
}
export const privateImages = new PrivateImageCache();
// Não manter imagens ao sair da página, inclusive no back/forward cache do navegador.
if (typeof window !== "undefined") window.addEventListener("pagehide", () => privateImages.clear());
