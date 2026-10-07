import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../core/auth/AuthProvider";
import { today } from "../../shared/dates";
import { Form, Modal, Notice } from "../../shared/ui";
import * as api from "./api";
import type { AuditUnit } from "./types";
/**
 * New inspection (create_inspection, unchanged). Opened from a unit, the unit is
 * fixed; the previous visit is suggested from that unit's latest application date
 * (editable, optional). A new inspection opens straight into its checklist.
 */
export function NewInspection({
  units,
  unitId,
  lastApplied = {},
  onClose,
}: {
  units: AuditUnit[];
  /** Fixes the unit (opened from the unit page). */
  unitId?: string;
  /** Latest application date per unit, already loaded by the caller. */
  lastApplied?: Record<string, string>;
  onClose: () => void;
}) {
  const auth = useAuth();
  const navigate = useNavigate();
  const allowed = units.filter(
    (u) => u.active && auth.can("audit.inspection.create", { unit_id: u.id }),
  );
  const fixed = unitId ? allowed.find((u) => u.id === unitId) : undefined;
  const [unit, setUnit] = useState(fixed?.id ?? "");
  const [appliedOn, setAppliedOn] = useState(today());
  const [previous, setPrevious] = useState(fixed ? lastApplied[fixed.id] ?? "" : "");
  const [previousTouched, setPreviousTouched] = useState(false);
  const chooseUnit = (id: string) => {
    setUnit(id);
    if (!previousTouched) setPrevious(lastApplied[id] ?? "");
  };
  return (
    <Modal title="Nova auditoria" onClose={onClose}>
      {!allowed.length || (unitId && !fixed) ? (
        <Notice>Nenhuma unidade ativa disponível para nova auditoria.</Notice>
      ) : (
        <Form
          onCancel={onClose}
          onSave={async (data) => {
            const id = await api.createInspection(
              String(data.get("unit")),
              String(data.get("applied_on")),
              String(data.get("previous_visit_on")) || null,
            );
            navigate(`/audit/inspections/${id}/checklist`);
          }}
        >
          {fixed ? (
            <p className="new-inspection-unit">
              <span className="muted">Unidade</span>
              <strong>{fixed.name}</strong>
              <input type="hidden" name="unit" value={fixed.id} />
            </p>
          ) : (
            <label>
              Unidade
              <select
                name="unit"
                required
                value={unit}
                onChange={(e) => chooseUnit(e.target.value)}
              >
                <option value="">Selecione</option>
                {allowed.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Data da auditoria
            <input
              type="date"
              name="applied_on"
              required
              value={appliedOn}
              onChange={(e) => setAppliedOn(e.target.value)}
            />
          </label>
          <label>
            Data da visita anterior (opcional)
            <input
              type="date"
              name="previous_visit_on"
              value={previous}
              max={appliedOn || undefined}
              onChange={(e) => {
                setPreviousTouched(true);
                setPrevious(e.target.value);
              }}
            />
          </label>
          {previous && !previousTouched && (
            <p className="muted">Sugerida a partir da última auditoria da unidade.</p>
          )}
          <p className="muted">
            A auditoria é criada com o checklist vigente completo (158
            critérios).
          </p>
        </Form>
      )}
    </Modal>
  );
}
