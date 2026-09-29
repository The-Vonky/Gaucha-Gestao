import { useCallback } from "react";
import type { Permission, Role } from "../types";
import { useAuth } from "../auth/AuthProvider";
import { useResource } from "../../shared/useResource";
import { Form, Modal, Notice } from "../../shared/ui";
import * as api from "./api";
import { ActiveBadge, domainLabel, Identifier, RoleKind } from "./parts";
/** Permissions grouped by domain, in catalog order. */
function byDomain(permissions: Permission[]) {
  const groups = new Map<string, Permission[]>();
  for (const p of permissions)
    groups.set(p.domain, [...(groups.get(p.domain) ?? []), p]);
  return [...groups];
}
export function RoleEditor({
  selected,
  onClose,
  onSaved,
}: {
  selected: Role | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const auth = useAuth();
  const r = useResource(
    useCallback(async () => {
      const [detail, permissions] = await Promise.all([
        selected
          ? api.roleDetail(selected.id)
          : Promise.resolve({ role: null, permission_keys: [] as string[] }),
        api.all("permissions"),
      ]);
      return { ...detail, permissions };
    }, [selected]),
  );
  const row = r.data?.role ?? null;
  const system = !!row?.system;
  const manage = auth.can("admin.role.manage");
  const lacking = !!r.data?.permission_keys.some((p) => !auth.can(p));
  const readOnly = system || !manage || lacking;
  const granted = r.data?.permissions.filter((p) =>
    r.data!.permission_keys.includes(p.key),
  );
  return (
    <Modal
      title={
        selected
          ? `${!r.data ? "Perfil" : readOnly ? "Consultar perfil" : "Editar perfil"} · ${selected.name}`
          : "Novo perfil"
      }
      onClose={onClose}
    >
      {row && (
        <p className="adm-modal-meta">
          <RoleKind role={row} />
          <ActiveBadge active={row.active} />
          <Identifier label="Chave">{row.key}</Identifier>
        </p>
      )}
      {r.loading && <Notice>Carregando composição…</Notice>}
      {r.error && (
        <Notice error>
          {r.error} <button onClick={r.reload}>Tentar novamente</button>
        </Notice>
      )}
      {r.data &&
        (readOnly ? (
          <>
            <Notice>
              <strong>Somente consulta.</strong>{" "}
              {system
                ? "Perfil de sistema protegido: sua composição é mantida pela plataforma."
                : !manage
                  ? "Você não tem permissão para editar perfis de acesso."
                  : "Este perfil contém permissões que você não pode conceder."}
            </Notice>
            {row?.description && <p className="adm-meta">{row.description}</p>}
            <h3 className="adm-subhead">
              Permissões{" "}
              <span className="adm-count numeric">{granted!.length}</span>
            </h3>
            {!granted!.length && (
              <p className="muted">Nenhuma permissão neste perfil.</p>
            )}
            {byDomain(granted!).map(([domain, list]) => (
              <section key={domain} className="adm-perm-group">
                <h4>
                  {domainLabel(domain)} <code>{domain}</code>
                </h4>
                <ul className="adm-perm-list">
                  {list.map((p) => (
                    <li key={p.key}>
                      <span className="adm-perm-text">{p.description}</span>
                      <code>{p.key}</code>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        ) : (
          <Form
            onCancel={onClose}
            onSave={async (data) => {
              await api.saveRole(row, {
                key: row?.key ?? String(data.get("key")),
                name: String(data.get("name")).trim(),
                description: String(data.get("description")).trim(),
                permissions: data.getAll("permissions").map(String),
              });
              onSaved();
            }}
          >
            {!row && (
              <label>
                Chave
                <input
                  name="key"
                  required
                  pattern="[a-z][a-z0-9_-]{1,79}"
                  maxLength={80}
                />
                <small>Letras minúsculas, números, hífen ou sublinhado.</small>
              </label>
            )}
            <label>
              Nome
              <input
                name="name"
                required
                maxLength={160}
                defaultValue={row?.name}
              />
            </label>
            <label>
              Descrição
              <textarea
                name="description"
                maxLength={500}
                defaultValue={row?.description}
              />
            </label>
            <p className="muted">
              Somente permissões que você possui globalmente podem ser
              concedidas. Alterações afetam todos os usuários deste perfil.
            </p>
            {byDomain(r.data.permissions).map(([domain, list]) => (
              <fieldset key={domain} className="adm-perm-group">
                <legend>
                  {domainLabel(domain)} <code>{domain}</code>
                </legend>
                {list.map((p) => {
                  const grantable = auth.can(p.key);
                  return (
                    <label className="check adm-perm" key={p.key}>
                      <input
                        type="checkbox"
                        name="permissions"
                        value={p.key}
                        defaultChecked={r.data!.permission_keys.includes(p.key)}
                        disabled={!grantable}
                      />
                      <span>
                        <span className="adm-perm-text">{p.description}</span>
                        <code>{p.key}</code>
                        {!grantable && (
                          <span className="adm-perm-note">
                            Não concedível: você não possui esta permissão.
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            ))}
          </Form>
        ))}
    </Modal>
  );
}
