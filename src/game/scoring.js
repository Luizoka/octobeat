// Pontuação, combo, multiplicador (Fever) e nota final. Puro, sem React.
// Toda atualização recebe as estatísticas anteriores e devolve novas.

import { holdEnd, isHold, resolveHold } from "./holdNotes.js";
import { judgeNote } from "./judgeNote.js";

export const MULTIPLIER_TIERS = Object.freeze([
  { combo: 100, multiplier: 4 },
  { combo: 50, multiplier: 3 },
  { combo: 25, multiplier: 2 },
]);
export const FEVER_COMBO = 50;
export const COMBO_MILESTONES = Object.freeze([25, 50, 100, 150, 200, 300, 400, 500, 750, 1000]);
const COMBO_BONUS = 12; // pontos extras por nota de combo (comportamento original)

export function createStats() {
  return {
    score: 0,
    combo: 0,
    maxCombo: 0,
    hits: 0,
    total: 0,
    judgement: "Pronto",
    judgementKind: null,
    counts: { perfect: 0, good: 0, offset: 0, miss: 0 },
    holdsComplete: 0,
    holdsDropped: 0,
  };
}

export function comboMultiplier(combo) {
  return MULTIPLIER_TIERS.find((tier) => combo >= tier.combo)?.multiplier ?? 1;
}

export function isFever(combo) {
  return combo >= FEVER_COMBO;
}

/** Marco de combo cruzado entre `before` e `after` (ou null). */
export function crossedMilestone(before, after) {
  return COMBO_MILESTONES.filter((milestone) => before < milestone && after >= milestone).at(-1) ?? null;
}

/** Acerto de nota (ou cabeça de hold). `result` vem de judgeNote. */
export function applyHit(stats, result) {
  const combo = stats.combo + 1;
  const countKey = result.kind === "perfect" ? "perfect" : result.kind === "good" ? "good" : "offset";
  return {
    ...stats,
    score: stats.score + (result.score + combo * COMBO_BONUS) * comboMultiplier(combo),
    combo,
    maxCombo: Math.max(stats.maxCombo, combo),
    hits: stats.hits + 1,
    total: stats.total + 1,
    judgement: result.label,
    judgementKind: result.kind,
    counts: { ...stats.counts, [countKey]: stats.counts[countKey] + 1 },
  };
}

/** Notas perdidas (ou tecla apertada sem nota). Quebra o combo. */
export function applyMiss(stats, count = 1) {
  if (count <= 0) return stats;
  return {
    ...stats,
    combo: 0,
    total: stats.total + count,
    judgement: "Erro",
    judgementKind: "miss",
    counts: { ...stats.counts, miss: stats.counts.miss + count },
  };
}

/** Holds resolvidos (resultados de resolveHold). Soltar cedo quebra o combo. */
export function applyHoldResults(stats, results) {
  if (!results.length) return stats;
  const complete = results.filter((result) => result.holdState === "complete").length;
  const dropped = results.length - complete;
  const multiplier = comboMultiplier(stats.combo);
  return {
    ...stats,
    score: stats.score + results.reduce((sum, result) => sum + result.score, 0) * multiplier,
    combo: dropped ? 0 : stats.combo,
    judgement: dropped ? "Soltou" : "Completo",
    judgementKind: dropped ? "dropped" : "complete",
    holdsComplete: stats.holdsComplete + complete,
    holdsDropped: stats.holdsDropped + dropped,
  };
}

/** Pontuação com todas as cabeças perfeitas e todos os holds completos. */
export function maxScore(notes) {
  const events = notes.flatMap((note) => {
    const head = { note, time: note.time, tail: false };
    return isHold(note) ? [head, { note, time: holdEnd(note), tail: true }] : [head];
  });
  // No mesmo instante, fecha o hold anterior antes de julgar a próxima cabeça.
  events.sort((a, b) => a.time - b.time || Number(b.tail) - Number(a.tail));
  const perfect = judgeNote(0);
  let stats = createStats();
  for (const { note, time, tail } of events) {
    stats = tail ? applyHoldResults(stats, [resolveHold(note, time)]) : applyHit(stats, perfect);
  }
  return stats.score;
}

/** Precisão ponderada: Perfeito vale 1, Bom 0,7, Cedo/Atrasado 0,4, Erro 0. */
export function weightedAccuracy(stats) {
  if (!stats.total) return 0;
  const { perfect, good, offset } = stats.counts;
  return (perfect + good * 0.7 + offset * 0.4) / stats.total;
}

export function finalRank(stats) {
  const accuracy = weightedAccuracy(stats);
  if (accuracy >= 0.95 && stats.counts.miss === 0) return "S";
  if (accuracy >= 0.88) return "A";
  if (accuracy >= 0.75) return "B";
  if (accuracy >= 0.55) return "C";
  return "D";
}
