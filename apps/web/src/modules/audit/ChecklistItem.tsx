import { useEffect, useId, useRef, useState } from "react";
import { message } from "../../shared/errors";
import { Icon, type IconName } from "../../shared/icons";
import * as api from "./api";
import { RESPONSE_LABELS, RESPONSES, type Response } from "./scoring";
import type { Answer, Item } from "./types";
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
  onConflict,
}: {
  item: Item;
  row: Answer;
  editable: boolean;
  onChange: (row: Answer) => void;
  onConflict: () => void;
}) {
  const id = useId();
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const [observation, setObservation] = useState(row.observation);
  const latest = useRef(row);
  const synced = useRef(row.observation);
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    latest.current = row;
    // Keep text still being typed; follow the server value otherwise.
    const previous = synced.current;
    synced.current = row.observation;
    setObservation((local) => (local === previous ? row.observation : local));
  }, [row]);
  function save(values: Partial<Pick<Answer, "response" | "observation">>) {
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
        onChange(saved);
        setState("saved");
      } catch (e) {
        const code = String((e as { code?: string })?.code ?? "");
        if (CONFLICT.has(code)) {
          setState("conflict");
          try {
            const fresh = await api.answer(
              current.inspection_id,
              current.item_key,
            );
            latest.current = fresh;
            setObservation(fresh.observation);
            onChange(fresh);
          } catch {
            // The parent reload reports access/lifecycle changes.
          }
          onConflict();
        } else {
          setState("error");
          setError(message(e));
        }
      }
    });
  }
  const emphasis = row.response === "AP" || row.response === "NAT";
  const busy = state === "saving";
  return (
    <li
      className="audit-item"
      data-answered={row.response ? "true" : "false"}
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
            onChange={(e) => setObservation(e.target.value)}
            onBlur={() => {
              if (observation !== latest.current.observation)
                save({ observation });
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
    </li>
  );
}
