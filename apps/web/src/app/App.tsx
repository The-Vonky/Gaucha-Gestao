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
import { AuditEntry } from "../modules/audit/AuditEntry";
import { Modal, Notice, PageTitle } from "../shared/ui";
import { destinations, visibleNavigation } from "./navigation";
function Logout() {
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
      <button disabled={busy} onClick={() => void logout()}>
        {busy ? "Saindo…" : "Sair"}
      </button>
      {error && <Notice error>Não foi possível sair. Tente novamente.</Notice>}
    </>
  );
}
function Boundary() {
  const auth = useAuth();
  if (auth.loading)
    return (
      <main className="center-state">
        <Notice>Carregando seu acesso…</Notice>
      </main>
    );
  if (!auth.session) return <Login />;
  if (auth.error)
    return (
      <main className="center-state">
        <Notice error>{auth.error}</Notice>
        <button onClick={auth.refresh}>Tentar novamente</button>
        <Logout />
      </main>
    );
  if (!auth.profile?.active)
    return (
      <main className="center-state">
        <h1>Acesso indisponível</h1>
        <p>
          Sua conta está inativa ou não possui um perfil disponível. Fale com a
          administração.
        </p>
        <button onClick={auth.refresh}>Atualizar acesso</button>
        <Logout />
      </main>
    );
  return <Shell />;
}
function Menu({ onNavigate }: { onNavigate?: () => void }) {
  const auth = useAuth();
  const nav = visibleNavigation(!!auth.profile?.active, auth.grants);
  return (
    <nav aria-label="Navegação principal">
      <NavLink to="/" end onClick={onNavigate}>
        Início
      </NavLink>
      {nav.map((group) => (
        <section key={group.group}>
          <h2>{group.group}</h2>
          {group.destinations.map((d) => (
            <NavLink key={d.path} to={d.path} onClick={onNavigate}>
              {d.label}
            </NavLink>
          ))}
        </section>
      ))}
    </nav>
  );
}
function Home() {
  const auth = useAuth();
  const entries = visibleNavigation(!!auth.profile?.active, auth.grants);
  return (
    <>
      <PageTitle
        title={`Olá, ${auth.profile?.display_name}`}
        description="Selecione uma área para continuar."
      />
      {!entries.length ? (
        <Notice>
          Sua conta ainda não possui permissões para as áreas disponíveis.
          Solicite uma atribuição à administração.
        </Notice>
      ) : (
        <div className="entry-grid">
          {entries.flatMap((g) =>
            g.destinations.map((d) => (
              <Link className="entry-card" key={d.path} to={d.path}>
                <span className="eyebrow">{g.group}</span>
                <h2>{d.label}</h2>
                <span>
                  Acessar área <span aria-hidden="true">→</span>
                </span>
              </Link>
            )),
          )}
        </div>
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
      <Link to="/">Voltar ao início</Link>
    </>
  );
}
function Shell() {
  const auth = useAuth();
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    document.getElementById("main")?.focus();
  }, [location.pathname]);
  const pages: Record<string, ReactNode> = {
    "/audit": <AuditEntry />,
    "/admin/users": <UsersPage />,
    "/admin/roles": <RolesPage />,
    "/admin/permissions": <PermissionsPage />,
    "/admin/units": <OrganizationPage kind="units" />,
    "/admin/sectors": <OrganizationPage kind="sectors" />,
    "/admin/logs": <LogsPage />,
  };
  return (
    <div className="layout">
      <a className="skip" href="#main">
        Ir para o conteúdo
      </a>
      <aside className="sidebar">
        <Link className="brand" to="/">
          <span className="brand-mark">G</span>
          <span>
            Gaúcha<small>GESTÃO</small>
          </span>
        </Link>
        <Menu />
        <p className="sidebar-foot">Plataforma corporativa</p>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="mobile-menu"
            aria-haspopup="dialog"
            aria-expanded={drawer}
            onClick={() => setDrawer(true)}
          >
            ☰ <span>Menu</span>
          </button>
          <span className="workspace-name">Gestão corporativa</span>
          <div className="account">
            <span>{auth.profile?.display_name}</span>
            <Logout />
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<Home />} />
            {destinations.map((d) => (
              <Route
                key={d.path}
                path={d.path}
                element={<Guard path={d.path}>{pages[d.path]}</Guard>}
              />
            ))}
            <Route
              path="*"
              element={
                <>
                  <h1>Página não encontrada</h1>
                  <Link to="/">Voltar ao início</Link>
                </>
              }
            />
          </Routes>
        </main>
      </div>
      {drawer && (
        <Modal title="Navegação" onClose={() => setDrawer(false)}>
          <Menu onNavigate={() => setDrawer(false)} />
        </Modal>
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
        <h1>Não foi possível exibir esta página</h1>
        <p>Tente carregar a aplicação novamente.</p>
        <button onClick={() => window.location.reload()}>Recarregar</button>
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
