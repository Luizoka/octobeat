import { useEffect, useRef, useState } from "react";
import { init, isAuthEnabled, MIN_PASSWORD_LENGTH, signInWithGoogle, signInWithUsername, signUpWithUsername } from "../identity/auth.js";
import { AccountDialog } from "./AccountDialog.jsx";
import { SegmentedTabs } from "./SegmentedTabs.jsx";
import { UsernameAvailability } from "./UsernameAvailability.jsx";

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

export function AuthDialog({ beforeGoogle, onClose, onSuccess, restoreError }) {
  const [creating, setCreating] = useState(false);
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const active = useRef(false);
  const submitting = useRef(false);
  const enabled = isAuthEnabled();

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  async function run(action) {
    if (!enabled || submitting.current) return;
    setError("");
    submitting.current = true;
    setBusy(true);
    try {
      await action();
    } catch (reason) {
      if (active.current) setError(reason.message);
    } finally {
      submitting.current = false;
      if (active.current) setBusy(false);
    }
  }

  function authenticate(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = form.get("password");
    void run(async () => {
      if (creating && form.get("confirmation") !== password) throw new Error("As senhas não coincidem.");
      await (creating ? signUpWithUsername : signInWithUsername)(username, password);
      if (active.current) onSuccess();
    });
  }

  function authenticateWithGoogle() {
    void run(async () => {
      const undo = beforeGoogle?.();
      try {
        await signInWithGoogle();
      } catch (reason) {
        undo?.();
        throw reason;
      }
    });
  }

  function retrySession() {
    void run(async () => {
      const identity = await init();
      if (identity.status === "ready" || identity.status === "needsProfile") onSuccess();
    });
  }

  function changeMode(index) {
    setCreating(index === 1);
    setError("");
  }

  return (
    <AccountDialog title="Conta do ranking" className="auth-panel" onClose={onClose}>
      <div className="account-body">
        {restoreError && <div className="ranked-actions">
          {!error && <p role="alert">{restoreError}</p>}
          <button className="menu-button" type="button" disabled={busy} onClick={retrySession}>Verificar sessão novamente</button>
        </div>}
        <SegmentedTabs label="Acesso à conta" labels={["Entrar", "Criar conta"]} selected={Number(creating)}
          onSelect={changeMode} disabled={busy}>
          <form className="ranked-form" onSubmit={authenticate}>
            <label>Usuário<input name="username" value={username} onChange={(event) => setUsername(event.target.value)}
              autoComplete="username" autoCapitalize="none" spellCheck={false}
              required data-initial-focus /></label>
            {creating && enabled && <UsernameAvailability username={username} />}
            <label>Senha
              <span className="password-field">
                <input name="password" type={showPassword ? "text" : "password"}
                  autoComplete={creating ? "new-password" : "current-password"}
                  minLength={creating ? MIN_PASSWORD_LENGTH : undefined} required />
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
        <button className="menu-button" type="button" onClick={authenticateWithGoogle} disabled={!enabled || busy}>
          Entrar com Google
        </button>
      </div>
    </AccountDialog>
  );
}
