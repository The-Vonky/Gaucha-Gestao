import { StrictMode, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import "../shared/styles/tokens.css";
import "./tailwind.css";

const surfaces = [
  {
    title: "Superfície operacional",
    detail: "Tipografia, espaçamento e bordas reutilizam os tokens Elo.",
    status: "Sem dados de negócio",
  },
  {
    title: "Responsividade",
    detail: "Uma coluna no celular, duas a partir de 600px e três em 1440px.",
    status: "Breakpoints Elo",
  },
  {
    title: "Acessibilidade",
    detail: "Controle com rótulo, foco visível, navegação por teclado e alvo de toque.",
    status: "Teste manual pendente",
  },
] as const;

function Probe() {
  const [showNotice, setShowNotice] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <div className="tw:min-h-screen tw:bg-elo-bg tw:font-elo tw:text-elo-body tw:text-elo-text">
      <a
        href="#conteudo"
        className="tw:sr-only focus:tw:not-sr-only focus:tw:absolute focus:tw:left-4 focus:tw:top-4 focus:tw:z-50 focus:tw:bg-elo-surface focus:tw:p-elo-4"
      >
        Pular para o conteúdo
      </a>
      <header className="tw:border-b tw:border-solid tw:border-elo-border tw:bg-elo-surface">
        <div className="tw:mx-auto tw:flex tw:max-w-6xl tw:items-center tw:justify-between tw:gap-elo-4 tw:px-elo-4 tw:py-elo-4 sm:tw:px-elo-6">
          <strong className="tw:font-elo-display">Gaúcha Gestão / Elo</strong>
          <span className="tw:text-elo-caption tw:text-elo-muted">UI-00 · ambiente de prova</span>
        </div>
      </header>
      <main id="conteudo" className="tw:mx-auto tw:max-w-6xl tw:px-elo-4 tw:py-elo-8 sm:tw:px-elo-6">
        <div className="tw:mb-8">
          <p className="tw:mb-2 tw:text-elo-caption tw:font-semibold tw:text-elo-muted">
            Experimento sem autenticação ou dados reais
          </p>
          <h1 className="tw:my-0 tw:font-elo-display tw:text-elo-title tw:font-semibold">
            Tailwind CSS v4 + tokens Elo
          </h1>
          <p className="tw:max-w-3xl tw:text-elo-muted">
            Esta página é deliberadamente separada do Login, do menu e dos módulos corporativos.
          </p>
        </div>
        <div className="tw:grid tw:grid-cols-1 tw:gap-elo-4 sm:tw:grid-cols-2 lg:tw:grid-cols-3">
          {surfaces.map((surface) => (
            <article
              key={surface.title}
              className="tw:min-w-0 tw:rounded-elo-card tw:border tw:border-solid tw:border-elo-border tw:bg-elo-surface tw:p-elo-6 tw:shadow-elo-card"
            >
              <h2 className="tw:mt-0 tw:font-elo-display tw:text-lg tw:font-semibold">
                {surface.title}
              </h2>
              <p className="tw:text-elo-muted">{surface.detail}</p>
              <span className="tw:rounded-elo-control tw:bg-elo-success-bg tw:px-elo-3 tw:py-elo-2 tw:text-elo-caption tw:font-semibold tw:text-elo-success">
                {surface.status}
              </span>
            </article>
          ))}
        </div>
        <section
          aria-labelledby="controles"
          className="tw:mt-8 tw:rounded-elo-card tw:border tw:border-solid tw:border-elo-border tw:bg-elo-surface tw:p-elo-6"
        >
          <h2 id="controles" className="tw:mt-0 tw:font-elo-display tw:text-lg">
            Controles de demonstração
          </h2>
          <form onSubmit={onSubmit} className="tw:flex tw:flex-col tw:gap-elo-4 sm:tw:max-w-lg">
            <label htmlFor="nome-poc" className="tw:font-semibold">
              Nome fictício
            </label>
            <input
              id="nome-poc"
              name="nome"
              type="text"
              autoComplete="off"
              placeholder="Exemplo de entrada"
              aria-describedby="ajuda-poc"
              className="tw:min-h-[var(--touch-target)] tw:w-full tw:rounded-elo-control tw:border tw:border-solid tw:border-elo-border tw:bg-elo-subtle tw:px-elo-4 tw:py-elo-2 tw:text-base"
            />
            <small id="ajuda-poc" className="tw:text-elo-caption tw:text-elo-muted">
              Nenhuma informação é enviada ao servidor.
            </small>
            <div className="tw:flex tw:flex-wrap tw:gap-elo-3">
              <button
                type="submit"
                className="tw:min-h-[var(--touch-target)] tw:rounded-elo-control tw:border-0 tw:bg-elo-action tw:px-elo-5 tw:font-semibold tw:text-elo-on-action hover:tw:bg-elo-action-hover"
              >
                Verificar estado local
              </button>
              <button
                type="button"
                aria-pressed={showNotice}
                onClick={() => setShowNotice((current) => !current)}
                className="tw:min-h-[var(--touch-target)] tw:rounded-elo-control tw:border tw:border-solid tw:border-elo-border tw:bg-elo-surface tw:px-elo-4"
              >
                Alternar aviso
              </button>
            </div>
            {submitted && <p role="status" className="tw:text-elo-success">Formulário simulado; nada foi persistido.</p>}
          </form>
          {showNotice && (
            <p role="status" className="tw:mt-6 tw:rounded-elo-control tw:bg-elo-warning-bg tw:p-elo-4 tw:text-elo-warning">
              Aviso semântico: a cor de status não utiliza a cor da marca.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Probe />
  </StrictMode>,
);
