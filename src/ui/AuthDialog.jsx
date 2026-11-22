import { useEffect, useRef, useState } from "react";
import { isLeaderboardEnabled, login, register } from "../leaderboard/client.js";
import { validateCredentials } from "../leaderboard/validation.js";
import { AccountDialog } from "./AccountDialog.jsx";
import { SegmentedTabs } from "./SegmentedTabs.jsx";

// Olho aberto = "mostrar"; olho riscado = "esconder".
function EyeIcon({ open }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {!open && <path d="M4 4l16 16" />}
    </svg>
  );
}

export function AuthDialog({ onClose, onSuccess }) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const active = useRef(false);
  const submitting = useRef(false);
  const enabled = isLeaderboardEnabled();

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  async function authenticate(event) {
    event.preventDefault();
    if (!enabled || submitting.current) return;
    const form = new FormData(event.currentTarget);
    const password = form.get("password");
    setError("");
    submitting.current = true;
    setBusy(true);
    try {
      const credentials = validateCredentials(form.get("username"), password);
      if (creating && form.get("confirmation") !== password) throw new Error("As senhas não coincidem.");
      const session = await (creating ? register : login)(credentials);
      if (typeof session?.username !== "string" || !/^[0-9a-f]{64}$/.test(session.token)) {
        throw new Error("Não foi possível iniciar a sessão. Tente novamente.");
      }
      if (active.current) onSuccess(session);
    } catch (reason) {
      if (active.current) setError(reason.message);
    } finally {
      submitting.current = false;
      if (active.current) setBusy(false);
    }
  }

  function changeMode(index) {
    setCreating(index === 1);
    setError("");
  }

  return (
    <AccountDialog title="Conta do ranking" className="auth-panel" onClose={onClose}>
      <div className="account-body">
        <SegmentedTabs label="Acesso à conta" labels={["Entrar", "Criar conta"]} selected={Number(creating)}
          onSelect={changeMode} disabled={busy}>
          <form className="ranked-form" onSubmit={authenticate}>
            <label>Usuário<input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false}
              required data-initial-focus /></label>
            <label>Senha
              <span className="password-field">
                <input name="password" type={showPassword ? "text" : "password"}
                  autoComplete={creating ? "new-password" : "current-password"} required />
                <button className="password-toggle" type="button" aria-pressed={showPassword}
                  aria-label={showPassword ? "Esconder senha" : "Mostrar senha"}
                  title={showPassword ? "Esconder senha" : "Mostrar senha"}
                  onClick={() => setShowPassword((value) => !value)}>
                  <EyeIcon open={!showPassword} />
                </button>
              </span>
            </label>
            {creating && <label>Confirmar senha<input name="confirmation" type={showPassword ? "text" : "password"}
              autoComplete="new-password" required /></label>}
            {!enabled && <p role="status">Ranking online indisponível.</p>}
            {error && <p role="alert">{error}</p>}
            <button className="play-button" type="submit" disabled={!enabled || busy}>
              {busy ? "Aguarde…" : creating ? "Criar conta" : "Entrar"}
            </button>
          </form>
        </SegmentedTabs>
      </div>
    </AccountDialog>
  );
}
