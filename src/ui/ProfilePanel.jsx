import { useEffect, useState } from "react";
import { deleteAccount, signOut, updateProfile } from "../identity/auth.js";
import { getPlayerProfile } from "../leaderboard/client.js";
import { AccountDialog } from "./AccountDialog.jsx";
import { DeleteAccountForm } from "./DeleteAccountForm.jsx";
import { DIFFICULTIES } from "./SetupScreen.jsx";

const COLORS = {
  teal: ["Turquesa", "#27d9d1"],
  coral: ["Coral", "#ff8278"],
  violet: ["Violeta", "#b698ff"],
  gold: ["Dourado", "#ffc75e"],
  lime: ["Lima", "#b8e963"],
  sky: ["Azul-céu", "#77c9ff"],
};

function ProfileEditor({ profile, busy, onSave }) {
  const [avatarColor, setAvatarColor] = useState(profile.avatar_config?.color ?? "teal");
  return (
    <form className="ranked-form profile-editor" onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      onSave({
        displayName: form.get("displayName"), bio: form.get("bio"),
        visibility: form.get("visibility"), avatarColor,
      });
    }}>
      <label>Nome de exibição<input name="displayName" defaultValue={profile.display_name} maxLength={255}
        required data-initial-focus /></label>
      <label>Visibilidade<select name="visibility" defaultValue={profile.visibility}>
        <option value="public">Público</option>
        <option value="private">Privado</option>
      </select></label>
      <label className="profile-bio">Bio<textarea name="bio" defaultValue={profile.bio ?? ""} rows={2} maxLength={280} /></label>
      <fieldset className="avatar-colors">
        <legend>Cor do polvo</legend>
        {Object.entries(COLORS).map(([color, [label, hex]]) => (
          <button key={color} type="button" aria-label={label} title={label} aria-pressed={color === avatarColor}
            style={{ "--avatar-color": hex }} onClick={() => setAvatarColor(color)} />
        ))}
      </fieldset>
      <button className="play-button" type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar perfil"}</button>
    </form>
  );
}

export function ProfilePanel({ slug, ownProfile, onClose }) {
  const [loadedProfile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [action, setAction] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [editing, setEditing] = useState(false);
  const own = slug === ownProfile?.username_slug;
  const profile = loadedProfile?.own && !own ? null : loadedProfile;
  const details = own ? { ...profile, ...ownProfile, private: false } : profile;

  useEffect(() => {
    let current = true;
    getPlayerProfile(slug).then(
      (data) => { if (current) { setProfile(data); setError(""); } },
      (reason) => { if (current) setError(reason.message); },
    );
    return () => { current = false; };
  }, [attempt, slug, own]);

  async function act(name, run) {
    if (action) return;
    setAction(name);
    setActionError(null);
    try {
      await run();
    } catch (reason) {
      setActionError({ name, message: reason.message });
    } finally {
      setAction(null);
    }
  }

  return (
    <AccountDialog title={details?.display_name ?? "Perfil"} className="profile-panel"
      onClose={action === "delete" ? () => {} : onClose}>
      <div className="account-body">
        {details && (
          <div className="profile-identity">
            <span className="profile-avatar" aria-hidden="true"
              style={{ "--avatar-color": (COLORS[details.avatar_config?.color] ?? COLORS.teal)[1] }}>🐙</span>
            {details.private ? <p>Perfil privado</p> : <p>@{details.username_slug}</p>}
          </div>
        )}
        {details && !details.private && details.bio && <p className="profile-bio">{details.bio}</p>}
        {error && (
          <div className="ranked-actions">
            <p role="alert">{error}</p>
            <button className="menu-button" type="button" onClick={() => {
              setError("");
              setAttempt((value) => value + 1);
            }}>Tentar de novo</button>
          </div>
        )}
        {!error && !details && <p role="status">Carregando perfil…</p>}
        {profile && !profile.private && (
          <>
            <p className="profile-since">Desde <time dateTime={profile.created_at}>
              {new Date(profile.created_at).toLocaleDateString("pt-BR", { dateStyle: "long" })}
            </time></p>
            <dl className="profile-stats">
              <div><dt>Pontos totais</dt><dd>{Number(profile.total_score).toLocaleString("pt-BR")}</dd></div>
              <div><dt>Posição geral</dt><dd>{profile.global_position == null ? "—" : `${profile.global_position}º`}</dd></div>
              <div><dt>Fases jogadas</dt><dd>{profile.charts_played}</dd></div>
              <div><dt>Notas S</dt><dd>{profile.s_ranks}</dd></div>
              <div><dt>Envios</dt><dd>{profile.submissions}</dd></div>
            </dl>
            <div className="profile-extra">
              <p>{profile.level == null ? "Níveis em breve" : `Nível ${profile.level}`}</p>
              <p>{profile.achievements?.length ? `${profile.achievements.length} conquistas` : "Conquistas em breve"}</p>
              <p>{profile.published_charts?.length ? `${profile.published_charts.length} fases publicadas` : "Nenhuma fase publicada."}</p>
            </div>
            {profile.best.length === 0 ? <p>Nenhuma pontuação em fases ativas.</p> : (
              <div className="ranked-table-wrap">
                <table className="ranked-table">
                  <caption className="ranked-caption">Melhores pontuações</caption>
                  <thead>
                    <tr><th scope="col">Música</th><th scope="col">Dificuldade</th><th scope="col">Lugar</th>
                      <th scope="col">Pontos</th><th scope="col">Precisão</th><th scope="col">Nota</th></tr>
                  </thead>
                  <tbody>
                    {profile.best.map((best) => (
                      <tr key={`${best.song_slug}/${best.difficulty}`}>
                        <th scope="row">{best.title}</th>
                        <td>{DIFFICULTIES.find(({ id }) => id === best.difficulty)?.label}</td>
                        <td>{best.position}º</td><td>{Number(best.score).toLocaleString("pt-BR")}</td>
                        <td>{Number(best.accuracy).toLocaleString("pt-BR")}%</td><td>{best.rank}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        {actionError && actionError.name !== "delete" && <p role="alert">{actionError.message}</p>}
        {own && <>
          {editing && <ProfileEditor profile={details} busy={Boolean(action)} onSave={(fields) => act("save", async () => {
            await updateProfile(fields);
            setEditing(false);
          })} />}
          <div className="ranked-actions">
            <button className="menu-button" type="button" disabled={Boolean(action)} onClick={() => {
              setActionError(null);
              setEditing(!editing);
            }}>{editing ? "Cancelar edição" : "Editar perfil"}</button>
            <button className="menu-button" type="button" disabled={Boolean(action)} onClick={() => act("leave", async () => {
              await signOut();
              onClose();
            })}>{action === "leave" ? "Saindo…" : "Sair"}</button>
          </div>
          <div className="profile-danger">
            <h3>Zona de perigo</h3>
            <DeleteAccountForm profileSlug={ownProfile.username_slug} busy={Boolean(action)} deleting={action === "delete"}
              onCancel={() => { if (actionError?.name === "delete") setActionError(null); }}
              error={actionError?.name === "delete" ? actionError.message : ""} onDelete={(confirm) => act("delete", async () => {
                await deleteAccount(confirm);
                onClose();
              })} />
          </div>
        </>}
      </div>
    </AccountDialog>
  );
}
