import { useCallback, useState } from "react";
import { database } from "../client";
import { useAuth } from "../auth/AuthProvider";
import type { Assignment, Profile } from "../types";
import { useResource } from "../../shared/useResource";
import { Badge, Confirm, Form, Modal, Notice } from "../../shared/ui";
import * as api from "./api";
import { ActiveBadge, Identifier } from "./parts";
type Described = { role: string; unit: string | null; sector: string | null };
const SCOPE_LABELS: Record<Assignment["scope_type"], string> = {
  global: "Global",
  unit: "Unidade",
  sector: "Setor na unidade",
};
function AssignmentGroup({
  title,
  rows,
  describe,
  onRevoke,
}: {
  title: string;
  rows: Assignment[];
  describe: (a: Assignment) => Described;
  onRevoke?: (a: Assignment) => void;
}) {
  if (!rows.length) return null;
  return (
    <section className="adm-group" aria-label={title}>
      <h3 className="adm-subhead">
        {title} <span className="adm-count numeric">{rows.length}</span>
      </h3>
      <ul className="adm-list compact">
        {rows.map((a) => {
          const d = describe(a);
          return (
            <li key={a.id} className="adm-row">
              <div className="adm-main">
                <p className="adm-title">
                  <strong>{d.role}</strong>
                  <Badge tone="info">{SCOPE_LABELS[a.scope_type]}</Badge>
                </p>
                {a.scope_type === "global" ? (
                  <p className="adm-meta">Todas as unidades e setores</p>
                ) : (
                  <dl className="adm-scope">
                    <div>
                      <dt>Unidade</dt>
                      <dd>{d.unit}</dd>
                    </div>
                    {a.scope_type === "sector" && (
                      <div>
                        <dt>Setor</dt>
                        <dd>{d.sector}</dd>
                      </div>
                    )}
                  </dl>
                )}
              </div>
              <div className="adm-state">
                <ActiveBadge active={a.active} on="Vigente" off="Revogada" />
              </div>
              {onRevoke && a.active && (
                <div className="adm-actions">
                  <button
                    className="ghost adm-danger"
                    aria-label={`Revogar ${d.role} (${SCOPE_LABELS[a.scope_type]})`}
                    onClick={() => onRevoke(a)}
                  >
                    Revogar
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
export function UserAssignments({
  profile,
  onClose,
}: {
  profile: Profile;
  onClose: () => void;
}) {
  const auth = useAuth();
  const manage = auth.can("admin.user.manage");
  const [scope, setScope] = useState<Assignment["scope_type"]>("global");
  const [unit, setUnit] = useState("");
  const [role, setRole] = useState("");
  const [revoke, setRevoke] = useState<Assignment>();
  const r = useResource(
    useCallback(async () => {
      const { data: assignments, error } = await database()
        .from("user_role_assignments")
        .select("*")
        .eq("user_id", profile.id)
        .order("created_at");
      if (error) throw error;
      const [roles, units, sectors, links, rp] = await Promise.all([
        api.all("roles"),
        manage ? api.all("units") : Promise.resolve([]),
        manage ? api.all("sectors") : Promise.resolve([]),
        manage ? api.all("unit_sectors") : Promise.resolve([]),
        manage ? api.all("role_permissions") : Promise.resolve([]),
      ]);
      return {
        assignments: assignments ?? [],
        roles,
        units,
        sectors,
        links,
        rp,
      };
    }, [profile.id, manage]),
  );
  const currentRole = r.data?.roles.find((x) => x.id === role);
  const current = r.data?.assignments.filter((a) => a.active) ?? [];
  const revoked = r.data?.assignments.filter((a) => !a.active) ?? [];
  const name = (list: { id: string; name: string }[] = [], id: string) =>
    list.find((x) => x.id === id)?.name;
  // Names only resolve when the lists were loaded (manage); otherwise the id is shown.
  const describe = (a: Assignment): Described => ({
    role: name(r.data?.roles, a.role_id) ?? a.role_id,
    unit: a.unit_id ? (name(r.data?.units, a.unit_id) ?? a.unit_id) : null,
    sector: a.sector_id
      ? (name(r.data?.sectors, a.sector_id) ?? a.sector_id)
      : null,
  });
  return (
    <Modal title={`Atribuições · ${profile.display_name}`} onClose={onClose}>
      <p className="adm-modal-meta">
        <ActiveBadge active={profile.active} />
        <Identifier label="ID">{profile.id}</Identifier>
      </p>
      {r.loading && <Notice>Carregando…</Notice>}
      {r.error && <Notice error>{r.error}</Notice>}
      {r.data && (
        <>
          <AssignmentGroup
            title="Atribuições vigentes"
            rows={current}
            describe={describe}
            onRevoke={
              manage && profile.id !== auth.profile?.id ? setRevoke : undefined
            }
          />
          {!current.length && (
            <Notice>
              Sem atribuições. A conta não possui acesso operacional.
            </Notice>
          )}
          {revoked.length > 0 && (
            <AssignmentGroup
              title="Revogadas (histórico)"
              rows={revoked}
              describe={describe}
            />
          )}
          {manage && profile.active && (
            <>
              <h3 className="adm-subhead">Conceder acesso</h3>
              <Form
                onCancel={onClose}
                onSave={async (data) => {
                  await api.grantAssignment({
                    user_id: profile.id,
                    role_id: String(data.get("role")),
                    scope_type: scope,
                    unit_id: scope === "global" ? null : unit,
                    sector_id:
                      scope === "sector" ? String(data.get("sector")) : null,
                  });
                  r.reload();
                }}
              >
                <label>
                  Perfil de acesso
                  <select
                    name="role"
                    required
                    value={role}
                    onChange={(e) => {
                      setRole(e.target.value);
                      setScope("global");
                      setUnit("");
                    }}
                  >
                    <option value="">Selecione</option>
                    {r.data.roles
                      .filter((x) => x.active)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Escopo
                  <select
                    name="scope"
                    value={scope}
                    onChange={(e) => {
                      setScope(e.target.value as Assignment["scope_type"]);
                      setUnit("");
                    }}
                  >
                    <option value="global">Global</option>
                    {!currentRole?.global_only && (
                      <>
                        <option value="unit">Unidade</option>
                        <option value="sector">Setor na unidade</option>
                      </>
                    )}
                  </select>
                </label>
                {scope !== "global" && (
                  <label>
                    Unidade
                    <select
                      name="unit"
                      required
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                    >
                      <option value="">Selecione</option>
                      {r.data.units
                        .filter((x) => x.active)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                {scope === "sector" && (
                  <label>
                    Setor
                    <select key={unit} name="sector" required>
                      <option value="">Selecione</option>
                      {r.data.sectors
                        .filter(
                          (s) =>
                            s.active &&
                            r.data!.links.some(
                              (l) => l.unit_id === unit && l.sector_id === s.id,
                            ),
                        )
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                <p className="muted">
                  O banco valida se você pode conceder todas as permissões deste
                  perfil no escopo escolhido.
                </p>
              </Form>
            </>
          )}
        </>
      )}
      {revoke && (
        <Confirm
          title="Revogar atribuição"
          description="Este acesso será removido. Outras atribuições permanecerão válidas."
          onClose={() => setRevoke(undefined)}
          onConfirm={async () => {
            await api.revokeAssignment(revoke);
            r.reload();
          }}
        />
      )}
    </Modal>
  );
}
