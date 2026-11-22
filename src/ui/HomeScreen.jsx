import { useSyncExternalStore } from "react";
import { getSnapshot, subscribe } from "../identity/auth.js";
import octoLogo from "../images/logo_semfundo.png";
import { SONG_CATALOG } from "../songs/catalog.js";

export function HomeScreen({ loading, status, currentSong, onPlaySong, onImportFile, onContinue, onRanking, onSettings, scoreNotice, onAccount }) {
  const identity = useSyncExternalStore(subscribe, getSnapshot);
  const checkingAccount = identity.status === "loading";
  const accountLabel = identity.profile?.display_name ?? (identity.status === "needsProfile" ? "Criar perfil" : "Entrar");
  return (
    <section className="screen home-screen" aria-label="Início">
      <header className="screen-header">
        <button className="menu-button account-chip" type="button" onClick={() => onAccount(identity.profile?.username_slug)}
          disabled={checkingAccount} aria-label={checkingAccount ? "Verificando sua conta" : accountLabel}>
          {checkingAccount ? <span className="loading-spinner" aria-hidden="true" /> : accountLabel}
        </button>
        <button className="icon-button" type="button" onClick={onSettings} aria-label="Configurações" title="Configurações">⚙</button>
      </header>
      {scoreNotice && <p className="score-notice" role="status">{scoreNotice}</p>}

      <div className="home-hero">
        <img className="home-logo" src={octoLogo} alt="" />
        <h1>OctoBeat</h1>
        <p>8 tentáculos, 8 teclas. Escolha uma música e entre no ritmo.</p>
      </div>

      <h2 className="home-section-title">Músicas</h2>
      <div className="home-cards">
        {SONG_CATALOG.map((song) => (
          <button key={song.id} className="home-card" type="button" onClick={() => onPlaySong(song)} disabled={loading}>
            <span className="home-card-icon">♫</span>
            <strong>{song.title}</strong>
            <small>{song.artist}</small>
            <small className="home-card-vibe">{song.vibe}</small>
          </button>
        ))}
      </div>

      <h2 className="home-section-title">Mais</h2>
      <div className="home-cards">
        <button className="home-card is-featured" type="button" onClick={onRanking} disabled={loading}>
          <span className="home-card-icon" aria-hidden="true">★</span>
          <strong>Ranking</strong>
          <small>Jogue as fases ranqueadas e veja a classificação</small>
        </button>
        {currentSong && (
          <button className="home-card is-featured" type="button" onClick={onContinue} disabled={loading}>
            <span className="home-card-icon">▶</span>
            <strong>Continuar</strong>
            <small>{currentSong}</small>
          </button>
        )}
        <label className={`home-card ${loading ? "is-disabled" : ""}`}>
          <span className="home-card-icon">⇪</span>
          <strong>Importar música</strong>
          <small>Arquivo MIDI ou MusicXML do seu computador</small>
          <input type="file" accept=".mid,.midi,.musicxml,.xml,application/xml" onChange={onImportFile} disabled={loading} />
        </label>
      </div>

      <p className={`home-status ${loading ? "is-loading" : ""}`} role="status">
        {loading && <span className="loading-spinner" />}
        {status}
      </p>
    </section>
  );
}
