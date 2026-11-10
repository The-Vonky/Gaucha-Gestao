/*
 * Design System white-label v1 — isolated gallery. No authentication, no
 * Supabase client and no network: every brand, name and number is fictitious.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  BrandProvider,
  ColorModeProvider,
  ThemeRoot,
  isColorModePreference,
  useBrand,
  useColorMode,
  type ColorModePreference,
} from "../shared/theme/ThemeProvider";
import { Breadcrumbs, Field, OrganizationMark, SegmentedControl, Tabs } from "../shared/theme/controls";
import { CONTRAST_PAIRS } from "../shared/theme/contrastPairs";
import { contrastRatio } from "../shared/theme/contrast";
import { BRAND_SCALES, SCALE_STEPS } from "../shared/theme/brand";
import {
  Badge,
  Confirm,
  Drawer,
  EmptyState,
  Form,
  IconButton,
  LoadingState,
  Metric,
  Modal,
  Notice,
  Pager,
  Table,
  type BadgeTone,
} from "../shared/ui";
import { Icon } from "../shared/icons";
import { DEMO_BRANDS, findDemoBrand } from "./brands";
import "./gallery.css";

const SECTIONS = [
  { id: "fundamentos", label: "Fundamentos" },
  { id: "botoes", label: "Botões" },
  { id: "campos", label: "Campos e seleção" },
  { id: "status", label: "Badges e alertas" },
  { id: "cards", label: "Cards" },
  { id: "tabela", label: "Tabela" },
  { id: "navegacao", label: "Navegação" },
  { id: "metricas", label: "Métricas" },
  { id: "vazios", label: "Estados vazios" },
  { id: "dialogos", label: "Diálogos" },
  { id: "acessibilidade", label: "Acessibilidade" },
] as const;

const MODE_OPTIONS: readonly { value: ColorModePreference; label: string; hint: string }[] = [
  { value: "light", label: "Claro", hint: "Sempre claro" },
  { value: "dark", label: "Escuro", hint: "Sempre escuro" },
  { value: "system", label: "Automático", hint: "Segue a preferência do sistema operacional" },
];

const SEMANTIC_SWATCHES = [
  ["--color-bg", "Fundo"],
  ["--color-surface", "Superfície"],
  ["--color-surface-sunken", "Superfície rebaixada"],
  ["--color-border", "Borda"],
  ["--color-text", "Texto"],
  ["--color-text-secondary", "Texto secundário"],
  ["--color-action", "Ação primária"],
  ["--color-focus", "Foco"],
  ["--color-surface-brand", "Superfície de marca"],
  ["--success", "Sucesso"],
  ["--warning", "Atenção"],
  ["--danger", "Erro"],
  ["--info", "Informação"],
] as const;

const REQUESTS: readonly { id: string; title: string; unit: string; tone: BadgeTone; status: string; updated: string }[] = [
  { id: "SOL-1042", title: "Acesso ao módulo de relatórios", unit: "Unidade Centro", tone: "info", status: "Em análise", updated: "10/11/2026" },
  { id: "SOL-1041", title: "Revisão de cadastro de fornecedor", unit: "Unidade Norte", tone: "warning", status: "Aguardando", updated: "09/11/2026" },
  { id: "SOL-1039", title: "Manutenção preventiva", unit: "Unidade Sul", tone: "success", status: "Concluída", updated: "08/11/2026" },
  { id: "SOL-1036", title: "Ajuste de escala de equipe", unit: "Unidade Centro", tone: "danger", status: "Atrasada", updated: "03/11/2026" },
  { id: "SOL-1030", title: "Compra de material de escritório", unit: "Unidade Leste", tone: "neutral", status: "Rascunho", updated: "29/10/2026" },
];

function readQuery(): { brandId: string; mode?: ColorModePreference } {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  return { brandId: findDemoBrand(params.get("brand")).id, mode: isColorModePreference(mode) ? mode : undefined };
}

export function DesignSystemGallery() {
  const [initial] = useState(readQuery);
  const [brandId, setBrandId] = useState(initial.brandId);
  return (
    <ColorModeProvider initialPreference={initial.mode} storageKey="hub.design-system.color-mode">
      <BrandProvider brand={findDemoBrand(brandId)}>
        <ThemeRoot className="ds-gallery">
          <GalleryBody onBrandChange={setBrandId} />
        </ThemeRoot>
      </BrandProvider>
    </ColorModeProvider>
  );
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
}

function GalleryBody({ onBrandChange }: { onBrandChange: (id: string) => void }) {
  const brand = useBrand();
  const { preference, mode, setPreference } = useColorMode();
  const [active, setActive] = useState<string>(SECTIONS[0].id);
  // Shareable state in the address, without reloading or adding history entries.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("brand", brand.id);
    url.searchParams.set("mode", preference);
    window.history.replaceState(window.history.state, "", url);
  }, [brand.id, preference]);
  return (
    <>
      <a className="skip" href="#ds-main">
        Pular para o conteúdo
      </a>
      <div className="ds-layout">
        <aside className="ds-sidebar">
          <div className="ds-brand">
            <OrganizationMark size="lg" />
            <div>
              <strong>{brand.shortName}</strong>
              <span>Design System v1.0</span>
            </div>
          </div>
          {brand.fictitious && <span className="ds-fictitious">Marca fictícia</span>}
          <nav aria-label="Seções da galeria">
            <ul>
              {SECTIONS.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    aria-current={active === section.id ? "location" : undefined}
                    onClick={() => setActive(section.id)}
                  >
                    {section.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
        <div className="ds-content">
          <header className="ds-toolbar">
            <div className="ds-heading">
              <p className="eyebrow">Hub · Design System white-label v1.0</p>
              <h1>Galeria de componentes</h1>
              <p>
                Enterprise Modern: tokens primitivos, semânticos e de marca aplicados aos componentes
                existentes da plataforma.
              </p>
            </div>
            <div className="ds-controls">
              <SegmentedControl
                label="Marca da organização"
                value={brand.id}
                options={DEMO_BRANDS.map((b) => ({ value: b.id, label: b.shortName, hint: b.name }))}
                onChange={onBrandChange}
              />
              <SegmentedControl label="Modo de cor" value={preference} options={MODE_OPTIONS} onChange={setPreference} />
            </div>
            <p className="ds-current" role="status">
              Exibindo <strong>{brand.name}</strong> no modo <strong>{mode === "dark" ? "escuro" : "claro"}</strong>
              {preference === "system" ? " (automático, conforme o sistema)" : ""}.
            </p>
          </header>
          <Notice tone="warning">
            <strong>Demonstração isolada.</strong> Marcas, nomes e números são fictícios. Não há autenticação,
            dados reais nem envio ao servidor.
          </Notice>
          <main id="ds-main" tabIndex={-1}>
            <Foundations />
            <Buttons />
            <Fields />
            <StatusSection />
            <Cards />
            <TableSection />
            <Navigation />
            <Metrics />
            <EmptyStates />
            <Dialogs />
            <Accessibility />
          </main>
        </div>
      </div>
    </>
  );
}

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) {
  return (
    <section id={id} className="ds-section" aria-labelledby={`${id}-title`}>
      <header>
        <h2 id={`${id}-title`}>{title}</h2>
        <p>{description}</p>
      </header>
      {children}
    </section>
  );
}

function Foundations() {
  const brand = useBrand();
  return (
    <Section
      id="fundamentos"
      title="Fundamentos"
      description="Escalas de marca fornecidas pela organização e papéis semânticos resolvidos para o modo atual."
    >
      {BRAND_SCALES.map((scale) => (
        <div key={scale} className="ds-scale">
          <h3>{scale === "primary" ? "Marca · primária" : "Marca · acento"}</h3>
          <ul className="ds-swatches" aria-label={`Escala ${scale}`}>
            {SCALE_STEPS.map((step) => (
              <li key={step}>
                <span className="ds-swatch" style={{ background: `var(--brand-${scale}-${step})` }} />
                <span className="ds-swatch-step">{step}</span>
                <code>{brand.colors[scale][step]}</code>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <h3>Tokens semânticos</h3>
      <ul className="ds-semantic">
        {SEMANTIC_SWATCHES.map(([token, label]) => (
          <li key={token}>
            <span className="ds-swatch" style={{ background: `var(${token})` }} />
            <span>
              {label}
              <code>{token}</code>
            </span>
          </li>
        ))}
      </ul>
      <h3>Tipografia</h3>
      <div className="card ds-type">
        <p className="ds-type-page">Título de página</p>
        <p className="ds-type-section">Título de seção</p>
        <p>Texto de leitura em 15 px, com altura de linha confortável para telas operacionais.</p>
        <p className="muted">Texto secundário para descrições e metadados.</p>
        <p className="ds-type-kpi numeric">1.284,50</p>
      </div>
    </Section>
  );
}

function Buttons() {
  return (
    <Section id="botoes" title="Botões" description="Hierarquia: uma ação primária por contexto; ações destrutivas são explícitas.">
      <div className="ds-row">
        <button className="primary" type="button">
          Salvar solicitação
        </button>
        <button type="button">Cancelar</button>
        <button className="ghost" type="button">
          Ver detalhes
        </button>
        <button className="danger" type="button">
          Excluir
        </button>
        <a className="button-link" href="#botoes">
          Botão como link
        </a>
      </div>
      <div className="ds-row">
        <button className="primary small" type="button">
          Pequeno
        </button>
        <button className="small" type="button">
          Pequeno secundário
        </button>
        <button className="primary" type="button" disabled>
          Primário indisponível
        </button>
        <button type="button" disabled>
          Secundário indisponível
        </button>
        <button className="primary" type="button" disabled aria-busy="true">
          Salvando…
        </button>
      </div>
      <div className="ds-row">
        <IconButton icon="search" label="Pesquisar" />
        <IconButton icon="filter" label="Filtrar" />
        <IconButton icon="download" label="Baixar relatório" className="ghost" />
        <button type="button">
          <Icon name="upload" />
          Com ícone
        </button>
      </div>
    </Section>
  );
}

function Fields() {
  return (
    <Section id="campos" title="Campos e seleção" description="Rótulo sempre visível; dica e erro ligados ao campo por aria-describedby.">
      <div className="ds-grid">
        <div className="card">
          <Field label="Nome da solicitação" hint="Use até 80 caracteres.">
            {(props) => <input {...props} placeholder="Ex.: Acesso a relatórios" maxLength={80} />}
          </Field>
          <Field label="E-mail do responsável" error="Informe um e-mail válido.">
            {(props) => <input {...props} type="email" defaultValue="responsavel@" />}
          </Field>
          <Field label="Campo indisponível" hint="Bloqueado enquanto a solicitação é revisada.">
            {(props) => <input {...props} disabled defaultValue="Valor bloqueado" />}
          </Field>
        </div>
        <div className="card">
          <Field label="Unidade">
            {(props) => (
              <select {...props} defaultValue="centro">
                <option value="centro">Unidade Centro</option>
                <option value="norte">Unidade Norte</option>
                <option value="sul">Unidade Sul</option>
              </select>
            )}
          </Field>
          <Field label="Descrição">{(props) => <textarea {...props} rows={3} placeholder="Descreva o pedido" />}</Field>
        </div>
        <div className="card">
          <fieldset className="ds-fieldset">
            <legend>Prioridade</legend>
            {["Baixa", "Média", "Alta"].map((level, i) => (
              <label key={level} className="check">
                <input type="radio" name="ds-priority" defaultChecked={i === 1} /> {level}
              </label>
            ))}
          </fieldset>
          <label className="check">
            <input type="checkbox" defaultChecked /> Notificar a equipe por e-mail
          </label>
          <label className="check">
            <input type="checkbox" disabled /> Opção indisponível
          </label>
        </div>
      </div>
    </Section>
  );
}

function StatusSection() {
  return (
    <Section
      id="status"
      title="Badges e alertas"
      description="Status usa a paleta semântica, nunca a cor da marca, e sempre tem texto além da cor."
    >
      <div className="ds-row">
        <Badge tone="success" icon="success">Concluída</Badge>
        <Badge tone="warning" icon="warning">Aguardando</Badge>
        <Badge tone="danger" icon="error">Atrasada</Badge>
        <Badge tone="info" icon="info">Em análise</Badge>
        <Badge>Rascunho</Badge>
        <Badge tone="success">Ativo</Badge>
      </div>
      <div className="ds-stack">
        <Notice tone="info">Informação: a revisão de acessos ocorre toda segunda-feira.</Notice>
        <Notice tone="success">Sucesso: solicitação registrada (simulação).</Notice>
        <Notice tone="warning">Atenção: há três solicitações aguardando aprovação.</Notice>
        <Notice tone="error">Erro: não foi possível concluir a ação simulada. Tente novamente.</Notice>
      </div>
    </Section>
  );
}

function Cards() {
  return (
    <Section id="cards" title="Cards" description="Superfícies de agrupamento com borda discreta e sem sombra pesada.">
      <div className="ds-grid">
        <article className="card">
          <p className="eyebrow">Solicitações</p>
          <h3>Card básico</h3>
          <p className="muted">Conteúdo curto, com título e uma ação clara.</p>
          <div className="actions">
            <button type="button" className="small">
              Abrir
            </button>
          </div>
        </article>
        <article className="card">
          <div className="ds-card-head">
            <h3>Card com status</h3>
            <Badge tone="warning" icon="warning">
              Aguardando
            </Badge>
          </div>
          <p className="muted">O status fica no topo e repete a informação em texto.</p>
          <dl className="ds-meta">
            <div>
              <dt>Responsável</dt>
              <dd>Pessoa Exemplo</dd>
            </div>
            <div>
              <dt>Prazo</dt>
              <dd>14/11/2026</dd>
            </div>
          </dl>
        </article>
        <a className="card ds-card-link" href="#cards">
          <h3>Card navegável</h3>
          <p className="muted">O card inteiro é um link, com foco visível e hover sutil.</p>
          <span className="ds-card-cta">
            Ver módulo <span aria-hidden="true">→</span>
          </span>
        </a>
      </div>
    </Section>
  );
}

function TableSection() {
  const [page, setPage] = useState(0);
  return (
    <Section id="tabela" title="Tabela" description="Cabeçalho fixo em estilo, números tabulares e rolagem horizontal própria no celular.">
      <Table headers={["Protocolo", "Solicitação", "Unidade", "Status", "Atualizado", "Ações"]}>
        {REQUESTS.map((row) => (
          <tr key={row.id}>
            <td className="identifier">{row.id}</td>
            <td>{row.title}</td>
            <td>{row.unit}</td>
            <td>
              <Badge tone={row.tone}>{row.status}</Badge>
            </td>
            <td className="numeric">{row.updated}</td>
            <td>
              <div className="row-actions">
                <button type="button" aria-label={`Abrir ${row.id}`}>
                  Abrir
                </button>
              </div>
            </td>
          </tr>
        ))}
      </Table>
      <Pager page={page} count={48} size={5} onChange={setPage} />
    </Section>
  );
}

function Navigation() {
  const [tab, setTab] = useState("resumo");
  return (
    <Section
      id="navegacao"
      title="Navegação"
      description="Menu lateral (à esquerda), trilha, abas com setas do teclado e paginação."
    >
      <div className="card ds-stack">
        <Breadcrumbs
          items={[
            { label: "Início", href: "#navegacao" },
            { label: "Solicitações", href: "#navegacao" },
            { label: "SOL-1042" },
          ]}
        />
        <Tabs
          label="Detalhes da solicitação"
          selected={tab}
          onSelect={setTab}
          items={[
            { id: "resumo", label: "Resumo", content: <p>Resumo fictício da solicitação SOL-1042.</p> },
            { id: "atividades", label: "Atividades", content: <p>Três atividades registradas (simulação).</p> },
            { id: "anexos", label: "Anexos", content: <p>Nenhum anexo nesta demonstração.</p> },
          ]}
        />
      </div>
    </Section>
  );
}

function Metrics() {
  return (
    <Section id="metricas" title="Métricas" description="Indicadores com rótulo, valor tabular e tom semântico opcional.">
      <div className="ds-metrics">
        <Metric label="Solicitações abertas" value="128" hint="Últimos 30 dias" />
        <Metric label="Concluídas" value="342" tone="success" hint="+8% sobre o mês anterior" />
        <Metric label="Aguardando" value="19" tone="warning" hint="Dependem de aprovação" />
        <Metric label="Atrasadas" value="7" tone="danger" hint="Fora do prazo acordado" />
      </div>
    </Section>
  );
}

function EmptyStates() {
  return (
    <Section id="vazios" title="Estados vazios" description="Explicam a ausência de dados e oferecem o próximo passo.">
      <div className="ds-stack">
        <EmptyState
          title="Nenhuma solicitação encontrada"
          mark={<OrganizationMark size="lg" />}
          actions={
            <button type="button" className="primary">
              Nova solicitação
            </button>
          }
        >
          Ajuste os filtros ou registre uma nova solicitação para começar.
        </EmptyState>
        <div className="card">
          <LoadingState label="Carregando solicitações…" mark={<OrganizationMark size="lg" />} />
        </div>
      </div>
    </Section>
  );
}

function Dialogs() {
  const [open, setOpen] = useState<"modal" | "confirm" | "drawer" | null>(null);
  const [result, setResult] = useState("");
  return (
    <Section
      id="dialogos"
      title="Diálogos"
      description="Diálogos nativos: foco preso, Esc fecha e o foco volta ao botão que abriu."
    >
      <div className="ds-row">
        <button type="button" className="primary" onClick={() => setOpen("modal")}>
          Abrir formulário
        </button>
        <button type="button" className="danger" onClick={() => setOpen("confirm")}>
          Excluir rascunho
        </button>
        <button type="button" onClick={() => setOpen("drawer")}>
          Abrir painel lateral
        </button>
      </div>
      {result && <Notice tone="success">{result}</Notice>}
      {open === "modal" && (
        <Modal title="Nova solicitação" onClose={() => setOpen(null)}>
          <Form
            onCancel={() => setOpen(null)}
            onSave={async () => {
              setResult("Solicitação salva (simulação; nada foi enviado).");
              setOpen(null);
            }}
          >
            <Field label="Título">{(props) => <input {...props} name="title" required />}</Field>
          </Form>
        </Modal>
      )}
      {open === "confirm" && (
        <Confirm
          title="Excluir rascunho?"
          description="O rascunho fictício SOL-1030 será removido desta demonstração."
          onClose={() => setOpen(null)}
          onConfirm={async () => setResult("Rascunho excluído (simulação).")}
        />
      )}
      {open === "drawer" && (
        <Drawer label="Painel lateral" onClose={() => setOpen(null)}>
          <div className="ds-drawer">
            <div className="ds-card-head">
              <h2>Filtros</h2>
              <IconButton icon="close" label="Fechar painel" className="ghost" autoFocus onClick={() => setOpen(null)} />
            </div>
            <Field label="Status">
              {(props) => (
                <select {...props}>
                  <option>Todos</option>
                  <option>Em análise</option>
                  <option>Concluída</option>
                </select>
              )}
            </Field>
          </div>
        </Drawer>
      )}
    </Section>
  );
}

function ContrastReport() {
  const ref = useRef<HTMLDivElement>(null);
  const brand = useBrand();
  const { mode } = useColorMode();
  const [rows, setRows] = useState<{ label: string; min: number; ratio: number | null }[]>([]);
  useLayoutEffect(() => {
    const root = ref.current?.closest(".hub-theme");
    if (!root) return;
    const style = getComputedStyle(root);
    setRows(
      CONTRAST_PAIRS.map((pair) => ({
        label: pair.label,
        min: pair.min,
        ratio: contrastRatio(style.getPropertyValue(pair.foreground), style.getPropertyValue(pair.background)),
      })),
    );
  }, [brand.id, mode]);
  const measured = rows.filter((row) => row.ratio !== null);
  const passing = measured.filter((row) => row.ratio! >= row.min);
  return (
    <div ref={ref} className="ds-stack">
      <p className="ds-contrast-summary" data-testid="contrast-summary">
        {measured.length === 0 ? (
          <Badge>Contraste não medido neste ambiente</Badge>
        ) : (
          <Badge tone={passing.length === measured.length ? "success" : "danger"} icon={passing.length === measured.length ? "success" : "error"}>
            {passing.length} de {measured.length} pares atendem WCAG AA
          </Badge>
        )}
      </p>
      <Table headers={["Par de tokens", "Razão", "Mínimo", "Resultado"]}>
        {rows.map((row) => (
          <tr key={row.label}>
            <td>{row.label}</td>
            <td className="numeric">{row.ratio === null ? "—" : `${row.ratio.toFixed(2)}:1`}</td>
            <td className="numeric">{row.min}:1</td>
            <td>
              {row.ratio === null ? (
                <Badge>Não medido</Badge>
              ) : row.ratio >= row.min ? (
                <Badge tone="success">Atende</Badge>
              ) : (
                <Badge tone="danger">Falha</Badge>
              )}
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function Accessibility() {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)");
  return (
    <Section
      id="acessibilidade"
      title="Acessibilidade"
      description="Contraste medido ao vivo para a marca e o modo atuais, a partir dos valores calculados pelo navegador."
    >
      <ul className="ds-facts">
        <li>
          Movimento reduzido: <strong>{reduced ? "ativo — animações e transições desligadas" : "inativo"}</strong>
        </li>
        <li>
          Preferência de cor do sistema: <strong>{systemDark ? "escuro" : "claro"}</strong>
        </li>
        <li>
          Teclado: <kbd>Tab</kbd> percorre os controles, <kbd>Setas</kbd> trocam marca, modo e abas, <kbd>Esc</kbd>{" "}
          fecha diálogos.
        </li>
      </ul>
      <ContrastReport />
    </Section>
  );
}
