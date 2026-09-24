import { useCallback } from "react";
import type { Role } from "../types";
import { useAuth } from "../auth/AuthProvider";
import { useResource } from "../../shared/useResource";
import { Form, Modal, Notice } from "../../shared/ui";
import * as api from "./api";
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
  const readOnly =
    !!row?.system ||
    !auth.can("admin.role.manage") ||
    !!r.data?.permission_keys.some((p) => !auth.can(p));
  return (
    <Modal title={selected?.name ?? "Novo perfil"} onClose={onClose}>
      {r.loading && <Notice>Carregando composição…</Notice>}
      {r.error && (
        <Notice error>
          {r.error} <button onClick={r.reload}>Tentar novamente</button>
        </Notice>
      )}
      {r.data &&
        (readOnly ? (
          <>
            <p>Perfil protegido ou acesso somente para consulta.</p>
            <ul>
              {r.data.permissions
                .filter((p) => r.data!.permission_keys.includes(p.key))
                .map((p) => (
                  <li key={p.key}>
                    {p.description} <code>{p.key}</code>
                  </li>
                ))}
            </ul>
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
            <fieldset className="permission-list">
              <legend>Permissões</legend>
              {r.data.permissions.map((p) => (
                <label className="check" key={p.key}>
                  <input
                    type="checkbox"
                    name="permissions"
                    value={p.key}
                    defaultChecked={r.data!.permission_keys.includes(p.key)}
                    disabled={!auth.can(p.key)}
                  />
                  <span>
                    {p.description}
                    <code>{p.key}</code>
                  </span>
                </label>
              ))}
            </fieldset>
            <p className="muted">
              Somente permissões que você possui globalmente podem ser
              concedidas. Alterações afetam todos os usuários deste perfil.
            </p>
          </Form>
        ))}
    </Modal>
  );
}
