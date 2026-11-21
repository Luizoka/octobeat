export const DIFFICULTIES = [
  { id: "easy", label: "Leve", hint: "Só os tempos principais" },
  { id: "normal", label: "Normal", hint: "Ritmo da melodia" },
  { id: "hard", label: "Rápida", hint: "Mais notas e acordes" },
];

const SOURCES = [
  { id: "essence", label: "Essência", hint: "Melodia principal (recomendado)" },
  { id: "piano", label: "Piano", hint: "Todas as tracks de piano" },
  { id: "custom", label: "Personalizado", hint: "Você escolhe as tracks" },
];

function formatDuration(seconds) {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function SetupScreen({
  song, analysis, title, subtitle, difficulty, onDifficulty, charts, sourceMode, onSourceMode,
  selectedTrackIds, playedTrackIds = [], onToggleTrack, audioTrackIds, onToggleAudio, audioMode, onAudioMode,
  previewPlaying, midiBusy, audioStatus, onPreview, onStopPreview, onPlay, onPlayFullscreen, mustRotate,
  onBack, onSettings, status,
}) {
  const isMidi = song?.source?.format === "MIDI";
  const bpm = song?.tempoChanges[0]?.bpm;
  const selectedChart = charts[difficulty];
  const canPlay = selectedChart?.count > 0 && !midiBusy;

  return (
    <section className="screen setup-screen" aria-label="Preparar fase">
      <header className="screen-header">
        <button className="back-button" type="button" onClick={onBack}>← Início</button>
        <button className="icon-button" type="button" onClick={onSettings} aria-label="Configurações" title="Configurações">⚙</button>
      </header>

      <div className="song-card">
        <div className="song-card-art" aria-hidden="true">♫</div>
        <div className="song-card-copy">
          <span className="eyebrow">{song ? song.source?.format : "Aquecimento"}</span>
          <h2>{title}</h2>
          <p>{subtitle}</p>
          {song && (
            <div className="song-facts">
              <span><b>{formatDuration(song.duration)}</b> duração</span>
              {bpm && <span><b>{Math.round(bpm)}</b> BPM{song.tempoChanges.length > 1 ? ` (+${song.tempoChanges.length - 1})` : ""}</span>}
              <span><b>{song.tracks.filter((track) => track.notes.length).length}</b> tracks</span>
            </div>
          )}
        </div>
        {isMidi && (
          <div className="song-card-preview">
            <button className="ghost-action" type="button" onClick={onPreview} disabled={midiBusy}>
              {midiBusy && !previewPlaying ? "Carregando..." : previewPlaying ? "⏸ Pausar prévia" : "▶ Ouvir prévia"}
            </button>
            {previewPlaying && <button className="ghost-action" type="button" onClick={onStopPreview}>■</button>}
          </div>
        )}
      </div>

      <h3 className="section-title">Dificuldade</h3>
      <div className="difficulty-cards" role="radiogroup" aria-label="Dificuldade">
        {DIFFICULTIES.map((option) => {
          const chart = charts[option.id];
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={difficulty === option.id}
              className={`difficulty-card difficulty-${option.id} ${difficulty === option.id ? "is-selected" : ""}`}
              onClick={() => onDifficulty(option.id)}
            >
              <strong>{option.label}</strong>
              <small>{option.hint}</small>
              <span className="difficulty-stats">
                <b>{chart?.count ?? 0}</b> notas
                {chart?.holds > 0 && <> · <b>{chart.holds}</b> longas</>}
                {chart?.nps > 0 && <> · {chart.nps.toFixed(1)}/s</>}
              </span>
            </button>
          );
        })}
      </div>

      {song && (
        <>
          <h3 className="section-title">O que tocar</h3>
          <div className="segmented" role="radiogroup" aria-label="Fonte das notas">
            {SOURCES.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={sourceMode === option.id}
                className={sourceMode === option.id ? "is-selected" : ""}
                onClick={() => onSourceMode(option.id)}
                title={option.hint}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="segmented-hint">{SOURCES.find((option) => option.id === sourceMode)?.hint}</p>
        </>
      )}

      <div className="play-bar">
        {status && <span className="play-status">{status}</span>}
        {midiBusy && <span className="play-status"><span className="loading-spinner" /> {audioStatus}</span>}
        {mustRotate && !status && !midiBusy && <span className="play-status rotate-status">↻ Para jogar, gire o celular na horizontal</span>}
        {onPlayFullscreen ? (
          <>
            <button className="ghost-action" type="button" onClick={onPlay} disabled={!canPlay}>Sem tela cheia</button>
            <button className="play-button" type="button" onClick={onPlayFullscreen} disabled={!canPlay}>▶ Jogar em tela cheia</button>
          </>
        ) : (
          <button className="play-button" type="button" onClick={onPlay} disabled={!canPlay}>▶ Jogar</button>
        )}
      </div>

      {song && (
        <details className="advanced">
          <summary>Avançado: tracks, mixagem e análise</summary>
          <AdvancedPanel
            song={song} analysis={analysis} sourceMode={sourceMode} playedTrackIds={playedTrackIds}
            onToggleTrack={onToggleTrack} audioTrackIds={audioTrackIds} onToggleAudio={onToggleAudio}
            audioMode={audioMode} onAudioMode={onAudioMode} isMidi={isMidi}
          />
        </details>
      )}
    </section>
  );
}

function AdvancedPanel({ song, analysis, sourceMode, playedTrackIds, onToggleTrack, audioTrackIds, onToggleAudio, audioMode, onAudioMode, isMidi }) {
  const analysisById = new Map(analysis?.tracks.map((track) => [track.id, track]) ?? []);
  const played = new Set(playedTrackIds);
  const isPlayed = (track) => played.has(track.id);
  const musicalTracks = song.tracks.filter((track) => track.notes.length);

  return (
    <div className="advanced-body">
      {isMidi && (
        <label className="field">
          <span>Mixagem do áudio</span>
          <select value={audioMode} onChange={(event) => onAudioMode(event.target.value)}>
            <option value="piano-focus">Destacar piano</option>
            <option value="full">Música completa</option>
            <option value="piano-only">Apenas piano</option>
          </select>
        </label>
      )}
      <div className="track-table" role="table" aria-label="Tracks">
        <div className="track-row track-head" role="row">
          <span role="columnheader">Jogar</span>
          {isMidi && <span role="columnheader">Ouvir</span>}
          <span role="columnheader">Track</span>
        </div>
        {musicalTracks.map((track) => {
          const info = analysisById.get(track.id);
          return (
            <div className={`track-row ${info?.suspicious ? "is-suspicious" : ""}`} role="row" key={track.id}>
              <input type="checkbox" checked={isPlayed(track)} onChange={() => onToggleTrack(track.id)} disabled={info?.suspicious} aria-label={`Jogar ${track.name}`} />
              {isMidi && <input type="checkbox" checked={audioTrackIds.includes(track.id)} onChange={() => onToggleAudio(track.id)} aria-label={`Ouvir ${track.name}`} />}
              <span>
                <b>{track.name}</b>
                {sourceMode === "essence" && played.has(track.id) && <em className="tag">Melodia</em>}
                {info?.suspicious && <em className="tag tag-warning">Suspeita</em>}
                <small>{track.family} · {track.notes.length} notas · {(info?.notesPerSecond ?? 0).toFixed(1)}/s{info && Number.isFinite(info.melodyScore) ? ` · pontuação ${info.melodyScore.toFixed(0)}` : ""}</small>
              </span>
            </div>
          );
        })}
      </div>
      <p className="advanced-note">Marcar uma track em “Jogar” muda a fonte para Personalizado.</p>
    </div>
  );
}
