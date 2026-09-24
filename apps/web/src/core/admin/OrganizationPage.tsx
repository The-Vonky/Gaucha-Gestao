import { useCallback, useState } from "react";
import type { Organization } from "../types";
import { useAuth } from "../auth/AuthProvider";
import * as api from "./api";
import { useResource } from "../../shared/useResource";
import {
  Confirm,
  Form,
  Modal,
  Notice,
  PageTitle,
  Pager,
  Status,
  Table,
} from "../../shared/ui";
import { SectorUnits } from "./SectorUnits";
export function OrganizationPage({ kind }: { kind: "units" | "sectors" }) {
  const auth = useAuth();
  const [page, setPage] = useState(0);
  const resource = useResource(
    useCallback(() => api.list(kind, page), [kind, page]),
  );
  const [edit, setEdit] = useState<Organization | null | undefined>();
  const [toggle, setToggle] = useState<Organization>();
  const [links, setLinks] = useState<Organization>();
  const unit = kind === "units";
  const noun = unit ? "unidade" : "setor";
  const permission = unit ? "admin.unit.manage" : "admin.sector.manage";
  const allowed = (row?: Organization) =>
    auth.can(permission, unit && row ? { unit_id: row.id } : undefined);
  return (
    <>
      <PageTitle
        title={unit ? "Unidades" : "Setores"}
        description={
          unit
            ? "Estrutura organizacional da empresa."
            : "Catálogo de setores e suas unidades."
        }
      >
        {allowed() && (
          <button className="primary" onClick={() => setEdit(null)}>
            {unit ? "Nova unidade" : "Novo setor"}
          </button>
        )}
      </PageTitle>
      {resource.loading && <Notice>Carregando…</Notice>}
      {resource.error && (
        <Notice error>
          {resource.error}{" "}
          <button onClick={resource.reload}>Tentar novamente</button>
        </Notice>
      )}
      {resource.data && (
        <>
          <Table headers={["Código", "Nome", "Situação", "Ações"]}>
            {resource.data.rows.map((row) => (
              <tr key={row.id}>
                <td>{row.code}</td>
                <td>{row.name}</td>
                <td>
                  <Status active={row.active} />
                </td>
                <td>
                  <div className="row-actions">
                    {allowed(row) && (
                      <>
                        <button onClick={() => setEdit(row)}>Editar</button>
                        <button onClick={() => setToggle(row)}>
                          {row.active ? "Desativar" : "Ativar"}
                        </button>
                      </>
                    )}
                    {!unit && (
                      <button onClick={() => setLinks(row)}>Unidades</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
          {!resource.data.rows.length && (
            <Notice>Nenhum registro encontrado.</Notice>
          )}
          <Pager page={page} count={resource.data.count} onChange={setPage} />
        </>
      )}
      {edit !== undefined && (
        <Modal
          title={`${edit ? "Editar" : unit ? "Nova" : "Novo"} ${noun}`}
          onClose={() => setEdit(undefined)}
        >
          <Form
            onCancel={() => setEdit(undefined)}
            onSave={async (data) => {
              await api.saveOrganization(kind, edit, {
                code: String(data.get("code")).trim(),
                name: String(data.get("name")).trim(),
                active: edit?.active ?? true,
              });
              setEdit(undefined);
              resource.reload();
            }}
          >
            <label>
              Código
              <input
                name="code"
                required
                maxLength={40}
                defaultValue={edit?.code}
              />
            </label>
            <label>
              Nome
              <input
                name="name"
                required
                maxLength={160}
                defaultValue={edit?.name}
              />
            </label>
          </Form>
        </Modal>
      )}
      {toggle && (
        <Confirm
          title={`${toggle.active ? "Desativar" : "Ativar"} ${noun}`}
          description={`${toggle.name}: o histórico será preservado. A alteração afeta a disponibilidade para novos vínculos.`}
          onClose={() => setToggle(undefined)}
          onConfirm={async () => {
            await api.saveOrganization(kind, toggle, {
              code: toggle.code,
              name: toggle.name,
              active: !toggle.active,
            });
            resource.reload();
          }}
        />
      )}
      {links && (
        <SectorUnits sector={links} onClose={() => setLinks(undefined)} />
      )}
    </>
  );
}
