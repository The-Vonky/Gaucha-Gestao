import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { privateImages } from "../../shared/privateImageCache";
import { AUDIT_THUMBNAILS_ENABLED, imageKey, thumbnailKey, loadEvidenceThumbnail, loadEvidenceImage, evidenceThumbnailState, SMALL_ORIGINAL_PREVIEW_BYTES, THUMBNAIL_WAIT_MS, type ImageEvidence } from "./evidenceImages";
const thumbnailMessages = {
  delayed: "A miniatura está demorando.",
  failed: "Miniatura indisponível.",
  "not-smaller": "Imagem já compacta; não foi possível reduzir a miniatura.",
  dimensions: "A resolução da imagem excede o limite da miniatura.",
  invalid: "A imagem tem um formato incompatível com a miniatura.",
};
type ThumbnailStatus = keyof typeof thumbnailMessages;
/** Montar um critério não implica visibilidade: só o viewport (ou a ampliação explícita) carrega. */
export function EvidenceImage({ row, name, expanded = false, onOpenOriginal }: { row: ImageEvidence; name: string; expanded?: boolean; onOpenOriginal?: () => void }) {
  const element = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(expanded);
  const [status, setStatus] = useState<"idle" | "loading" | "preparing" | ThumbnailStatus>("idle");
  const [attempt, setAttempt] = useState(0);
  const [smallOriginal, setSmallOriginal] = useState<{ key: string; epoch: number }>();
  const thumbnail = AUDIT_THUMBNAILS_ENABLED && !expanded;
  const originalKey = imageKey(row);
  const epoch = useSyncExternalStore(privateImages.subscribe, privateImages.getAccessVersion);
  const canShowSmallOriginal = smallOriginal?.key === originalKey && smallOriginal.epoch === epoch;
  const key = thumbnail && !canShowSmallOriginal ? thumbnailKey(row) : originalKey;
  const url = useSyncExternalStore(privateImages.subscribe, () => privateImages.peek(key));
  const { id, inspection_id, object_key, content_type, size_bytes, uploaded_at } = row;
  useEffect(() => {
    if (expanded || !element.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) setVisible(entry.isIntersecting);
    }, { rootMargin: "0px", threshold: 0.01 });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [expanded, originalKey]);
  useEffect(() => {
    if (!visible) return;
    let current = true;
    let poll: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    setStatus("loading");
    setSmallOriginal(undefined);
    const deadline = thumbnail ? setTimeout(() => {
      controller.abort();
      clearTimeout(poll);
      setStatus("delayed");
    }, THUMBNAIL_WAIT_MS) : undefined;
    const refresh = async () => {
      try {
        const evidence = { id, inspection_id, object_key, content_type, size_bytes, uploaded_at };
        if (!thumbnail) {
          await loadEvidenceImage(evidence);
        } else {
          const result = await evidenceThumbnailState(id, controller.signal);
          if (!current || controller.signal.aborted || epoch !== privateImages.getAccessVersion()) return;
          if (result.retryable) {
            setStatus("preparing");
            poll = setTimeout(() => void refresh(), 2000);
            return;
          }
          clearTimeout(deadline);
          const notSmaller = result.state === "failed" && result.reason === "derivative_not_smaller";
          if (result.state === "ready") {
            setStatus("loading");
            await loadEvidenceThumbnail(evidence);
          } else if (notSmaller && Number.isSafeInteger(size_bytes) && size_bytes > 0 &&
            size_bytes <= SMALL_ORIGINAL_PREVIEW_BYTES && ["image/jpeg", "image/png"].includes(content_type)) {
            setStatus("loading");
            await loadEvidenceImage(evidence);
            if (current && epoch === privateImages.getAccessVersion()) setSmallOriginal({ key: originalKey, epoch });
          } else {
            setStatus(notSmaller ? "not-smaller"
              : result.reason === "derivative_dimensions_exceeded" ? "dimensions"
              : result.reason === "derivative_invalid_image" ? "invalid" : "failed");
            return;
          }
        }
        if (current) setStatus("idle");
      } catch {
        if (current && !controller.signal.aborted) {
          clearTimeout(deadline);
          setStatus("failed");
        }
      }
    };
    void refresh();
    return () => { current = false; controller.abort(); clearTimeout(poll); clearTimeout(deadline); };
  }, [id, inspection_id, object_key, content_type, size_bytes, uploaded_at, originalKey, visible, attempt, epoch, thumbnail]);

  const thumbnailMessage = thumbnail ? thumbnailMessages[status as ThumbnailStatus] : undefined;
  const preview = !expanded && Boolean(url);
  return <span ref={element} className={preview ? "audit-image-slot audit-evidence-thumbnail" : "audit-image-slot"}>
    {visible && url ? <>
      <img src={url} alt={name} width={expanded ? 960 : 88} height={expanded ? 720 : 72}
        loading={expanded ? "eager" : "lazy"} decoding="async"
        onError={() => { if (privateImages.peek(key) === url) privateImages.invalidate(key); setStatus("failed"); }} />
      {onOpenOriginal && <button type="button" className="audit-evidence-enlarge" aria-label={`Ampliar ${name}`} onClick={onOpenOriginal} />}
    </> :
      status === "preparing" ? <span role="status">Preparando miniatura…</span> :
      status === "loading" ? <span role="status">Carregando imagem…</span> :
      thumbnailMessage ? <span className="audit-image-error">
        <span role="status">{thumbnailMessage}</span>
        <span className="audit-image-actions">
          {onOpenOriginal && <button type="button" className="small" onClick={onOpenOriginal}>Abrir original</button>}
          {status === "delayed" && <button type="button" className="small" onClick={() => setAttempt(value => value + 1)}>Consultar novamente</button>}
        </span>
      </span> :
      status === "failed" ? <span className="audit-image-error"><span role="status">Imagem indisponível ou expirada.</span> <button type="button" className="small"
        onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button></span> :
      visible ? <span className="audit-image-error"><button type="button" className="small"
        onClick={() => setAttempt(value => value + 1)}>Carregar imagem</button></span> :
      <span className="audit-image-error"><button type="button" className="small" onClick={() => setVisible(true)}>Carregar imagem</button></span>}
  </span>;
}
