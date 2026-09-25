import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Form, Modal, Notice } from "../../shared/ui";
import * as api from "./api";
import { PlanFields, readPlanValues } from "./PlanFields";
import type { CreationScope } from "./types";
const UNIT_WIDE = "";
export function NewActionPlan({
  scopes,
  onClose,
}: {
  scopes: CreationScope[];
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const units = [...new Map(scopes.map((s) => [s.unit_id, s.unit_name]))];
  const [unit, setUnit] = useState(units.length === 1 ? units[0][0] : "");
  const targets = scopes.filter((s) => s.unit_id === unit);
  const unitWide = targets.some((s) => !s.sector_id);
  const sectors = targets.filter((s) => s.sector_id);
  return (
    <Modal title="Novo plano de ação" onClose={onClose}>
      {!units.length ? (
        <Notice>Nenhuma unidade ativa disponível para planos manuais.</Notice>
      ) : (
        <Form
          onCancel={onClose}
          onSave={async (data) => {
            const sector = String(data.get("sector") ?? UNIT_WIDE) || null;
            const id = await api.createManual(
              unit,
              sector,
              readPlanValues(data),
            );
            navigate(`/action-plans/${id}`);
          }}
        >
          <label>
            Unidade (obrigatório)
            <select
              name="unit"
              required
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            >
              <option value="">Selecione</option>
              {units.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          {unit && (unitWide || sectors.length > 0) && (
            <label>
              Setor
              <select
                key={unit}
                name="sector"
                required={!unitWide}
                defaultValue={unitWide ? UNIT_WIDE : undefined}
              >
                {unitWide ? (
                  <option value={UNIT_WIDE}>Toda a unidade</option>
                ) : (
                  <option value="">Selecione</option>
                )}
                {sectors.map((s) => (
                  <option key={s.sector_id} value={s.sector_id!}>
                    {s.sector_name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <PlanFields />
        </Form>
      )}
    </Modal>
  );
}
