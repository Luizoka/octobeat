import { useState } from "react";
import { createProfile, deleteAccount, passwordProfileUsername, signOut } from "../identity/auth.js";
import { normalizeUsername, passwordAccountEmail, stripAccents } from "../identity/username.js";
import { AccountDialog } from "./AccountDialog.jsx";
import { DeleteAccountForm } from "./DeleteAccountForm.jsx";
import { UsernameAvailability } from "./UsernameAvailability.jsx";

export function ProfileSetup({ user, onClose, onSuccess }) {
  const fixed = passwordProfileUsername(user);
  const name = user.name ?? "";
  const suggestion = normalizeUsername(stripAccents(name).replace(/[^A-Za-z0-9 ]/g, " ").slice(0, 255));
  const [username, setUsername] = useState(fixed && passwordAccountEmail(suggestion) !== user.email ? fixed : suggestion);
  const [action, setAction] = useState(null);
  const [error, setError] = useState(null);
  const busy = Boolean(action);

  async function finish(name, run) {
    if (busy) return;
    setAction(name);
    setError(null);
    try {
      await run();
      onSuccess();
    } catch (reason) {
      setError({ name, message: reason.message });
    } finally {
      setAction(null);
    }
  }

  return (
    <AccountDialog title="Escolha seu nome de usuário" className="auth-panel"
      onClose={action === "delete" ? () => {} : onClose}>
      <div className="account-body">
        <form className="ranked-form" onSubmit={(event) => {
          event.preventDefault();
          // Nome exibido mantém o acento do Google (ex.: "Jogador Anônimo").
          void finish("create", () => createProfile(username, fixed ? null : normalizeUsername(name) || null));
        }}>
          <label>Usuário<input value={username} onChange={(event) => setUsername(stripAccents(event.target.value))}
            autoCapitalize="none" autoComplete="username" spellCheck={false} readOnly={Boolean(fixed)}
            required data-initial-focus /></label>
          {!fixed && <UsernameAvailability username={username} />}
          {error && error.name !== "delete" && <p role="alert">{error.message}</p>}
          <div className="ranked-actions">
            <button className="play-button" type="submit" disabled={busy}>{action === "create" ? "Aguarde…" : "Criar perfil"}</button>
            <button className="menu-button" type="button" disabled={busy} onClick={() => finish("leave", signOut)}>Sair</button>
          </div>
        </form>
        <DeleteAccountForm busy={busy} deleting={action === "delete"}
          onCancel={() => { if (error?.name === "delete") setError(null); }}
          error={error?.name === "delete" ? error.message : ""} onDelete={(confirm) => finish("delete", () => deleteAccount(confirm))} />
      </div>
    </AccountDialog>
  );
}
