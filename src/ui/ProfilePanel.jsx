import { useEffect, useState } from "react";
import { getPlayerProfile, logout } from "../leaderboard/client.js";
import { AccountDialog } from "./AccountDialog.jsx";
import { DIFFICULTIES } from "./SetupScreen.jsx";

export function ProfilePanel({ username, session, onSessionExpired, onClose }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const own = username.toLowerCase() === session?.username.toLowerCase();

  useEffect(() => {
    let current = true;
    getPlayerProfile(username).then(
      (data) => { if (current) setProfile(data); },
      (reason) => { if (current) setError(reason.message); },
    );
    return () => { current = false; };
  }, [attempt, username]);

  async function signOut() {
    const token = session.token;
    setLeaving(true);
    setLogoutError("");
    try {
      await logout(token);
      onSessionExpired(token);
    } catch (reason) {
      setLogoutError(reason.message);
    } finally {
      setLeaving(false);
    }
  }

  return (
    <AccountDialog title={profile?.username ?? username} className="profile-panel" onClose={onClose}>
      <div className="account-body">
        {error ? (
          <div className="ranked-actions">
            <p role="alert">{error}</p>
            <button className="menu-button" type="button" onClick={() => {
              setError("");
              setAttempt((value) => value + 1);
            }}>Tentar de novo</button>
          </div>
        ) : profile ? (
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
            {profile.best.length === 0 ? <p>Nenhuma pontuação em fases ativas.</p> : (
              <div className="ranked-table-wrap">
                <table className="ranked-table">
                  <caption className="ranked-caption">Melhores pontuações</caption>
                  <thead>
                    <tr><th scope="col">Música</th><th scope="col">Dificuldade</th><th scope="col">Lugar</th>
                      <th scope="col">Pontos</th><th scope="col">Precisão</th><th scope="col">Nota</th></tr>
                  </thead>
                  <tbody>
                    {profile.best.map((best, index) => (
                      <tr key={index}>
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
        ) : <p role="status">Carregando perfil…</p>}
        {logoutError && <p role="alert">{logoutError}</p>}
        {own && <div className="ranked-actions">
          <button className="menu-button" type="button" disabled={leaving} onClick={signOut}>
            {leaving ? "Saindo…" : "Sair"}
          </button>
        </div>}
      </div>
    </AccountDialog>
  );
}
