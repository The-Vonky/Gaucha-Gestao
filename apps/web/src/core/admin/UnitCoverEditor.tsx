import { useEffect, useId, useRef, useState } from "react";
import type { Organization } from "../types";
import { Modal, Notice } from "../../shared/ui";
import { formatSize } from "../../shared/evidenceFiles";
import {
  COVER_ACCEPT,
  COVER_FORMATS_HINT,
  prepareCoverImage,
  type PreparedCover,
} from "../unitCoverImage";
import {
  coverMessage,
  removeUnitCover,
  resolveUnitCovers,
  setUnitCoverPosition,
  uploadUnitCover,
  type UnitCover,
} from "../unitCovers";
type Phase =
  | "idle"
  | "preparing"
  | "uploading"
  | "confirming"
  | "saving"
  | "removing";
const WORKING: Record<Exclude<Phase, "idle">, string> = {
  preparing: "Preparando imagem…",
  uploading: "Enviando foto…",
  confirming: "Confirmando…",
  saving: "Salvando enquadramento…",
  removing: "Removendo foto…",
};
type Draft = { prepared: PreparedCover; url: string };
const CENTER = { x: 50, y: 50 };
/** Self-service cover of one unit (Unit Cover v1): choose, prepare, frame, save, remove. */
export function UnitCoverEditor({
  unit,
  onClose,
  onChanged,
}: {
  unit: Organization;
  onClose: () => void;
  onChanged: () => void;
}) {
  const ids = useId();
  const input = useRef<HTMLInputElement>(null);
  const running = useRef(false);
  const [current, setCurrent] = useState<UnitCover | null>();
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState<Draft>();
  const [position, setPosition] = useState(CENTER);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [removing, setRemoving] = useState(false);
  const busy = phase !== "idle";
  useEffect(() => {
    let active = true;
    setLoadError("");
    resolveUnitCovers([unit.id], true)
      .then((covers) => {
        if (!active) return;
        const cover = covers.get(unit.id) ?? null;
        setCurrent(cover);
        setPosition(cover ? { x: cover.x, y: cover.y } : CENTER);
      })
      .catch((e) => {
        if (active) setLoadError(coverMessage(e));
      });
    return () => {
      active = false;
    };
  }, [unit.id, revision]);
  // The local preview URL lives only while this draft is shown.
  useEffect(
    () => () => {
      if (draft) URL.revokeObjectURL(draft.url);
    },
    [draft],
  );
  const shown = draft?.url ?? current?.url;
  const framed =
    !!current && (position.x !== current.x || position.y !== current.y);
  const dirty = !!draft || framed;
  /** Single-flight guard: a second click while working is ignored. */
  async function run(first: Phase, work: () => Promise<string>) {
    if (running.current) return;
    running.current = true;
    setPhase(first);
    setError("");
    setSuccess("");
    try {
      setSuccess(await work());
    } catch (e) {
      setError(coverMessage(e));
    } finally {
      running.current = false;
      setPhase("idle");
    }
  }
  function choose(file: File | undefined) {
    if (!file) return;
    void run("preparing", async () => {
      const prepared = await prepareCoverImage(file);
      setDraft({ prepared, url: URL.createObjectURL(prepared.blob) });
      setPosition(CENTER);
      return "";
    });
  }
  function save() {
    void run(draft ? "uploading" : "saving", async () => {
      if (draft) {
        await uploadUnitCover(unit.id, draft.prepared, position, setPhase);
        setDraft(undefined);
      } else if (current) {
        await setUnitCoverPosition(unit.id, current.assetId, position);
      }
      setRevision((r) => r + 1);
      onChanged();
      return draft
        ? "Foto salva. A capa já aparece nas telas desta unidade."
        : "Enquadramento salvo.";
    });
  }
  function cancel() {
    setDraft(undefined);
    setPosition(current ? { x: current.x, y: current.y } : CENTER);
    setError("");
    setSuccess("");
  }
  function remove() {
    if (!current) return;
    setRemoving(false);
    void run("removing", async () => {
      await removeUnitCover(unit.id, current.assetId);
      setRevision((r) => r + 1);
      onChanged();
      return "Foto removida. A unidade volta a exibir o monograma.";
    });
  }
  const description = draft
    ? `Nova foto preparada: ${draft.prepared.width} × ${draft.prepared.height} px, ${formatSize(draft.prepared.blob.size)}, JPEG. Ainda não foi salva.`
    : current
      ? `Foto atual: ${current.width} × ${current.height} px.`
      : current === null
        ? "Nenhuma foto cadastrada. As telas exibem o monograma da unidade."
        : "";
  return (
    <Modal title={`Capa · ${unit.name}`} onClose={onClose} busy={busy}>
      <div className="cover-editor">
        {current === undefined && !loadError && <Notice>Carregando capa…</Notice>}
        {loadError && (
          <Notice error>
            {loadError}{" "}
            <button onClick={() => setRevision((r) => r + 1)}>Tentar novamente</button>
          </Notice>
        )}
        {current !== undefined && (
          <>
            <div className="cover-previews" aria-describedby={`${ids}-desc`}>
              {(["card", "hero"] as const).map((frame) => (
                <figure key={frame} className="cover-preview">
                  <div className={`cover-frame cover-frame-${frame}`}>
                    {shown ? (
                      <img
                        src={shown}
                        alt={`Prévia da capa no ${frame === "card" ? "cartão" : "destaque"}`}
                        style={{ objectPosition: `${position.x}% ${position.y}%` }}
                      />
                    ) : (
                      <span className="cover-frame-empty" aria-hidden="true">
                        {unit.code}
                      </span>
                    )}
                  </div>
                  <figcaption>
                    {frame === "card" ? "Cartão da unidade" : "Destaque da página"}
                  </figcaption>
                </figure>
              ))}
            </div>
            <p id={`${ids}-desc`} className="cover-description">
              {description}
            </p>
            {shown && (
              <fieldset className="cover-framing" disabled={busy}>
                <legend>Enquadramento</legend>
                {(
                  [
                    ["x", "Posição horizontal", "0 = esquerda, 100 = direita"],
                    ["y", "Posição vertical", "0 = topo, 100 = base"],
                  ] as const
                ).map(([axis, label, hint]) => (
                  <div key={axis} className="cover-range">
                    <label htmlFor={`${ids}-${axis}`}>{label}</label>
                    <output htmlFor={`${ids}-${axis}`}>{position[axis]}%</output>
                    <input
                      id={`${ids}-${axis}`}
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={position[axis]}
                      aria-valuetext={`${position[axis]}% (${hint})`}
                      onChange={(e) =>
                        setPosition((p) => ({ ...p, [axis]: Number(e.target.value) }))
                      }
                    />
                  </div>
                ))}
                <button
                  type="button"
                  className="ghost"
                  disabled={position.x === 50 && position.y === 50}
                  onClick={() => setPosition(CENTER)}
                >
                  Centralizar
                </button>
              </fieldset>
            )}
            <input
              ref={input}
              id={`${ids}-file`}
              className="visually-hidden"
              type="file"
              tabIndex={-1}
              accept={COVER_ACCEPT}
              aria-label="Arquivo da foto da unidade"
              aria-describedby={`${ids}-hint`}
              onChange={(e) => {
                choose(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <p id={`${ids}-hint`} className="cover-hint">
              {COVER_FORMATS_HINT} A foto é reduzida e convertida no seu aparelho antes do envio; o
              arquivo original não é armazenado.
            </p>
            <div className="visually-hidden" role="status" aria-live="polite">
              {busy ? WORKING[phase as Exclude<Phase, "idle">] : ""}
            </div>
            {success && !busy && <Notice tone="success">{success}</Notice>}
            {error && <Notice error>{error}</Notice>}
            {removing ? (
              <div className="cover-confirm" role="group" aria-labelledby={`${ids}-remove`}>
                <p id={`${ids}-remove`}>
                  Remover a foto de {unit.name}? As telas voltarão a exibir o monograma.
                </p>
                <div className="actions">
                  <button autoFocus onClick={() => setRemoving(false)}>
                    Manter foto
                  </button>
                  <button className="danger" onClick={remove}>
                    Remover foto
                  </button>
                </div>
              </div>
            ) : (
              <div className="actions cover-actions">
                {current && !draft && (
                  <button
                    className="ghost adm-danger"
                    disabled={busy}
                    onClick={() => {
                      setSuccess("");
                      setError("");
                      setRemoving(true);
                    }}
                  >
                    Remover foto
                  </button>
                )}
                <button disabled={busy} onClick={() => input.current?.click()}>
                  {current || draft ? "Alterar foto" : "Adicionar foto"}
                </button>
                {dirty && (
                  <>
                    <button disabled={busy} onClick={cancel}>
                      Cancelar
                    </button>
                    <button className="primary" disabled={busy} onClick={save}>
                      {busy ? WORKING[phase as Exclude<Phase, "idle">] : draft ? "Salvar foto" : "Salvar enquadramento"}
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
