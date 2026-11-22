import { useState } from "react";
import { createProfile, passwordProfileUsername, signOut } from "../identity/auth.js";
import { normalizeUsername, passwordAccountEmail } from "../identity/username.js";
import { AccountDialog } from "./AccountDialog.jsx";
import { UsernameAvailability } from "./UsernameAvailability.jsx";

export function ProfileSetup({ user, onClose, onSuccess }) {
  const fixed = passwordProfileUsername(user);
  const name = user.name ?? "";
  const suggestion = normalizeUsername(name.normalize("NFD").replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9 ]/g, " ").slice(0, 255));
  const [username, setUsername] = useState(fixed && passwordAccountEmail(suggestion) !== user.email ? fixed : suggestion);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function finish(action) {
    setBusy(true);
    setError("");
    try {
      await action();
      onSuccess();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccountDialog title="Escolha seu nome de usuário" className="auth-panel" onClose={onClose}>
      <div className="account-body">
        <form className="ranked-form" onSubmit={(event) => {
          event.preventDefault();
          void finish(() => createProfile(username));
        }}>
          <label>Usuário<input value={username} onChange={(event) => setUsername(event.target.value)}
            autoCapitalize="none" autoComplete="username" spellCheck={false} readOnly={Boolean(fixed)}
            required data-initial-focus /></label>
          {!fixed && <UsernameAvailability username={username} />}
          {error && <p role="alert">{error}</p>}
          <div className="ranked-actions">
            <button className="play-button" type="submit" disabled={busy}>{busy ? "Aguarde…" : "Criar perfil"}</button>
            <button className="menu-button" type="button" disabled={busy} onClick={() => finish(signOut)}>Sair</button>
          </div>
        </form>
      </div>
    </AccountDialog>
  );
}
