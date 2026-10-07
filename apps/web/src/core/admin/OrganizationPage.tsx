import { useCallback, useState } from "react";
import type { Organization } from "../types";
import { useAuth } from "../auth/AuthProvider";
import * as api from "./api";
import { useResource } from "../../shared/useResource";
import { Icon } from "../../shared/icons";
import {
  Confirm,
  EmptyState,
  Form,
  Modal,
  PageTitle,
  Pager,
} from "../../shared/ui";
import {
  ActiveBadge,
  ListState,
  ListToolbar,
  useLatest,
  useListFilters,
  usePageClamp,
} from "./parts";
import { SectorUnits } from "./SectorUnits";
import { UnitCoverEditor } from "./UnitCoverEditor";
const NOUNS = {
  units: {
    one: "unidade",
    many: "unidades",
    activeOne: "ativa",
    activeMany: "ativas",
    inactiveToggle: "Exibir inativas",
  },
  sectors: {
    one: "setor",
    many: "setores",
    activeOne: "ativo",
    activeMany: "ativos",
    inactiveToggle: "Exibir inativos",
  },
};
export function OrganizationPage({ kind }: { kind: "units" | "sectors" }) {
  const auth = useAuth();
  const filters = useListFilters();
  const { page, search, inactive } = filters;
  const resource = useResource(
    useCallback(
      () => api.organizations(kind, page, { search, inactive }),
      [kind, page, search, inactive],
    ),
  );
  const data = useLatest(resource);
  usePageClamp(filters, data?.count);
  const [edit, setEdit] = useState<Organization | null | undefined>();
  const [toggle, setToggle] = useState<Organization>();
  const [links, setLinks] = useState<Organization>();
  const [cover, setCover] = useState<Organization>();
  const unit = kind === "units";
  const noun = NOUNS[kind];
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
      <ListToolbar
        label={unit ? "Filtros das unidades" : "Filtros dos setores"}
        placeholder={unit ? "Nome da unidade" : "Nome do setor"}
        filters={filters}
        count={data?.count}
        noun={noun}
      />
      <ListState
        loading={resource.loading && !data}
        error={resource.error}
        label={unit ? "Carregando unidades…" : "Carregando setores…"}
        onRetry={resource.reload}
      />
      {data?.count === 0 && (
        <EmptyState
          title={
            unit ? "Nenhuma unidade encontrada" : "Nenhum setor encontrado"
          }
          actions={
            search && (
              <button type="button" onClick={filters.clear}>
                Limpar busca
              </button>
            )
          }
        >
          {search
            ? `Nenhum nome corresponde a “${search}”${inactive ? "" : ` entre ${unit ? "as unidades ativas" : "os setores ativos"}`}.`
            : inactive
              ? unit
                ? "Ainda não há unidades cadastradas."
                : "Ainda não há setores cadastrados."
              : `Não há ${noun.many} ${noun.activeMany}. Marque “${noun.inactiveToggle}” para ver ${unit ? "as demais" : "os demais"}.`}
        </EmptyState>
      )}
      {data && data.rows.length > 0 && (
        <ul
          className="adm-list adm-table"
          aria-label={unit ? "Unidades" : "Setores"}
          aria-busy={resource.loading}
        >
          {data.rows.map((row) => (
            <li
              key={row.id}
              className={`adm-row${row.active ? "" : " inactive"}`}
            >
              <span className="adm-code adm-lead">
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
                  <button
                    className="small"
                    aria-label={`Editar ${row.name}`}
                    onClick={() => setEdit(row)}
                  >
                    Editar
                  </button>
                )}
                {unit && allowed(row) && (
                  <button
                    className="small ghost"
                    aria-label={`Capa de ${row.name}`}
                    onClick={() => setCover(row)}
                  >
                    Capa
                  </button>
                )}
                {!unit && (
                  <button
                    className="small ghost"
                    aria-label={`Unidades de ${row.name}`}
                    onClick={() => setLinks(row)}
                  >
                    <Icon name="units" />
                    Unidades
                  </button>
                )}
                {allowed(row) && (
                  <button
                    className={`small ghost ${row.active ? "adm-danger" : "adm-activate"}`}
                    aria-label={`${row.active ? "Desativar" : "Ativar"} ${row.name}`}
                    onClick={() => setToggle(row)}
                  >
                    {row.active ? "Desativar" : "Ativar"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {data && (
        <Pager
          page={page}
          count={data.count}
          size={api.PAGE_SIZE}
          onChange={filters.setPage}
        />
      )}
      {edit !== undefined && (
        <Modal
          title={`${edit ? "Editar" : unit ? "Nova" : "Novo"} ${noun.one}`}
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
          title={`${toggle.active ? "Desativar" : "Ativar"} ${noun.one}`}
          tone={toggle.active ? "danger" : "primary"}
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
