import { useEffect, useId, useRef, useState } from "react";
import { message } from "../../shared/errors";
import { Icon, type IconName } from "../../shared/icons";
import * as api from "./api";
import { RESPONSE_LABELS, RESPONSES, type Response } from "./scoring";
import type { Answer, Item } from "./types";
import { ChecklistEvidence } from "./ChecklistEvidence";
import type { EvidenceController } from "./useChecklistEvidence";
import { itemAnchor } from "./InspectionContext";
type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";
const CONFLICT = new Set(["PGRST116", "40001"]);
const SAVE_ICON: Record<Exclude<SaveState, "idle">, IconName> = {
  saving: "clock",
  saved: "check",
  error: "error",
  conflict: "warning",
};
export function ChecklistItem({
  item,
  row,
  editable,
  onChange,
  onPending,
  onConflict,
  evidence,
  evidenceEditable=editable,
}: {
  item: Item;
  row: Answer;
  editable: boolean;
  evidence?: EvidenceController;
  evidenceEditable?: boolean;
  onChange: (row: Answer) => void;
  onPending?: (key: string, value: boolean) => void;
  onConflict: () => void;
}) {
  const id = useId();
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const [observation, setObservation] = useState(row.observation);
  const latest = useRef(row);
  const synced = useRef(row.observation);
  const queue = useRef(Promise.resolve());
  const ticket = useRef(0);
  const failed = useRef(false);
  // Mirrors the textarea: text typed while a save is in flight is still unsaved when it settles.
  const draft = useRef(row.observation);
  const unsaved = () => failed.current || draft.current !== latest.current.observation;
  useEffect(() => {
    latest.current = row;
    // Keep text still being typed; follow the server value otherwise.
    const previous = synced.current;
    synced.current = row.observation;
    if (draft.current === previous) draft.current = row.observation;
    setObservation(draft.current);
    // A reload clears the page's pending set; unsaved text kept here must block reports again.
    if (editable && unsaved()) onPending?.(item.key, true);
  }, [row]);
  function save(values: Partial<Pick<Answer, "response" | "observation">>) {
    const thisSave = ++ticket.current;
    onPending?.(item.key, true);
    // Serialize this item's writes so each uses the version returned by the previous one.
    queue.current = queue.current.then(async () => {
      const current = latest.current;
      setState("saving");
      try {
        const saved = await api.saveAnswer(current, {
          response: current.response,
          observation: current.observation,
          ...values,
        });
        latest.current = saved;
        failed.current = false;
        onChange(saved);
        setState("saved");
      } catch (e) {
        const code = String((e as { code?: string })?.code ?? "");
        if (CONFLICT.has(code)) {
          setState("conflict");
          failed.current = false;
          try {
            const fresh = await api.answer(
              current.inspection_id,
              current.item_key,
            );
            latest.current = fresh;
            draft.current = fresh.observation;
            setObservation(fresh.observation);
            onChange(fresh);
          } catch {
            // The parent reload reports access/lifecycle changes.
          }
          onConflict();
        } else {
          failed.current = true;
          setState("error");
          setError(message(e));
        }
      } finally {
        if (ticket.current === thisSave) onPending?.(item.key, unsaved());
      }
    });
  }
  const emphasis = row.response === "AP" || row.response === "NAT";
  const busy = state === "saving";
  // D5: criterion evidence sits behind "Evidências (n)"; it stays mounted while
  // closed and opens on its own while an upload is in progress or failed.
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const evidenceCount = evidence
    ? evidence.rows.filter((e) => e.item_key === item.key).length
    : 0;
  const uploading = !!evidence?.uploads[item.key];
  const showEvidence = evidenceOpen || uploading;
  return (
    <li
      id={itemAnchor(item.key)}
      // Focusable only programmatically: the target of "Abrir critério N".
      tabIndex={-1}
      className="audit-item"
      data-answered={row.response ? "true" : "false"}
      data-response={row.response?.toLowerCase()}
      aria-busy={busy || undefined}
    >
      <p className="audit-item-text" id={`${id}-text`}>
        <span className="audit-number">{item.number}.</span> {item.text}
      </p>
      <div
        className="audit-responses"
        role="group"
        aria-labelledby={`${id}-text`}
      >
        {RESPONSES.map((r: Response) => {
          const pressed = row.response === r;
          return (
            <button
              key={r}
              type="button"
              className={`response ${r.toLowerCase()}`}
              aria-pressed={pressed}
              aria-label={`${RESPONSE_LABELS[r]} (${r})`}
              title={RESPONSE_LABELS[r]}
              // Not disabled while saving, so keyboard focus stays on the control.
              disabled={!editable}
              aria-disabled={busy || undefined}
              onClick={() => {
                if (!busy) save({ response: pressed ? null : r });
              }}
            >
              {pressed && <Icon name="check" className="icon response-check" />}
              {r}
            </button>
          );
        })}
      </div>
      {editable ? (
        <label
          className={
            emphasis ? "audit-observation emphasis" : "audit-observation"
          }
        >
          Observação
          <textarea
            value={observation}
            maxLength={2000}
            rows={emphasis ? 3 : 1}
            placeholder={
              emphasis ? "Descreva o ponto observado (recomendado)" : ""
            }
            onChange={(e) => { draft.current = e.target.value; setObservation(e.target.value); onPending?.(item.key, unsaved()); }}
            onBlur={() => {
              if (observation !== latest.current.observation)
                save({ observation });
              else if (!failed.current) onPending?.(item.key, false);
            }}
          />
        </label>
      ) : (
        row.observation && (
          <p className="audit-observation-text">
            <strong>Observação:</strong> {row.observation}
          </p>
        )
      )}
      <p
        className={`audit-save ${state}`}
        role={state === "error" || state === "conflict" ? "alert" : "status"}
      >
        {state !== "idle" && <Icon name={SAVE_ICON[state]} />}
        {state === "saving" && "Salvando…"}
        {state === "saved" && "Salvo"}
        {state === "error" && error}
        {state === "conflict" &&
          "Este critério foi alterado em outra sessão ou a auditoria mudou de estado. O valor atual foi carregado; revise antes de alterar novamente."}
      </p>
      {evidence && (
        <div className="audit-item-evidence">
          <button
            type="button"
            className="audit-evidence-toggle"
            aria-expanded={showEvidence}
            aria-controls={`${id}-evidence`}
            aria-describedby={`${id}-text`}
            onClick={() => setEvidenceOpen((open) => !open)}
          >
            <Icon name={showEvidence ? "chevronDown" : "chevronRight"} />
            {/* The count needs a successful read; loading/error is not "no evidence". */}
            {evidence.loading || evidence.error ? "Evidências" : `Evidências (${evidenceCount})`}
          </button>
          <div id={`${id}-evidence`} hidden={!showEvidence}>
            <ChecklistEvidence item={item} editable={evidenceEditable} controller={evidence}/>
          </div>
        </div>
      )}
    </li>
  );
}
