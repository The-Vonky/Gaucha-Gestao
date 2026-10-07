import { useCallback, useState } from "react";
import type { Organization } from "../types";
import { useAuth } from "../auth/AuthProvider";
import { useResource } from "../../shared/useResource";
import { plural } from "../../shared/plural";
import { Badge, Confirm, LoadingState, Modal, Notice } from "../../shared/ui";
import * as api from "./api";
import { ActiveBadge } from "./parts";
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
  const manage = auth.can("admin.sector.manage");
  const isLinked = (unit: string) =>
    !!r.data?.links.some(
      (l) => l.unit_id === unit && l.sector_id === sector.id,
    );
  const linkedCount = r.data?.units.filter((u) => isLinked(u.id)).length ?? 0;
  return (
    <Modal title={`Unidades · ${sector.name}`} onClose={onClose}>
      <p className="adm-modal-meta">
        <ActiveBadge active={sector.active} />
        {r.data && (
          <span className="muted numeric">
            {linkedCount} de{" "}
            {plural(
              r.data.units.length,
              "unidade vinculada",
              "unidades vinculadas",
            )}
          </span>
        )}
      </p>
      {r.loading && <LoadingState label="Carregando vínculos…" />}
      {r.error && <Notice error>{r.error}</Notice>}
      {r.data && !r.data.units.length && (
        <Notice>Nenhuma unidade disponível.</Notice>
      )}
      {r.data && r.data.units.length > 0 && (
        <ul className="adm-list compact" aria-label="Vínculos com unidades">
          {r.data.units.map((unit) => {
            const linked = isLinked(unit.id);
            // New links need an active unit and an active sector (same rule as before).
            const blocked = !linked && (!unit.active || !sector.active);
            return (
              <li key={unit.id} className="adm-row">
                <div className="adm-main">
                  <p className="adm-title">
                    <strong>{unit.name}</strong>
                  </p>
                  {manage && blocked && (
                    <p className="adm-meta">
                      {!sector.active
                        ? "Setor inativo: não aceita novos vínculos."
                        : "Unidade inativa: não aceita novos vínculos."}
                    </p>
                  )}
                </div>
                <div className="adm-state">
                  <ActiveBadge active={unit.active} />
                  {linked ? (
                    <Badge tone="info" icon="check">
                      Vinculado
                    </Badge>
                  ) : (
                    <Badge tone="neutral">Sem vínculo</Badge>
                  )}
                </div>
                {manage && (
                  <div className="adm-actions">
                    <button
                      className={linked ? "ghost adm-danger" : undefined}
                      disabled={blocked}
                      aria-label={`${linked ? "Desvincular" : "Vincular"} ${unit.name}`}
                      onClick={() =>
                        setChange({ id: unit.id, name: unit.name, linked })
                      }
                    >
                      {linked ? "Desvincular" : "Vincular"}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {change && (
        <Confirm
          title={change.linked ? "Desvincular unidade" : "Vincular unidade"}
          tone={change.linked ? "danger" : "primary"}
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
