import { memo } from "react";
import { KEYS } from "../game/keys.js";
import { COMBO_MILESTONES, MULTIPLIER_TIERS, comboMultiplier, finalRank, isFever, weightedAccuracy } from "../game/scoring.js";
import { isEpicHold, isHold } from "../game/holdNotes.js";
import { ParticleCanvas } from "../effects/ParticleCanvas.jsx";

// Só notas que já entraram na tela são desenhadas (o motor marca as que saíram
// como `gone`). Desenhar a música inteira custava ~430 elementos por quadro.
const ENTERED_Y = -80;
const isOnStage = (note) => !note.gone && note.y > ENTERED_Y;

const HAND_HINT = { left: "Prepare ASDF", right: "Prepare JKLÇ", both: "Prepare as duas mãos" };
const TOUCH_HINT = { left: "Toque nas 4 colunas da esquerda", right: "Toque nas 4 colunas da direita", both: "Toque nas colunas quando a nota chegar na linha" };
const TIERS_ASCENDING = [...MULTIPLIER_TIERS].reverse(); // 25 → ×2, 50 → ×3, 100 → ×4

function multiplierProgress(combo) {
  const next = TIERS_ASCENDING.find((tier) => combo < tier.combo);
  if (!next) return { label: "MÁXIMO", fraction: 1, remaining: 0, next: null };
  const previous = [...TIERS_ASCENDING].reverse().find((tier) => combo >= tier.combo)?.combo ?? 0;
  return { fraction: (combo - previous) / (next.combo - previous), remaining: next.combo - combo, next };
}

export function GameScreen({
  title, difficultyLabel, notes, holdingLanes, fireLanes, pressedLanes, stats, handMode, countdown, loading, loadingText,
  paused, finished, awaitingStart, onStart, touchDevice, settingsOpen, onPause, onResume, onRestart, onExit, onSettings, trackRef, fx,
}) {
  // Desempenho: esta função roda a cada quadro (as notas mudam a cada quadro).
  // Tudo que não depende das notas fica em componentes `memo` e só é redesenhado
  // quando o placar, as teclas ou o estado da pausa mudam.
  const multiplier = comboMultiplier(stats.combo);
  const fever = fx.effects.fever && isFever(stats.combo);
  const comboTier = stats.combo >= 100 ? 3 : stats.combo >= 50 ? 2 : stats.combo >= 25 ? 1 : 0;
  let resolved = 0;
  let holdsTotal = 0;
  for (const note of notes) {
    if (note.hit || note.missed) resolved += 1;
    if (isHold(note)) holdsTotal += 1;
  }
  const pauseDisabled = loading || countdown !== null || finished || awaitingStart;
  const laneKey = (lanes) => [...lanes].sort().join(",");
  const pressedKey = laneKey(new Set([...pressedLanes, ...holdingLanes]));

  return (
    <section
      className={`screen game-screen ${fever ? "is-fever" : ""} ${fever && fx.effects.feverMotion ? "fever-motion" : ""} ${fx.effects.laneBeams ? "beams-on" : ""} ${fireLanes.size > 0 ? "is-on-fire" : ""}`}
      aria-label="Jogo"
    >
      {/* Só este contêiner treme (camada própria); flash e pausa ficam fora dele. */}
      <div className="game-stage" ref={fx.stageRef}>
        <LeftPanel stats={stats} holdsTotal={holdsTotal} resolved={resolved} total={notes.length} />

        <div className="game-center">
          <GameHud title={title} difficultyLabel={difficultyLabel} stats={stats} paused={paused} pauseDisabled={pauseDisabled} onPause={onPause} onResume={onResume} />

          <div className={`track hand-mode-${handMode}`} ref={trackRef} aria-label="Pista de notas">
            <Lanes pressedKey={pressedKey} holdingKey={laneKey(holdingLanes)} fireKey={laneKey(fireLanes)} />
            <div className="hit-line" aria-hidden="true" />

            {notes.map((note) => {
              if (!isOnStage(note)) return null;
              if (isHold(note)) {
                const epic = isEpicHold(note) && fx.effects.holdFire;
                return (
                  <div
                    key={note.id}
                    className={`note hold-note ${epic ? "is-epic" : ""} ${note.holdState === "holding" ? "is-holding" : ""} ${note.missed || note.holdState === "dropped" ? "is-dropped" : ""}`}
                    style={{
                      "--lane": note.key,
                      "--hand-offset": note.key >= 4 ? "14px" : "0px",
                      "--note-color": KEYS[note.key].color,
                      // Calor em degraus: o brilho só é redesenhado quando muda de nível.
                      "--heat": Math.round((note.heat ?? 0) * 4) / 4,
                      // transform (e não top): mover não força layout nem repintura.
                      transform: `translate3d(0, ${note.tailY}px, 0)`,
                      height: `${Math.max(0, note.y - note.tailY)}px`,
                    }}
                  >
                    <span className="hold-head" />
                  </div>
                );
              }
              if (note.missed) return null;
              return (
                <div
                  key={note.id}
                  className={`note ${note.hit ? "is-hit" : ""}`}
                  style={{ "--lane": note.key, "--hand-offset": note.key >= 4 ? "14px" : "0px", "--note-color": KEYS[note.key].color, transform: `translate3d(0, ${note.y}px, 0)` }}
                />
              );
            })}

            <ParticleCanvas ref={fx.particlesRef} />

            {(countdown !== null || loading) && <EffectsWarmup />}

            {stats.combo >= 2 && (
              <div className={`combo-display combo-tier-${comboTier}`} aria-live="off">
                <strong key={stats.combo}>{stats.combo}</strong>
                <span>COMBO</span>
                {multiplier > 1 && <b className="multiplier">×{multiplier}</b>}
              </div>
            )}
            {fx.popup && <div key={fx.popup.id} className={`judgement-popup judgement-${fx.popup.kind}`}>{fx.popup.text}</div>}
            {fx.banner && <div key={fx.banner.id} className={`combo-banner banner-${fx.banner.tone}`}>{fx.banner.text}</div>}

            {countdown !== null && (
              <div className="track-overlay countdown-overlay" role="status">
                <strong key={countdown}>{countdown}</strong>
                <span>{(touchDevice ? TOUCH_HINT : HAND_HINT)[handMode]}</span>
              </div>
            )}
            {awaitingStart && !loading && countdown === null && (
              <div className="track-overlay start-overlay" data-lane-input="off">
                <strong className="overlay-title">Pronto?</strong>
                <span>{(touchDevice ? TOUCH_HINT : HAND_HINT)[handMode]}</span>
                <button className="play-button" type="button" onClick={onStart} autoFocus>▶ Começar</button>
              </div>
            )}
            {loading && countdown === null && (
              <div className="track-overlay" role="status">
                <span className="loading-spinner large" />
                <strong className="overlay-title">Preparando a música</strong>
                <span>{loadingText}</span>
              </div>
            )}
          </div>

          <FloatHud stats={stats} fever={fever} paused={paused} pauseDisabled={pauseDisabled} onPause={onPause} onResume={onResume} />
        </div>

        <RightPanel stats={stats} fever={fever} />
      </div>

      <div className="miss-flash" ref={fx.flashRef} aria-hidden="true" />

      {paused && !settingsOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Pausado">
          <div className="pause-menu">
            <h2>Pausado</h2>
            <button className="play-button" type="button" onClick={onResume} autoFocus>▶ Continuar</button>
            <button className="menu-button" type="button" onClick={onRestart}>↻ Reiniciar</button>
            <button className="menu-button" type="button" onClick={onSettings}>⚙ Configurações</button>
            <button className="menu-button" type="button" onClick={onExit}>← Sair da fase</button>
            {!touchDevice && <small>Esc também continua</small>}
          </div>
        </div>
      )}
    </section>
  );
}

const hasLane = (key, lane) => key !== "" && key.split(",").includes(String(lane));

/** As 8 colunas com as teclas. As lanes chegam como texto ("0,4") para o memo comparar. */
const Lanes = memo(function Lanes({ pressedKey, holdingKey, fireKey }) {
  return KEYS.map((key, lane) => (
    <div
      key={key.label}
      className={`lane lane-${lane} ${hasLane(pressedKey, lane) ? "is-pressed" : ""} ${hasLane(holdingKey, lane) ? "is-holding" : ""} ${hasLane(fireKey, lane) ? "is-on-fire" : ""}`}
      style={{ "--lane-color": key.color }}
    >
      <span>{key.label}</span>
    </div>
  ));
});

const accuracyOf = (stats) => (stats.total ? Math.round((stats.hits / stats.total) * 100) : 100);
const tierOf = (combo) => (combo >= 100 ? 3 : combo >= 50 ? 2 : combo >= 25 ? 1 : 0);

const GameHud = memo(function GameHud({ title, difficultyLabel, stats, paused, pauseDisabled, onPause, onResume }) {
  return (
    <header className="game-hud">
      <div className="hud-song">
        <strong>{title}</strong>
        <span>{difficultyLabel}</span>
      </div>
      <div className="hud-score" aria-label="Pontos">
        <strong>{stats.score.toLocaleString("pt-BR")}</strong>
        <span>{accuracyOf(stats)}% precisão</span>
      </div>
      <button className="icon-button hud-pause" type="button" onClick={paused ? onResume : onPause} disabled={pauseDisabled} aria-label={paused ? "Continuar" : "Pausar (Esc)"} title="Pausar (Esc)">
        {paused ? "▶" : "❚❚"}
      </button>
      <div className="hud-progress" aria-hidden="true"><span className="js-progress" /></div>
    </header>
  );
});

/** Celular na horizontal: o HUD vira informações soltas nas laterais da pista. */
const FloatHud = memo(function FloatHud({ stats, fever, paused, pauseDisabled, onPause, onResume }) {
  const rank = stats.total ? finalRank(stats) : "–";
  return (
    <div className="float-hud">
      <div className="float-side float-left">
        <button className="icon-button float-pause" type="button" onClick={paused ? onResume : onPause} disabled={pauseDisabled} aria-label={paused ? "Continuar" : "Pausar e configurações"}>
          {paused ? "▶" : "❚❚"}
        </button>
        <div className="float-stat"><strong>{stats.score.toLocaleString("pt-BR")}</strong><span>pontos</span></div>
        <div className="float-stat"><strong>{accuracyOf(stats)}%</strong><span>precisão</span></div>
        <div className="float-progress" aria-hidden="true"><span className="js-progress" /></div>
      </div>
      <div className="float-side float-right">
        <div className="float-stat"><strong className={`float-multiplier tier-${tierOf(stats.combo)}`}>×{comboMultiplier(stats.combo)}</strong><span>multiplicador</span></div>
        <div className="float-stat"><strong className={`float-rank rank-${rank}`}>{rank}</strong><span>nota</span></div>
        {fever && <div className="fever-badge">FEVER</div>}
      </div>
    </div>
  );
});

const LeftPanel = memo(function LeftPanel({ stats, holdsTotal, resolved, total }) {
  return (
    <aside className="side-panel side-left" aria-label="Estatísticas da partida">
      <h3>Ao vivo</h3>
      <ul className="live-counts">
        <li className="count-perfect"><span>Perfeito</span><b>{stats.counts.perfect}</b></li>
        <li className="count-good"><span>Bom</span><b>{stats.counts.good}</b></li>
        <li className="count-offset"><span>Cedo / Atrasado</span><b>{stats.counts.offset}</b></li>
        <li className="count-miss"><span>Erro</span><b>{stats.counts.miss}</b></li>
      </ul>
      <div className="side-stats">
        <div><span>Combo máximo</span><b>{stats.maxCombo}</b></div>
        {holdsTotal > 0 && <div><span>Notas longas</span><b>{stats.holdsComplete}<small>/{holdsTotal}</small></b></div>}
        <div><span>Notas</span><b>{resolved}<small>/{total}</small></b></div>
      </div>
    </aside>
  );
});

const RightPanel = memo(function RightPanel({ stats, fever }) {
  const multiplier = comboMultiplier(stats.combo);
  const comboTier = tierOf(stats.combo);
  const rank = stats.total ? finalRank(stats) : "–";
  const progress = multiplierProgress(stats.combo);
  const nextMilestone = COMBO_MILESTONES.find((milestone) => milestone > stats.combo);
  return (
    <aside className="side-panel side-right" aria-label="Multiplicador e nota">
      <h3>Multiplicador</h3>
      <div className={`multiplier-big tier-${comboTier}`}>×{multiplier}</div>
      <div className="meter" aria-hidden="true"><span style={{ transform: `scaleX(${progress.fraction})` }} /></div>
      <p className="side-hint">{progress.next ? <>Mais <b>{progress.remaining}</b> acertos para <b>×{progress.next.multiplier}</b></> : "Multiplicador no máximo!"}</p>
      {fever && <div className="fever-badge">FEVER</div>}

      <h3>Nota atual</h3>
      <div className={`rank-live rank-${rank}`}>{rank}</div>
      <p className="side-hint">{Math.round(weightedAccuracy(stats) * 100)}% de precisão ponderada</p>

      {nextMilestone && (
        <>
          <h3>Próximo marco</h3>
          <p className="side-hint">Combo <b>{nextMilestone}</b> · faltam <b>{nextMilestone - stats.combo}</b></p>
        </>
      )}
    </aside>
  );
});

/** Cópia quase invisível dos efeitos pesados, desenhada durante a contagem (ver .fx-warmup). */
function EffectsWarmup() {
  return (
    <div className="fx-warmup" aria-hidden="true">
      <div className="combo-display combo-tier-3"><strong>100</strong><span>COMBO</span><b className="multiplier">×4</b></div>
      <div className="combo-display combo-tier-2" style={{ top: "40%" }}><strong>50</strong></div>
      <div className="combo-display combo-tier-1" style={{ top: "50%" }}><strong>25</strong></div>
      <div className="combo-display combo-tier-0" style={{ top: "60%" }}><strong>2</strong><span>COMBO</span></div>
      {["combo", "fever", "break", "fire"].map((tone, index) => (
        <div key={tone} className={`combo-banner banner-${tone}`} style={{ top: `${10 + index * 12}%` }}>COMBO 50!</div>
      ))}
      {["perfect", "good", "late", "complete", "miss"].map((kind, index) => (
        <div key={kind} className={`judgement-popup judgement-${kind}`} style={{ bottom: `${100 + index * 40}px` }}>PERFEITO!</div>
      ))}
      <div className="note hold-note is-epic is-holding" style={{ "--lane": 2, "--hand-offset": "0px", "--note-color": KEYS[2].color, "--heat": 1, transform: "translate3d(0, 200px, 0)", height: "300px" }}>
        <span className="hold-head" />
      </div>
      <div className="note hold-note is-epic" style={{ "--lane": 5, "--hand-offset": "14px", "--note-color": KEYS[5].color, "--heat": 0, transform: "translate3d(0, 200px, 0)", height: "300px" }}>
        <span className="hold-head" />
      </div>
      <div className="note" style={{ "--lane": 0, "--hand-offset": "0px", "--note-color": KEYS[0].color, transform: "translate3d(0, 100px, 0)" }} />
      <div className="warm-fire" />
      <div className="lane is-pressed warm-lane" style={{ "--lane-color": KEYS[3].color }}><span>F</span></div>
      <div className="note is-hit" style={{ "--lane": 6, "--hand-offset": "14px", "--note-color": KEYS[6].color, transform: "translate3d(0, 300px, 0)" }} />
    </div>
  );
}
