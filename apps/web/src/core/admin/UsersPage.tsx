import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import type { Profile } from "../types";
import { Icon } from "../../shared/icons";
import { useResource } from "../../shared/useResource";
import { Badge, Confirm, EmptyState, PageTitle, Pager } from "../../shared/ui";
import * as api from "./api";
import { ActiveBadge, Identifier, ListState } from "./parts";
import { UserAssignments } from "./UserAssignments";
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
export function UsersPage() {
  const auth = useAuth();
  const [page, setPage] = useState(0);
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  const [inactive, setInactive] = useState(false);
  // Waits for the user to stop typing before querying.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(term.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [term]);
  const r = useResource(
    useCallback(
      () => api.users(page, { search, inactive }),
      [page, search, inactive],
    ),
  );
  // Keeps the previous result on screen while a new search loads.
  const [shown, setShown] = useState<typeof r.data>();
  useEffect(() => {
    if (r.data) setShown(r.data);
  }, [r.data]);
  const data = r.error ? undefined : (r.data ?? shown);
  const [selected, setSelected] = useState<Profile>();
  const [toggle, setToggle] = useState<Profile>();
  const manage = auth.can("admin.user.manage");
  const clear = () => {
    setTerm("");
    setSearch("");
    setPage(0);
  };
  return (
    <>
      <PageTitle
        eyebrow="Administração"
        title="Usuários"
        description="Identidades corporativas, situação e atribuições de acesso."
      />
      <p className="muted adm-intro">
        Contas são criadas ou convidadas pela administração do Auth. Ativar uma
        conta não restaura suas atribuições revogadas.
      </p>
      <form
        className="filters adm-filters usr-toolbar"
        aria-label="Filtros dos usuários"
        onSubmit={(e) => e.preventDefault()}
      >
        <label className="adm-filter-wide">
          Buscar
          <input
            type="search"
            placeholder="Nome do usuário"
            maxLength={160}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={inactive}
            onChange={(e) => {
              setInactive(e.target.checked);
              setPage(0);
            }}
          />
          <span>Exibir inativos</span>
        </label>
        {data && (
          <p className="usr-count" role="status">
            <strong className="numeric">{data.count}</strong>{" "}
            {data.count === 1 ? "usuário" : "usuários"}
            {inactive ? "" : data.count === 1 ? " ativo" : " ativos"}
            {search ? ` para “${search}”` : ""}
          </p>
        )}
      </form>
      <ListState
        loading={r.loading && !data}
        error={r.error}
        empty={false}
        emptyText=""
        onRetry={r.reload}
      />
      {data && !data.rows.length && (
        <EmptyState
          title="Nenhum usuário encontrado"
          actions={
            search && (
              <button type="button" onClick={clear}>
                Limpar busca
              </button>
            )
          }
        >
          {search
            ? `Nenhum nome corresponde a “${search}”${inactive ? "" : " entre os usuários ativos"}.`
            : inactive
              ? "Ainda não há usuários cadastrados."
              : "Não há usuários ativos. Marque “Exibir inativos” para ver os demais."}
        </EmptyState>
      )}
      {data && data.rows.length > 0 && (
        <ul
          className={`adm-list usr-list${manage ? " manage" : ""}`}
          aria-label="Usuários"
          aria-busy={r.loading}
        >
          {data.rows.map((row) => {
            // The current user never gets an activation toggle for their own account.
            const self = row.id === auth.profile?.id;
            return (
              <li
                key={row.id}
                className={`adm-row usr-row${row.active ? "" : " inactive"}`}
              >
                <span className="usr-avatar" aria-hidden="true">
                  {initials(row.display_name) || "?"}
                </span>
                <div className="adm-main">
                  <p className="adm-title">
                    <strong>{row.display_name}</strong>
                    {self && <Badge tone="info">Você</Badge>}
                  </p>
                  <Identifier label="ID">{row.id}</Identifier>
                </div>
                <div className="adm-state">
                  <ActiveBadge active={row.active} />
                </div>
                <div className="adm-actions">
                  <button
                    className="small"
                    aria-label={`Atribuições de ${row.display_name}`}
                    onClick={() => setSelected(row)}
                  >
                    <Icon name="roles" />
                    Atribuições
                  </button>
                  {manage && !self && (
                    <button
                      className={`small ghost ${row.active ? "adm-danger" : "usr-activate"}`}
                      aria-label={`${row.active ? "Desativar" : "Ativar"} ${row.display_name}`}
                      onClick={() => setToggle(row)}
                    >
                      {row.active ? "Desativar" : "Ativar"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {data && data.count > api.PAGE_SIZE && (
        <Pager page={page} count={data.count} onChange={setPage} />
      )}
      {selected && (
        <UserAssignments
          profile={selected}
          onClose={() => setSelected(undefined)}
        />
      )}
      {toggle && (
        <Confirm
          title={`${toggle.active ? "Desativar" : "Ativar"} usuário`}
          description={
            toggle.active
              ? `${toggle.display_name} perderá o acesso e suas atribuições serão revogadas. O histórico será preservado.`
              : `${toggle.display_name} será ativado sem restaurar atribuições. Conceda os acessos necessários explicitamente.`
          }
          onClose={() => setToggle(undefined)}
          onConfirm={async () => {
            await api.setProfileActive(
              toggle.id,
              toggle.version,
              !toggle.active,
            );
            r.reload();
          }}
        />
      )}
    </>
  );
}
