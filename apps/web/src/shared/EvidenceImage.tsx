import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { privateImages } from "./privateImageCache";
import { Modal } from "./ui";
import "./evidenceImage.css";

export function EvidenceImageSlot({ cacheKey: key, name, expanded = false, thumbnail, load, prepare, onOpenOriginal }: {
  cacheKey: string;
  name: string;
  expanded?: boolean;
  thumbnail: boolean;
  load: () => Promise<void>;
  prepare?: () => Promise<{ state: string; reason: string | null; retryable: boolean }>;
  onOpenOriginal?: () => void;
}) {
  const loadImage = useEffectEvent(load);
  const checkPreparation = useEffectEvent(() => prepare?.());
  const element = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(expanded);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [notSmaller, setNotSmaller] = useState(false);
  const [loadedUrl, setLoadedUrl] = useState("");
  const url = useSyncExternalStore(privateImages.subscribe, () => privateImages.peek(key));
  const epoch = useSyncExternalStore(privateImages.subscribe, privateImages.getAccessVersion);
  useEffect(() => {
    if (expanded || !element.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) setVisible(entry.isIntersecting);
    }, { rootMargin: "0px", threshold: 0.01 });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [expanded, key]);
  useEffect(() => {
    if (!visible) return;
    let current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setFailed(false); setLoading(true); setPreparing(false); setNotSmaller(false);
    const refresh = async () => {
      try {
        const status = await checkPreparation();
        if (!current) return;
        if (status) {
          if (status.retryable) {
            setPreparing(true); setLoading(false);
            timer = setTimeout(() => void refresh(), 2000);
            return;
          }
          setPreparing(false);
          if (status.state !== "ready") {
            setNotSmaller(status.reason === "derivative_not_smaller");
            setFailed(true); setLoading(false); return;
          }
        }
        await loadImage();
      } catch { if (current) { setFailed(true); setPreparing(false); } }
      finally { if (current) setLoading(false); }
    };
    void refresh();
    return () => { current = false; clearTimeout(timer); };
  }, [key, visible, attempt, epoch]);
  const hasImage = Boolean(url);
  return <span ref={element} className={hasImage && !expanded ? "evidence-image-slot evidence-image-thumbnail" : "evidence-image-slot"}>
    {hasImage ? visible && <>
      <img src={url} alt={name} width={expanded ? 960 : 88} height={expanded ? 720 : 72}
        loading={expanded ? "eager" : "lazy"} decoding="async"
        onLoad={() => setLoadedUrl(url)}
        onError={() => { if (privateImages.peek(key) === url) privateImages.invalidate(key); setLoadedUrl(""); setFailed(true); }} />
      {!expanded && loadedUrl === url && onOpenOriginal &&
        <button type="button" className="evidence-image-enlarge" aria-label={`Ampliar ${name}`} onClick={onOpenOriginal} />}
    </> :
      preparing ? <span role="status">Preparando miniatura…</span> :
      loading ? <span role="status">Carregando imagem…</span> :
      failed && thumbnail ? <span className="evidence-image-error">
        <span role="status">{notSmaller ? "Imagem já compacta; não foi possível reduzir a miniatura." : "Miniatura indisponível."}</span>
        <button type="button" className="small" onClick={() => setAttempt(value => value + 1)}>Tentar miniatura novamente</button>
        {onOpenOriginal && <button type="button" className="small" onClick={onOpenOriginal}>Abrir original</button>}
      </span> :
      failed ? <span className="evidence-image-error"><span role="status">Imagem indisponível ou expirada.</span> <button type="button" className="small"
        onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>Tentar novamente</button></span> :
      <button type="button" className="small" onClick={() => { setVisible(true); setAttempt(value => value + 1); }}>Carregar imagem</button>}
  </span>;
}

export function EvidenceImageModal({ name, onClose, children }: { name: string; onClose: () => void; children: ReactNode }) {
  return <Modal title={name} wide closeOnBackdrop onClose={onClose}>
    <div className="evidence-image-preview" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      {children}
    </div>
  </Modal>;
}
