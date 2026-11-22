import { useState } from "react";
import { matchesDeletionConfirmation } from "../identity/username.js";

export function DeleteAccountForm({ profileSlug, busy, deleting, error, onDelete, onCancel }) {
  const [opened, setOpened] = useState(false);
  const [confirm, setConfirm] = useState("");
  const expected = profileSlug ? `@${profileSlug}` : "excluir";

  if (!opened) {
    return <button className="ranked-link small-account-link" type="button" disabled={busy} onClick={() => setOpened(true)}>
      {profileSlug ? "Excluir minha conta" : "Excluir esta conta"}
    </button>;
  }

  return (
    <form className="ranked-form delete-account-form" onSubmit={(event) => {
      event.preventDefault();
      if (!busy && matchesDeletionConfirmation(confirm, profileSlug)) onDelete(confirm);
    }}>
      <p>A exclusão apaga seu perfil, suas pontuações e seu login. Essa ação é irreversível.</p>
      <label>Digite {expected} para confirmar
        <input value={confirm} onChange={(event) => setConfirm(event.target.value)}
          autoComplete="off" autoCapitalize="none" spellCheck={false} disabled={busy} autoFocus required />
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="ranked-actions">
        <button className="menu-button delete-account-button" type="submit"
          disabled={busy || !matchesDeletionConfirmation(confirm, profileSlug)}>
          {deleting ? "Excluindo…" : "Excluir para sempre"}
        </button>
        <button className="menu-button" type="button" disabled={busy} onClick={() => {
          setConfirm("");
          setOpened(false);
          onCancel();
        }}>Cancelar</button>
      </div>
    </form>
  );
}
