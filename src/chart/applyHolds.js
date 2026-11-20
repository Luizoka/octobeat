// Transforma notas longas do MIDI em holds no chart. Puro, sem React.
//
// Entrada: saída do simplifyChart ({ time, key, sourceDuration? }), ordenada.
// Saída: { time, key, duration? } — `duration` só aparece nos holds.

import { CHART_DIFFICULTY } from "../music-analysis/config.js";
import { HOLD_SETTINGS } from "../game/holdNotes.js";
import { beatsToSeconds, buildTempoMap, secondsToBeats } from "./beatGrid.js";

const CHORD_TOLERANCE = 0.035;
const BEAT_TOLERANCE = 0.06;
// MIDIs costumam soar ~90–95% da figura (articulação): uma mínima vira 1,9 beat.
// A cauda pode ser arredondada para cima até esta folga.
const TAIL_ROUND_UP = 0.15;
const handOf = (key) => (key < 4 ? 0 : 1);

function stripInternal({ sourceDuration, ...note }) {
  return note;
}

export function applyHolds(notes, difficulty = "normal", { tempoChanges } = {}) {
  const settings = CHART_DIFFICULTY[difficulty] ?? CHART_DIFFICULTY.normal;
  const tempoMap = buildTempoMap(tempoChanges);
  const grid = settings.subdivision;

  // 1. Candidatos: duração longa o bastante depois de cortar o que atrapalha.
  const candidates = [];
  notes.forEach((note, index) => {
    if (!(note.sourceDuration > 0)) return;
    const startBeat = secondsToBeats(note.time, tempoMap);
    let endBeat = secondsToBeats(note.time + note.sourceDuration, tempoMap);

    // A próxima nota da mesma lane (ou da mesma mão, no fácil) limita a cauda.
    const limiter = notes.slice(index + 1).find((other) => other.time - note.time > CHORD_TOLERANCE
      && (other.key === note.key || (settings.holdBlocksHand && handOf(other.key) === handOf(note.key))));
    const limitBeat = limiter ? secondsToBeats(limiter.time, tempoMap) - settings.holdTailGapBeats : Infinity;

    // Cauda alinhada à grade da dificuldade (soltar no tempo é mais natural).
    // Arredonda, mas nunca estica além do que soa no MIDI (só tolera humanização).
    const rawEndBeat = endBeat;
    endBeat = Math.round(endBeat * grid) / grid;
    if (endBeat > rawEndBeat + TAIL_ROUND_UP) endBeat = Math.floor(rawEndBeat * grid) / grid;
    if (endBeat > limitBeat + 1e-6) endBeat = Math.floor(limitBeat * grid + 1e-6) / grid;

    const lengthBeats = endBeat - startBeat;
    const endTime = beatsToSeconds(endBeat, tempoMap);
    if (lengthBeats < settings.holdMinBeats - BEAT_TOLERANCE || endTime - note.time < HOLD_SETTINGS.minDuration) return;
    candidates.push({ index, start: note.time, end: endTime, hand: handOf(note.key), lengthBeats });
  });

  // 2. Limite de proporção e no máximo um hold por mão ao mesmo tempo.
  //    Os mais longos têm prioridade; empate resolvido pelo tempo (determinístico).
  const maxHolds = notes.length ? Math.max(1, Math.floor(notes.length * settings.holdMaxRatio)) : 0;
  const accepted = [];
  [...candidates]
    .sort((a, b) => b.lengthBeats - a.lengthBeats || a.start - b.start)
    .forEach((candidate) => {
      if (accepted.length >= maxHolds) return;
      const overlaps = accepted.some((other) => other.hand === candidate.hand && candidate.start < other.end && other.start < candidate.end);
      if (!overlaps) accepted.push(candidate);
    });

  const durationByIndex = new Map(accepted.map((hold) => [hold.index, Number((hold.end - hold.start).toFixed(3))]));
  return notes.map((note, index) => {
    const plain = stripInternal(note);
    return durationByIndex.has(index) ? { ...plain, duration: durationByIndex.get(index) } : plain;
  });
}
