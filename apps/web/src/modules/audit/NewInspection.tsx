import { useNavigate } from "react-router-dom";
import { useAuth } from "../../core/auth/AuthProvider";
import { Form, Modal, Notice } from "../../shared/ui";
import * as api from "./api";
import type { AuditUnit } from "./types";
function today() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}
export function NewInspection({
  units,
  unitId,
  onClose,
}: {
  units: AuditUnit[];
  unitId?: string;
  onClose: () => void;
}) {
  const auth = useAuth();
  const navigate = useNavigate();
  const allowed = units.filter(
    (u) => u.active && auth.can("audit.inspection.create", { unit_id: u.id }),
  );
  return (
    <Modal title="Nova auditoria" onClose={onClose}>
      {!allowed.length ? (
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
            navigate(`/audit/inspections/${id}`);
          }}
        >
          <label>
            Unidade
            <select name="unit" required defaultValue={unitId ?? ""}>
              <option value="">Selecione</option>
              {allowed.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Data de aplicação
            <input
              type="date"
              name="applied_on"
              required
              defaultValue={today()}
            />
          </label>
          <label>
            Data da visita anterior (opcional)
            <input type="date" name="previous_visit_on" />
          </label>
          <p className="muted">
            A auditoria é criada com o checklist vigente completo (158
            critérios).
          </p>
        </Form>
      )}
    </Modal>
  );
}
