import { Component, useEffect, useState, type ReactNode } from "react";
import {
  BrowserRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { client } from "../core/client";
import { AuthProvider, useAuth } from "../core/auth/AuthProvider";
import { Login } from "../core/auth/Login";
import { OrganizationPage } from "../core/admin/OrganizationPage";
import { UsersPage } from "../core/admin/UsersPage";
import { RolesPage } from "../core/admin/RolesPage";
import { PermissionsPage } from "../core/admin/PermissionsPage";
import { LogsPage } from "../core/admin/LogsPage";
import { AuditModule } from "../modules/audit/AuditModule";
import { ActionPlansModule } from "../modules/action-plans/ActionPlansModule";
import { BrandMark, Loader } from "../shared/brand";
import { Icon } from "../shared/icons";
import {
  Drawer,
  EmptyState,
  IconButton,
  Notice,
  PageTitle,
} from "../shared/ui";
import {
  destinations,
  groupDescriptions,
  visibleNavigation,
  type Destination,
} from "./navigation";
import "./shell.css";
function Logout({ compact = false }: { compact?: boolean }) {
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    try {
      const result = await client!.auth.signOut();
      setError(!!result.error);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className={compact ? "ghost logout" : "logout"}
        disabled={busy}
        onClick={() => void logout()}
      >
        <Icon name="logout" />
        <span>{busy ? "Saindo…" : "Sair"}</span>
      </button>
      {error &&
        (compact ? (
          <span className="logout-error" role="alert">
            Não foi possível sair. Tente novamente.
          </span>
        ) : (
          <Notice error>Não foi possível sair. Tente novamente.</Notice>
        ))}
    </>
  );
}
function Boundary() {
  const auth = useAuth();
  if (auth.loading)
    return (
      <main className="center-state centered">
        <Loader label="Carregando seu acesso…" />
      </main>
    );
  if (!auth.session) return <Login />;
  if (auth.error)
    return (
      <main className="center-state">
        <Notice error>{auth.error}</Notice>
        <div className="actions">
          <button className="primary" onClick={auth.refresh}>
            Tentar novamente
          </button>
          <Logout />
        </div>
      </main>
    );
  if (!auth.profile?.active)
    return (
      <main className="center-state">
        <BrandMark className="state-mark" />
        <h1>Acesso indisponível</h1>
        <p>
          Sua conta está inativa ou não possui um perfil disponível. Fale com a
          administração.
        </p>
        <div className="actions">
          <button className="primary" onClick={auth.refresh}>
            Atualizar acesso
          </button>
          <Logout />
        </div>
      </main>
    );
  return <Shell />;
}
function Brand() {
  return (
    <Link className="brand" to="/" aria-label="Gaúcha Gestão — Início">
      <BrandMark />
      <span className="brand-name">
        Gaúcha<small>Gestão</small>
      </span>
    </Link>
  );
}
function Menu({ onNavigate }: { onNavigate?: () => void }) {
  const auth = useAuth();
  const nav = visibleNavigation(!!auth.profile?.active, auth.grants);
  return (
    <nav className="menu" aria-label="Navegação principal">
      <NavLink to="/" end onClick={onNavigate}>
        <Icon name="home" />
        <span>Início</span>
      </NavLink>
      {nav.map((group) => (
        <section key={group.group}>
          <h2>{group.group}</h2>
          {group.destinations.map((d) => (
            <NavLink key={d.path} to={d.path} onClick={onNavigate}>
              <Icon name={d.icon} />
              <span>{d.label}</span>
            </NavLink>
          ))}
        </section>
      ))}
    </nav>
  );
}
function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts.at(-1)![0] : "")
  ).toLocaleUpperCase("pt-BR");
}
function Avatar({ name }: { name?: string }) {
  return (
    <span className="avatar" aria-hidden="true">
      {initials(name) || "?"}
    </span>
  );
}
function Breadcrumbs({ current }: { current?: Destination }) {
  const { pathname } = useLocation();
  return (
    <nav className="crumbs" aria-label="Você está em">
      <ol>
        <li>
          {current ? (
            <Link to="/">Início</Link>
          ) : (
            <span aria-current="page">Início</span>
          )}
        </li>
        {current && (
          <>
            <li>
              <span>{current.group}</span>
            </li>
            <li>
              {pathname === current.path ? (
                <span aria-current="page">{current.label}</span>
              ) : (
                <Link to={current.path}>{current.label}</Link>
              )}
            </li>
          </>
        )}
      </ol>
    </nav>
  );
}
function UserCard() {
  const auth = useAuth();
  const name = auth.profile?.display_name;
  return (
    <div className="user-card">
      <Avatar name={name} />
      <span className="user-id">
        <strong>{name}</strong>
        <small>{auth.session?.user.email}</small>
      </span>
      <Logout compact />
    </div>
  );
}
function Home() {
  const auth = useAuth();
  const entries = visibleNavigation(!!auth.profile?.active, auth.grants);
  const today = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const modules = entries.reduce((n, g) => n + g.destinations.length, 0);
  const domains = entries.filter((g) => g.group !== "Administração");
  const admin = entries.find((g) => g.group === "Administração");
  return (
    <>
      <header className="launch-head">
        <p className="eyebrow">{today}</p>
        <h1>Áreas de trabalho</h1>
        <p>
          {auth.profile?.display_name} ·{" "}
          <span className="numeric">
            {modules === 1
              ? "1 módulo liberado"
              : `${modules} módulos liberados`}
          </span>
        </p>
      </header>
      {!entries.length ? (
        <EmptyState title="Nenhuma área liberada">
          Sua conta ainda não possui permissões. Solicite uma atribuição à
          administração informando o e-mail{" "}
          <strong>{auth.session?.user.email}</strong>.
        </EmptyState>
      ) : (
        <>
          {domains.map((g) => (
            <section
              className="domain"
              data-group={g.group}
              key={g.group}
              aria-label={g.group}
            >
              <BrandMark tone="mono" weight={1.6} className="domain-loops" />
              <div className="domain-intro">
                <p className="domain-name">{g.group}</p>
                {groupDescriptions[g.group] && (
                  <p className="domain-text">{groupDescriptions[g.group]}</p>
                )}
              </div>
              <div className="domain-modules">
                {g.destinations.map((d) => (
                  <Link className="module-tile" key={d.path} to={d.path}>
                    <span className="module-icon">
                      <Icon name={d.icon} />
                    </span>
                    <h2>{d.label}</h2>
                    <p>{d.description}</p>
                    <span className="module-open" aria-hidden="true">
                      Abrir <Icon name="arrowRight" />
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
          {admin && (
            <section className="admin-area" aria-label={admin.group}>
              <div className="admin-head">
                <p className="eyebrow">{admin.group}</p>
                <p>{groupDescriptions[admin.group]}</p>
              </div>
              <ul className="admin-list">
                {admin.destinations.map((d) => (
                  <li key={d.path}>
                    <Link to={d.path}>
                      <Icon name={d.icon} />
                      <div>
                        <h2>{d.label}</h2>
                        <small>{d.description}</small>
                      </div>
                      <Icon name="chevronRight" className="icon admin-go" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
function Guard({ path, children }: { path: string; children: ReactNode }) {
  const auth = useAuth();
  const visible = visibleNavigation(
    !!auth.profile?.active,
    auth.grants,
  ).flatMap((g) => g.destinations);
  return visible.some((d) => d.path === path) ? (
    children
  ) : (
    <>
      <PageTitle
        title="Acesso não autorizado"
        description="Você não possui a permissão necessária para esta área."
      />
      <Link className="button-link" to="/">
        Voltar ao início
      </Link>
    </>
  );
}
function Shell() {
  const auth = useAuth();
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    // The header is sticky: focusing must not scroll content under it.
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [location.pathname]);
  const pages: Record<string, ReactNode> = {
    "/audit": <AuditModule />,
    "/action-plans": <ActionPlansModule />,
    "/admin/users": <UsersPage />,
    "/admin/roles": <RolesPage />,
    "/admin/permissions": <PermissionsPage />,
    "/admin/units": <OrganizationPage kind="units" />,
    "/admin/sectors": <OrganizationPage kind="sectors" />,
    "/admin/logs": <LogsPage />,
  };
  const current = destinations.find(
    (d) =>
      location.pathname === d.path ||
      location.pathname.startsWith(`${d.path}/`),
  );
  return (
    <div className="layout">
      <a className="skip" href="#main">
        Ir para o conteúdo
      </a>
      <aside className="sidebar">
        <Brand />
        <Menu />
        <BrandMark tone="mono" weight={1.6} className="sidebar-loops" />
        <UserCard />
      </aside>
      <div className="workspace">
        <header className="topbar">
          <IconButton
            icon="menu"
            label="Menu"
            className="ghost mobile-menu"
            aria-haspopup="dialog"
            aria-expanded={drawer}
            onClick={() => setDrawer(true)}
          />
          <Link
            className="topbar-brand"
            to="/"
            aria-label="Gaúcha Gestão — Início"
          >
            <BrandMark />
            <span className="brand-name">
              Gaúcha<small>Gestão</small>
            </span>
          </Link>
          <Breadcrumbs current={current} />
          <span className="topbar-avatar">
            <Avatar name={auth.profile?.display_name} />
          </span>
        </header>
        <main id="main" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<Home />} />
            {destinations.map((d) => (
              <Route
                key={d.path}
                path={d.nested ? `${d.path}/*` : d.path}
                element={<Guard path={d.path}>{pages[d.path]}</Guard>}
              />
            ))}
            <Route
              path="*"
              element={
                <EmptyState
                  title="Página não encontrada"
                  actions={
                    <Link className="button-link" to="/">
                      Voltar ao início
                    </Link>
                  }
                >
                  O endereço acessado não existe ou foi movido.
                </EmptyState>
              }
            />
          </Routes>
        </main>
      </div>
      {drawer && (
        <Drawer
          label="Navegação"
          className="nav-drawer"
          onClose={() => setDrawer(false)}
        >
          <div className="drawer-head">
            <Brand />
            <IconButton
              icon="close"
              label="Fechar navegação"
              className="ghost"
              autoFocus
              onClick={() => setDrawer(false)}
            />
          </div>
          <Menu onNavigate={() => setDrawer(false)} />
          <UserCard />
        </Drawer>
      )}
    </div>
  );
}
class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="center-state">
        <BrandMark className="state-mark" />
        <h1>Não foi possível exibir esta página</h1>
        <p>Tente carregar a aplicação novamente.</p>
        <button className="primary" onClick={() => window.location.reload()}>
          Recarregar
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
export function App() {
  return (
    <ErrorBoundary>
      {!client ? (
        <main className="center-state">
          <BrandMark className="state-mark" />
          <h1>Gaúcha Gestão</h1>
          <Notice>
            Ambiente de desenvolvimento não configurado. Informe a URL e a chave
            pública do Supabase conforme o guia local.
          </Notice>
        </main>
      ) : (
        <BrowserRouter>
          <AuthProvider>
            <Boundary />
          </AuthProvider>
        </BrowserRouter>
      )}
    </ErrorBoundary>
  );
}
