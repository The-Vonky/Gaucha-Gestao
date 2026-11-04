import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { privateImages } from "../../shared/privateImageCache";
import { imageKey, loadEvidenceImage, type ImageEvidence } from "./evidenceImages";
/** Montar um critério não implica visibilidade: só o viewport (ou a ampliação explícita) carrega. */
export function EvidenceImage({ row, name, expanded = false }: { row: ImageEvidence; name: string; expanded?: boolean }) {
  const element = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(expanded);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const key = imageKey(row);
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
    setFailed(false); setLoading(true);
    void loadEvidenceImage({ id, inspection_id, object_key, content_type, size_bytes, uploaded_at })
      .catch(() => { if (current) setFailed(true); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [id, inspection_id, object_key, content_type, size_bytes, uploaded_at, visible, attempt, epoch]);
  return <span ref={element} className="audit-image-slot">
    {visible && url ? <img src={url} alt={name} width={expanded ? 960 : 88} height={expanded ? 720 : 72}
      loading={expanded ? "eager" : "lazy"} decoding="async" onError={() => { if (privateImages.peek(key) === url) privateImages.invalidate(key); setFailed(true); }} /> :
      loading ? <span role="status">Carregando imagem…</span> :
      failed ? <span className="audit-image-error" role="status">Imagem indisponível ou expirada. <button type="button" className="small"
        onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>Tentar novamente</button></span> :
      visible ? <span className="audit-image-error" role="status">Carregar imagem <button type="button" className="small"
        onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button></span> :
      <span className="audit-image-error"><button type="button" className="small" onClick={() => setVisible(true)}>Carregar imagem</button></span>}
  </span>;
}
