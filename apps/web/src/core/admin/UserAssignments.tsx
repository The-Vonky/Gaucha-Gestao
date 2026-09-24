import { useCallback, useState } from "react";
import { database } from "../client";
import { useAuth } from "../auth/AuthProvider";
import type { Assignment, Profile } from "../types";
import { useResource } from "../../shared/useResource";
import { Confirm, Form, Modal, Notice, Status } from "../../shared/ui";
import * as api from "./api";
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
  return (
    <Modal title={`Atribuições · ${profile.display_name}`} onClose={onClose}>
      {r.loading && <Notice>Carregando…</Notice>}
      {r.error && <Notice error>{r.error}</Notice>}
      {r.data && (
        <>
          <ul className="record-list">
            {r.data.assignments.map((a) => (
              <li key={a.id}>
                <div>
                  <strong>
                    {r.data!.roles.find((x) => x.id === a.role_id)?.name ??
                      a.role_id}
                  </strong>
                  <p>
                    {a.scope_type === "global"
                      ? "Global"
                      : `${r.data!.units.find((x) => x.id === a.unit_id)?.name ?? a.unit_id}${a.sector_id ? ` / ${r.data!.sectors.find((x) => x.id === a.sector_id)?.name ?? a.sector_id}` : ""}`}
                  </p>
                  <Status active={a.active} />
                </div>
                {manage && a.active && profile.id !== auth.profile?.id && (
                  <button onClick={() => setRevoke(a)}>Revogar</button>
                )}
              </li>
            ))}
          </ul>
          {!r.data.assignments.length && (
            <Notice>
              Sem atribuições. A conta não possui acesso operacional.
            </Notice>
          )}
          {manage && profile.active && (
            <>
              <h3>Conceder acesso</h3>
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
