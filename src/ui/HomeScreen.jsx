import octoLogo from "../images/logo_semfundo.png";
import { SONG_CATALOG } from "../songs/catalog.js";

export function HomeScreen({ loading, status, currentSong, onPlaySong, onImportFile, onContinue, onRanking, onSettings, session, onAccount }) {
  return (
    <section className="screen home-screen" aria-label="Início">
      <header className="screen-header">
        <button className="menu-button account-chip" type="button" onClick={onAccount}>
          {session?.username ?? "Entrar"}
        </button>
        <button className="icon-button" type="button" onClick={onSettings} aria-label="Configurações" title="Configurações">⚙</button>
      </header>

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
