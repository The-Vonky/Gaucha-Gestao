import { useState, type FormEvent } from "react";
import { client } from "../client";
import { Notice } from "../../shared/ui";
import { BrandArcs, BrandMark } from "../../shared/brand";
import { Icon } from "../../shared/icons";
import logo from "../../assets/gaucha-alimentacao-logo.png";
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
      if (result.error)
        setError(
          "Não foi possível entrar. Confira suas credenciais e tente novamente.",
        );
    } catch {
      setError("Conexão indisponível. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <section className="login-brand">
        <BrandArcs />
        <div className="login-brand-body">
          <BrandMark />
          <p className="eyebrow">Plataforma corporativa</p>
          <h1>
            Gaúcha <br />
            Gestão
          </h1>
          <p className="login-tagline">
            Um só lugar para a gestão da nossa operação.
          </p>
        </div>
        <p className="login-brand-foot">Gaúcha Alimentação · Uso interno</p>
      </section>
      <section className="login-form">
        <img className="login-logo" src={logo} alt="Gaúcha Alimentação" />
        <h2>Acesse sua conta</h2>
        <p>Use o acesso fornecido pela administração.</p>
        <form onSubmit={(e) => void submit(e)}>
          <fieldset disabled={busy}>
            <label>
              E-mail
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
              />
            </label>
            <label>
              Senha
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            {error && <Notice error>{error}</Notice>}
            <button className="primary" type="submit">
              {busy ? "Entrando…" : "Entrar"}
              {!busy && <Icon name="arrowRight" />}
            </button>
          </fieldset>
        </form>
        <p className="muted login-help">
          Precisa de acesso ou redefinição de senha? Fale com a administração.
        </p>
      </section>
    </main>
  );
}
