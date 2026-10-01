import { useState, type FormEvent } from "react";
import { client } from "../client";
import { Notice } from "../../shared/ui";
import { BrandMark } from "../../shared/brand";
import logo from "../../assets/gaucha-alimentacao-logo.png";
import "./Login.css";

export function Login() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");

    try {
      const result = await client!.auth.signInWithPassword({
        email: String(data.get("email")).trim(),
        password: String(data.get("password")),
      });

      if (result.error) {
        setError(
          "Não foi possível entrar. Confira suas credenciais e tente novamente.",
        );
      }
    } catch {
      setError("Conexão indisponível. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-v2">
      <section className="login-v2-brand" aria-label="Gaúcha Gestão">
        <div className="login-v2-product">
          <BrandMark className="login-v2-product-mark" />
          <span className="login-v2-product-copy">
            <strong>Gaúcha Gestão</strong>
            <small>Plataforma corporativa</small>
          </span>
        </div>

        <div className="login-v2-message">
          <span className="login-v2-accent" aria-hidden="true" />
          <p className="login-v2-headline">
            <span className="login-v2-headline-lead">Gestão da operação,</span>{" "}
            com clareza e controle.
          </p>
          <p className="login-v2-subtitle">
            Informação, processos e gestão das unidades em um ambiente único,
            seguro e rastreável.
          </p>
        </div>

        <div className="login-v2-signature login-v2-signature-desktop">
          <span>Uma plataforma</span>
          <span className="login-v2-company-logo-box">
            <img src={logo} alt="Gaúcha Alimentação" />
          </span>
        </div>
      </section>

      <section className="login-v2-main" aria-labelledby="login-title">
        <div className="login-v2-card">
          <h1 id="login-title">Entrar na plataforma</h1>
          <p className="login-v2-support">
            Use o e-mail e a senha fornecidos pela administração.
          </p>

          <form
            className="login-v2-form"
            aria-busy={busy}
            onSubmit={(e) => void submit(e)}
          >
            <fieldset disabled={busy}>
              <label htmlFor="login-email">
                E-mail
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  enterKeyHint="next"
                  required
                />
              </label>

              <label htmlFor="login-password">
                Senha
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  enterKeyHint="go"
                  required
                />
              </label>

              {error && <Notice error>{error}</Notice>}

              <button
                className={`primary login-v2-submit${busy ? " is-busy" : ""}`}
                type="submit"
              >
                {busy && (
                  <span className="login-v2-spinner" aria-hidden="true" />
                )}
                <span>{busy ? "Entrando…" : "Entrar"}</span>
              </button>
            </fieldset>
          </form>

          <p className="login-v2-help">
            Precisa de acesso ou redefinição de senha?{" "}
            <strong>Fale com a administração.</strong>
          </p>
        </div>

        <div className="login-v2-signature login-v2-signature-mobile">
          <span>Uma plataforma</span>
          <img src={logo} alt="Gaúcha Alimentação" />
        </div>

        <p className="login-v2-foot">© 2026 Gaúcha Alimentação</p>
      </section>
    </main>
  );
}
