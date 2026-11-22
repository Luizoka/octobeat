import { useEffect, useState } from "react";
import { findChartId, getGlobalLeaderboard, getLeaderboard, isLeaderboardEnabled, loadRankedChart, TWO_HANDS_NOTICE } from "../leaderboard/client.js";
import { platformLabel } from "../leaderboard/validation.js";
import { importSong } from "../music/importSong.js";
import { loadCatalogFile, SONG_CATALOG } from "../songs/catalog.js";
import { DIFFICULTIES } from "./SetupScreen.jsx";
import { SegmentedTabs } from "./SegmentedTabs.jsx";

function RankingTable({ rows, session, onProfile, global = false }) {
  if (rows === null) return <p role="status">Carregando classificação…</p>;
  if (rows.length === 0) return <p>{global ? "Nenhum jogador nesta classificação." : "Nenhuma pontuação enviada para esta fase."}</p>;

  return (
    <div className="ranked-table-wrap">
      <table className="ranked-table">
        <caption className="ranked-caption">Top 50</caption>
        <thead>
          <tr><th scope="col">Lugar</th><th scope="col">Usuário</th><th scope="col">Pontos</th>
            {global ? <>
              <th scope="col">Fases</th><th scope="col">Notas S</th><th scope="col">Precisão média</th>
            </> : <>
              <th scope="col">Precisão</th><th scope="col">Combo</th><th scope="col">Nota</th>
              <th scope="col">Plataforma</th>
            </>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const own = row.username.toLowerCase() === session?.username.toLowerCase();
            return (
              <tr key={row.username} className={own ? "ranked-own-row" : undefined}>
                <td>{row.position}º</td>
                <th scope="row">
                  <button className="ranked-link" type="button" onClick={() => onProfile(row.username)}>{row.username}</button>
                  {own && " (você)"}
                </th>
                <td>{Number(global ? row.total_score : row.score).toLocaleString("pt-BR")}</td>
                {global ? <>
                  <td>{row.charts_played}</td><td>{row.s_ranks}</td>
                  <td>{Number(row.avg_accuracy).toLocaleString("pt-BR")}%</td>
                </> : <>
                  <td>{Number(row.accuracy).toLocaleString("pt-BR")}%</td><td>{row.max_combo}</td><td>{row.rank}</td>
                  <td>{platformLabel(row.platform)}</td>
                </>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GlobalRankingPanel({ difficulty, session, onProfile }) {
  const enabled = isLeaderboardEnabled();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    getGlobalLeaderboard(difficulty || null).then(
      (data) => { if (current) setRows(data); },
      (reason) => { if (current) setError(reason.message); },
    );
    return () => { current = false; };
  }, [attempt, difficulty, enabled]);

  if (!enabled) return <p>Ranking online indisponível.</p>;
  if (error) return (
    <div className="ranked-actions">
      <p role="alert">{error}</p>
      <button className="menu-button" type="button" onClick={() => {
        setError("");
        setAttempt((value) => value + 1);
      }}>Tentar de novo</button>
    </div>
  );
  return <RankingTable rows={rows} session={session} onProfile={onProfile} global />;
}

function RankedChartPanel({ slug, difficulty, session, onProfile, onPlay, canFullscreen, audioLoading, audioError }) {
  const enabled = isLeaderboardEnabled();
  const [chart, setChart] = useState(null);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    async function load() {
      try {
        const frozen = await loadRankedChart(slug, difficulty);
        if (!current) return;
        setChart(frozen);
        if (enabled) {
          const id = await findChartId(frozen);
          if (!current) return;
          const leaderboard = await getLeaderboard(id);
          if (current) setRows(leaderboard);
        }
      } catch (reason) {
        if (current) setError(reason.message);
      }
    }
    load();
    return () => { current = false; };
  }, [attempt, difficulty, enabled, slug]);

  const playable = chart && !audioLoading && !audioError;
  return (
    <>
      <div className="ranked-actions">
        <button className="play-button" type="button" disabled={!playable} onClick={() => onPlay(chart)}>
          {!chart && !error ? "Carregando fase…" : audioLoading ? "Carregando música…" : "Jogar fase ranqueada"}
        </button>
        {canFullscreen && <button className="menu-button" type="button" disabled={!playable}
          onClick={() => onPlay(chart, { fullscreen: true })}>Jogar em tela cheia</button>}
      </div>
      {audioError && <p role="alert">{audioError}</p>}
      {error && (
        <div className="ranked-actions">
          <p role="alert">{error}</p>
          <button className="menu-button" type="button" onClick={() => {
            setError("");
            setAttempt((value) => value + 1);
          }}>Tentar novamente</button>
        </div>
      )}
      {!enabled && <p>Ranking online indisponível.</p>}
      {enabled && !error && <RankingTable rows={rows} session={session} onProfile={onProfile} />}
    </>
  );
}

export function RankingScreen({ initialChart, initialDifficulty, handMode, session, onProfile, onPlay, onBack, onSettings, canFullscreen, status }) {
  const [global, setGlobal] = useState(false);
  const [globalDifficulty, setGlobalDifficulty] = useState("");
  const [slug, setSlug] = useState(initialChart?.slug ?? SONG_CATALOG[0].id);
  const [difficulty, setDifficulty] = useState(initialChart?.difficulty ?? initialDifficulty);
  const [audio, setAudio] = useState(null);
  const [audioAttempt, setAudioAttempt] = useState(0);
  const entry = SONG_CATALOG.find((song) => song.id === slug);
  const selectedAudio = audio?.slug === slug ? audio : null;

  useEffect(() => {
    if (global || selectedAudio) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let current = true;
    loadCatalogFile(entry, controller.signal).then(importSong).then(
      (song) => { if (current) setAudio({ slug: entry.id, song: { ...song, title: entry.title, artist: entry.artist } }); },
      () => { if (current) setAudio({ slug: entry.id, error: `Não foi possível carregar ${entry.title}.` }); },
    ).finally(() => clearTimeout(timeout));
    return () => {
      current = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [audioAttempt, entry, global, selectedAudio]);

  return (
    <section className="screen ranking-screen" aria-label="Ranking">
      <header className="screen-header">
        <button className="back-button" type="button" onClick={onBack}>← Voltar</button>
        <button className="icon-button" type="button" onClick={onSettings} aria-label="Configurações" title="Configurações">⚙</button>
      </header>
      <h1>Ranking</h1>
      <SegmentedTabs label="Tipo de classificação" labels={["Por música", "Geral"]} selected={Number(global)}
        onSelect={(index) => setGlobal(index === 1)} panelClassName="ranking-tab-panel"
        extra={session && <button className="menu-button account-chip" type="button"
          onClick={() => onProfile(session.username)}>{session.username}</button>}>
        {global ? <>
          <div className="ranked-filters">
            <label>Dificuldade<select value={globalDifficulty} onChange={(event) => setGlobalDifficulty(event.target.value)}>
              <option value="">Todas</option>
              {DIFFICULTIES.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
            </select></label>
          </div>
          <GlobalRankingPanel key={globalDifficulty} difficulty={globalDifficulty} session={session} onProfile={onProfile} />
        </> : <>
          <div className="ranked-filters">
            <label>Música<select value={slug} onChange={(event) => {
              setAudio(null);
              setSlug(event.target.value);
            }}>
              {SONG_CATALOG.map((song) => <option key={song.id} value={song.id}>{song.title}</option>)}
            </select></label>
            <label>Dificuldade<select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
              {DIFFICULTIES.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
            </select></label>
          </div>
          {handMode !== "both" && <p role="status">{TWO_HANDS_NOTICE}</p>}
          {status && <p role="alert">{status}</p>}
          <RankedChartPanel key={`${slug}/${difficulty}`} slug={slug} difficulty={difficulty} session={session}
            onProfile={onProfile} canFullscreen={canFullscreen} audioLoading={!selectedAudio} audioError={selectedAudio?.error}
            onPlay={(chart, options) => onPlay(chart, selectedAudio.song, options)} />
          {selectedAudio?.error && <button className="menu-button" type="button" onClick={() => {
            setAudio(null);
            setAudioAttempt((value) => value + 1);
          }}>Recarregar música</button>}
        </>}
      </SegmentedTabs>
    </section>
  );
}
