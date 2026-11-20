import octoLogo from "../images/logo_semfundo.png";

export function HomeScreen({ loading, status, currentSong, onDemo, onExample, onImportFile, onContinue, onSettings }) {
  return (
    <section className="screen home-screen" aria-label="Início">
      <header className="screen-header">
        <span />
        <button className="icon-button" type="button" onClick={onSettings} aria-label="Configurações" title="Configurações">⚙</button>
      </header>

      <div className="home-hero">
        <img className="home-logo" src={octoLogo} alt="" />
        <h1>OctoBeat</h1>
        <p>8 tentáculos, 8 teclas. Escolha uma música e entre no ritmo.</p>
      </div>

      <div className="home-cards">
        {currentSong && (
          <button className="home-card is-featured" type="button" onClick={onContinue} disabled={loading}>
            <span className="home-card-icon">▶</span>
            <strong>Continuar</strong>
            <small>{currentSong}</small>
          </button>
        )}
        <button className="home-card" type="button" onClick={onDemo} disabled={loading}>
          <span className="home-card-icon">✦</span>
          <strong>Fase demo</strong>
          <small>Curta, sem download. Ótima para aquecer.</small>
        </button>
        <button className="home-card" type="button" onClick={onExample} disabled={loading}>
          <span className="home-card-icon">♫</span>
          <strong>Música de exemplo</strong>
          <small>Deltarune Chapter 5 — Flower Man</small>
        </button>
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
