// Notas longas (holds): lógica pura de julgamento e posição, sem React.
//
// Ciclo de vida de um hold no jogo:
//   caindo → (cabeça acertada) holdState "holding" → "complete" | "dropped"
//   caindo → (cabeça perdida) missed
// A cabeça é julgada como uma nota comum (judgeNote). Segurar até o fim
// completa o hold automaticamente; soltar cedo demais o derruba.

export const HOLD_SETTINGS = Object.freeze({
  releaseWindow: 0.15, // segundos antes do fim em que soltar já conta como completo
  pointsPerSecond: 300, // pontos por segundo segurado
  completeBonus: 200, // bônus por completar
  minDuration: 0.3, // holds mais curtos que isso viram notas comuns
  laneGap: 0.12, // folga entre o fim de um hold e a próxima nota na mesma lane
});

// Holds a partir desta duração são "épicos": pegam fogo enquanto seguros.
export const EPIC_HOLD_SECONDS = 1;
// Tempo segurando até o fogo chegar à intensidade máxima.
const FULL_HEAT_SECONDS = 1.5;

export function isEpicHold(note) {
  return Number(note?.duration) >= EPIC_HOLD_SECONDS;
}

/** Intensidade (0–1) do hold sendo segurado: cresce com o tempo segurado. */
export function holdHeat(note, time) {
  if (note.holdState !== "holding") return 0;
  return Math.max(0, Math.min(1, (time - note.time) / FULL_HEAT_SECONDS));
}

export function isHold(note) {
  return Number(note?.duration) > 0;
}

export function holdEnd(note) {
  return note.time + (Number(note.duration) || 0);
}

/**
 * Resolve um hold que está sendo segurado no instante `time`
 * (por soltar a tecla ou por ter chegado ao fim).
 */
export function resolveHold(note, time, settings = HOLD_SETTINGS) {
  const end = holdEnd(note);
  const complete = time >= end - settings.releaseWindow;
  const heldSeconds = Math.max(0, Math.min(time, end) - note.time);
  return {
    holdState: complete ? "complete" : "dropped",
    heldSeconds,
    score: Math.round(heldSeconds * settings.pointsPerSecond) + (complete ? settings.completeBonus : 0),
    judgement: complete ? "Completo" : "Soltou",
  };
}

/**
 * Posição vertical (px) da cabeça e da cauda. Enquanto o jogador segura, a
 * cabeça fica presa na linha de acerto e o corpo vai sendo "consumido".
 */
export function holdPositions(note, time, { hitY, fallDuration }) {
  const toY = (at) => (1 - (at - time) / fallDuration) * hitY;
  const holding = note.holdState === "holding";
  const headY = holding ? Math.min(toY(note.time), hitY) : toY(note.time);
  const tailY = holding ? Math.min(toY(holdEnd(note)), hitY) : toY(holdEnd(note));
  return { headY, tailY };
}

/**
 * Garante que nenhum hold atravesse outra nota da mesma lane (impossível de
 * jogar): o hold é encurtado e, se ficar curto demais, vira nota comum.
 * Espera notas ordenadas por tempo.
 */
export function fitHoldsToLanes(notes, settings = HOLD_SETTINGS) {
  const nextInLane = new Map();
  const result = new Array(notes.length);
  for (let index = notes.length - 1; index >= 0; index -= 1) {
    const note = notes[index];
    const next = nextInLane.get(note.key);
    nextInLane.set(note.key, note.time);
    if (!isHold(note)) {
      const { duration, ...plain } = note;
      result[index] = plain;
      continue;
    }
    const limit = next == null ? Infinity : next - settings.laneGap - note.time;
    const duration = Math.min(note.duration, limit);
    if (duration >= settings.minDuration) result[index] = { ...note, duration: Number(duration.toFixed(3)) };
    else {
      const { duration: _removed, ...plain } = note;
      result[index] = plain;
    }
  }
  return result;
}
