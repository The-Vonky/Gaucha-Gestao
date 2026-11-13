import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { privateImages } from "../../shared/privateImageCache";
import { AUDIT_STORAGE_TRANSFORMS, AUDIT_THUMBNAILS_ENABLED, imageKey, thumbnailKey, loadStorageThumbnail, loadEvidenceThumbnail, loadEvidenceImage, evidenceThumbnailState, type ImageEvidence } from "./evidenceImages";
/** Montar um critério não implica visibilidade: só o viewport (ou a ampliação explícita) carrega. */
export function EvidenceImage({ row, name, expanded = false, onOpenOriginal }: { row: ImageEvidence; name: string; expanded?: boolean; onOpenOriginal?: () => void }) {
  const element = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(expanded);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [notSmaller, setNotSmaller] = useState(false);
  const [loadedUrl, setLoadedUrl] = useState("");
  const thumbnail = (AUDIT_STORAGE_TRANSFORMS || AUDIT_THUMBNAILS_ENABLED) && !expanded;
  const key = thumbnail ? thumbnailKey(row) : imageKey(row);
  const url = useSyncExternalStore(privateImages.subscribe, () => privateImages.peek(key));
  const epoch = useSyncExternalStore(privateImages.subscribe, privateImages.getAccessVersion);
  const { id, inspection_id, object_key, content_type, size_bytes, uploaded_at } = row;
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
        const evidence = { id, inspection_id, object_key, content_type, size_bytes, uploaded_at };
        if (thumbnail && AUDIT_STORAGE_TRANSFORMS) {
          await loadStorageThumbnail(evidence);
          return;
        }
        if (thumbnail) {
          const status = await evidenceThumbnailState(id);
          if (!current) return;
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
        await (thumbnail ? loadEvidenceThumbnail : loadEvidenceImage)(evidence);
      } catch { if (current) { setFailed(true); setPreparing(false); } }
      finally { if (current) setLoading(false); }
    };
    void refresh();
    return () => { current = false; clearTimeout(timer); };
  }, [id, inspection_id, object_key, content_type, size_bytes, uploaded_at, visible, attempt, epoch, thumbnail]);
  const showImage = Boolean(url);
  return <span ref={element} className={showImage && !expanded ? "audit-image-slot audit-evidence-thumbnail" : "audit-image-slot"}>
    {showImage ? <>
      <img src={url} alt={name} width={expanded ? 960 : 88} height={expanded ? 720 : 72}
        loading={expanded ? "eager" : "lazy"} decoding="async"
        onLoad={() => setLoadedUrl(url)}
        onError={() => { if (privateImages.peek(key) === url) privateImages.invalidate(key); setLoadedUrl(""); setFailed(true); }} />
      {!expanded && loadedUrl === url && onOpenOriginal &&
        <button type="button" className="audit-evidence-enlarge" aria-label={`Ampliar ${name}`} onClick={onOpenOriginal} />}
    </> :
      preparing ? <span role="status">Preparando miniatura…</span> :
      loading ? <span role="status">Carregando imagem…</span> :
      failed && thumbnail ? <span className="audit-image-error">
        <span role="status">{notSmaller ? "Imagem já compacta; não foi possível reduzir a miniatura." : "Miniatura indisponível."}</span>
        {onOpenOriginal && <button type="button" className="small" onClick={onOpenOriginal}>Abrir original</button>}
      </span> :
      failed ? <span className="audit-image-error"><span role="status">Imagem indisponível ou expirada.</span> <button type="button" className="small"
        onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>Tentar novamente</button></span> :
      <button type="button" className="small" onClick={() => { setVisible(true); setAttempt(value => value + 1); }}>Carregar imagem</button>}
  </span>;
}
