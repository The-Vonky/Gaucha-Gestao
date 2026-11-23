import { useRef, useState, type FormEvent } from "react";
import { client } from "../client";
import { Notice } from "../../shared/ui";
import {
  defineEmployeePassword, identityErrorMessage, MAX_EMPLOYEE_PASSWORD_BYTES, MIN_EMPLOYEE_PASSWORD_LENGTH,
} from "./identity";
import "./FirstPassword.css";

export function FirstPassword({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);

  async function leave() {
    try {
      const { error: logoutError } = await client!.auth.signOut({ scope: "local" });
      if (logoutError) throw logoutError;
    } catch {
      setError("Não foi possível encerrar a sessão. Tente sair novamente.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || finished) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await defineEmployeePassword(
        token,
        String(data.get("current_password")),
        String(data.get("password")),
        String(data.get("confirmation")),
      );
      form.reset();
      setFinished(true);
      await leave();
    } catch (err) {
      setError(identityErrorMessage(err));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="center-state first-password">
      <header>
        <h1>Defina sua senha</h1>
        <p>Use sua senha temporária e escolha uma senha definitiva com pelo menos {MIN_EMPLOYEE_PASSWORD_LENGTH} caracteres.</p>
      </header>
      {error && <Notice error>{error}</Notice>}
      {finished ? (
        <>
          <Notice>Senha alterada. Entre novamente com a senha definitiva.</Notice>
          <div className="first-password-actions">
            <button className="danger" disabled={busy} type="button" onClick={() => void leave()}>Sair</button>
          </div>
        </>
      ) : (
        <form onSubmit={(event) => void submit(event)}>
          <fieldset disabled={busy}>
            <label>Senha temporária
              <input required maxLength={MAX_EMPLOYEE_PASSWORD_BYTES} name="current_password" type="password" autoComplete="current-password" />
            </label>
            <label>Nova senha
              <input required minLength={MIN_EMPLOYEE_PASSWORD_LENGTH} maxLength={MAX_EMPLOYEE_PASSWORD_BYTES} name="password" type="password" autoComplete="new-password" />
            </label>
            <label>Confirme a nova senha
              <input required minLength={MIN_EMPLOYEE_PASSWORD_LENGTH} maxLength={MAX_EMPLOYEE_PASSWORD_BYTES} name="confirmation" type="password" autoComplete="new-password" />
            </label>
            <div className="first-password-actions">
              <button className="danger" type="button" onClick={() => void leave()}>Sair</button>
              <button className="primary" type="submit">{busy ? "Alterando…" : "Alterar senha e sair"}</button>
            </div>
          </fieldset>
        </form>
      )}
    </main>
  );
}
