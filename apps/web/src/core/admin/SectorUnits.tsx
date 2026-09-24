import { useCallback, useState } from "react";
import type { Organization } from "../types";
import { useAuth } from "../auth/AuthProvider";
import { useResource } from "../../shared/useResource";
import { Confirm, Modal, Notice, Status } from "../../shared/ui";
import * as api from "./api";
export function SectorUnits({
  sector,
  onClose,
}: {
  sector: Organization;
  onClose: () => void;
}) {
  const auth = useAuth();
  const r = useResource(
    useCallback(async () => {
      const [units, links] = await Promise.all([
        api.all("units"),
        api.all("unit_sectors"),
      ]);
      return { units, links };
    }, []),
  );
  const [change, setChange] = useState<{
    id: string;
    name: string;
    linked: boolean;
  }>();
  return (
    <Modal title={`Unidades · ${sector.name}`} onClose={onClose}>
      {r.loading && <Notice>Carregando vínculos…</Notice>}
      {r.error && <Notice error>{r.error}</Notice>}
      {r.data && !r.data.units.length && (
        <Notice>Nenhuma unidade disponível.</Notice>
      )}
      <ul className="record-list">
        {r.data?.units.map((unit) => {
          const linked = r.data!.links.some(
            (l) => l.unit_id === unit.id && l.sector_id === sector.id,
          );
          return (
            <li key={unit.id}>
              <span>
                {unit.name} <Status active={unit.active} /> ·{" "}
                {linked ? "Vinculado" : "Sem vínculo"}
              </span>
              {auth.can("admin.sector.manage") && (
                <button
                  disabled={!linked && (!unit.active || !sector.active)}
                  onClick={() =>
                    setChange({ id: unit.id, name: unit.name, linked })
                  }
                >
                  {linked ? "Desvincular" : "Vincular"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {change && (
        <Confirm
          title={change.linked ? "Desvincular unidade" : "Vincular unidade"}
          description={`${sector.name} / ${change.name}. Vínculos referenciados por atribuições não podem ser removidos.`}
          onClose={() => setChange(undefined)}
          onConfirm={async () => {
            await api.setUnitSector(change.id, sector.id, !change.linked);
            r.reload();
          }}
        />
      )}
    </Modal>
  );
}
