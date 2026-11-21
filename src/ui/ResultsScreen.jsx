import { finalRank, weightedAccuracy } from "../game/scoring.js";

const RANK_TEXT = {
  S: "Impecável!",
  A: "Excelente!",
  B: "Muito bom!",
  C: "Boa! Dá para melhorar.",
  D: "Continue treinando!",
};

export function ResultsScreen({ stats, title, difficultyLabel, onReplay, onSetup, onHome }) {
  const rank = finalRank(stats);
  const accuracy = Math.round(weightedAccuracy(stats) * 100);
  const rows = [
    ["Perfeito", stats.counts.perfect, "perfect"],
    ["Bom", stats.counts.good, "good"],
    ["Cedo / Atrasado", stats.counts.offset, "offset"],
    ["Erro", stats.counts.miss, "miss"],
  ];

  return (
    <section className="screen results-screen" aria-label="Resultado">
      <div className="results-card">
        <div className="results-summary">
          <span className="eyebrow">{difficultyLabel}</span>
          <h2>{title}</h2>
          <div className={`rank rank-${rank}`} aria-label={`Nota ${rank}`}>{rank}</div>
          <p className="rank-text">{RANK_TEXT[rank]}</p>

          <div className="results-score">
            <strong>{stats.score.toLocaleString("pt-BR")}</strong>
            <span>pontos</span>
          </div>
        </div>

        <div className="results-details">
          <div className="results-grid">
            <div><b>{stats.maxCombo}</b><span>combo máximo</span></div>
            <div><b>{accuracy}%</b><span>precisão</span></div>
            {(stats.holdsComplete + stats.holdsDropped) > 0 && <div><b>{stats.holdsComplete}/{stats.holdsComplete + stats.holdsDropped}</b><span>notas longas</span></div>}
          </div>

          <ul className="results-breakdown">
            {rows.map(([label, value, kind]) => (
              <li key={kind} className={`breakdown-${kind}`}><span>{label}</span><b>{value}</b></li>
            ))}
          </ul>

          <div className="results-actions">
            <button className="play-button" type="button" onClick={onReplay} autoFocus>↻ Jogar de novo</button>
            <button className="menu-button" type="button" onClick={onSetup}>Trocar dificuldade</button>
            <button className="menu-button" type="button" onClick={onHome}>Outra música</button>
          </div>
        </div>
      </div>
    </section>
  );
}
