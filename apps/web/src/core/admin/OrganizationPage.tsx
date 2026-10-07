import { useCallback, useState } from "react";
import type { Organization } from "../types";
import { useAuth } from "../auth/AuthProvider";
import * as api from "./api";
import { useResource } from "../../shared/useResource";
import { Icon } from "../../shared/icons";
import { Confirm, Form, Modal, PageTitle, Pager } from "../../shared/ui";
import { ActiveBadge, ListState } from "./parts";
import { SectorUnits } from "./SectorUnits";
import { UnitCoverEditor } from "./UnitCoverEditor";
export function OrganizationPage({ kind }: { kind: "units" | "sectors" }) {
  const auth = useAuth();
  const [page, setPage] = useState(0);
  const resource = useResource(
    useCallback(() => api.list(kind, page), [kind, page]),
  );
  const [edit, setEdit] = useState<Organization | null | undefined>();
  const [toggle, setToggle] = useState<Organization>();
  const [links, setLinks] = useState<Organization>();
  const [cover, setCover] = useState<Organization>();
  const unit = kind === "units";
  const noun = unit ? "unidade" : "setor";
  const permission = unit ? "admin.unit.manage" : "admin.sector.manage";
  const allowed = (row?: Organization) =>
    auth.can(permission, unit && row ? { unit_id: row.id } : undefined);
  return (
    <>
      <PageTitle
        eyebrow="Administração"
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
      <ListState
        loading={resource.loading}
        error={resource.error}
        empty={!!resource.data && !resource.data.rows.length}
        emptyText="Nenhum registro encontrado."
        onRetry={resource.reload}
      />
      {resource.data && resource.data.rows.length > 0 && (
        <ul className="adm-list" aria-label={unit ? "Unidades" : "Setores"}>
          {resource.data.rows.map((row) => (
            <li key={row.id} className="adm-row">
              <span className="adm-code">
                <span className="visually-hidden">Código </span>
                {row.code}
              </span>
              <div className="adm-main">
                <p className="adm-title">
                  <strong>{row.name}</strong>
                </p>
              </div>
              <div className="adm-state">
                <ActiveBadge active={row.active} />
              </div>
              <div className="adm-actions">
                {allowed(row) && (
                  <>
                    <button
                      aria-label={`Editar ${row.name}`}
                      onClick={() => setEdit(row)}
                    >
                      Editar
                    </button>
                    {unit && (
                      <button
                        className="ghost"
                        aria-label={`Capa de ${row.name}`}
                        onClick={() => setCover(row)}
                      >
                        Capa
                      </button>
                    )}
                    <button
                      className={row.active ? "ghost adm-danger" : "ghost"}
                      aria-label={`${row.active ? "Desativar" : "Ativar"} ${row.name}`}
                      onClick={() => setToggle(row)}
                    >
                      {row.active ? "Desativar" : "Ativar"}
                    </button>
                  </>
                )}
                {!unit && (
                  <button
                    className="ghost"
                    aria-label={`Unidades de ${row.name}`}
                    onClick={() => setLinks(row)}
                  >
                    <Icon name="units" />
                    Unidades
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {resource.data && (
        <Pager page={page} count={resource.data.count} onChange={setPage} />
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
      {cover && (
        <UnitCoverEditor
          unit={cover}
          onClose={() => setCover(undefined)}
          onChanged={resource.reload}
        />
      )}
    </>
  );
}
