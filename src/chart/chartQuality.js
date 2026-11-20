// Métricas de qualidade de chart. Puro, sem dependência de React.
// Serve para comparar versões do gerador de forma objetiva (scripts/evaluateCharts.js).

import { buildTempoMap, secondsToBeats } from "./beatGrid.js";

export const QUALITY_DEFAULTS = Object.freeze({
  laneCount: 8,
  chordTolerance: 0.035, // segundos: notas mais próximas que isso formam um acorde
  onBeatTolerance: 0.08, // fração de beat aceita como "em cima do tempo"
  jackGap: 0.25, // segundos: mesma lane repetida mais rápido que isso é um jack
  fastGap: 0.3, // segundos: vizinhança considerada "alta velocidade"
  npsWindow: 1, // segundos: janela deslizante do NPS de pico
});

function groupEvents(notes, tolerance) {
  const events = [];
  notes.forEach((note) => {
    const event = events.at(-1);
    if (event && note.time - event.time <= tolerance) event.notes.push(note);
    else events.push({ time: note.time, notes: [note] });
  });
  return events;
}

function distanceToBeat(beat) {
  return Math.abs(beat - Math.round(beat));
}

function peakNps(times, window) {
  let peak = 0;
  let start = 0;
  for (let end = 0; end < times.length; end += 1) {
    while (times[end] - times[start] >= window) start += 1;
    peak = Math.max(peak, end - start + 1);
  }
  return peak / window;
}

function laneEntropy(notes, laneCount) {
  if (!notes.length) return 0;
  const counts = Array(laneCount).fill(0);
  notes.forEach((note) => { counts[note.key] += 1; });
  const entropy = counts.reduce((sum, count) => {
    if (!count) return sum;
    const p = count / notes.length;
    return sum - p * Math.log2(p);
  }, 0);
  return entropy / Math.log2(laneCount);
}

/**
 * Avalia um chart ({ time, key }[]).
 * @param {object} context
 * @param {Array} context.tempoChanges  mudanças de tempo da música (para posições em beat)
 * @param {Array} context.sourceNotes   notas originais ({ start }) das tracks usadas, para medir cobertura dos beats
 */
export function evaluateChart(chartNotes, { tempoChanges, sourceNotes = [], ...overrides } = {}) {
  const options = { ...QUALITY_DEFAULTS, ...overrides };
  const notes = [...chartNotes]
    .filter((note) => Number.isFinite(note.time) && Number.isInteger(note.key))
    .sort((a, b) => a.time - b.time || a.key - b.key);
  const tempoMap = buildTempoMap(tempoChanges);
  const half = options.laneCount / 2;

  if (!notes.length) {
    return { noteCount: 0, averageNps: 0, peakNps: 0, onBeatRatio: 0, beatRecall: 0, laneEntropy: 0,
      laneUsage: Array(options.laneCount).fill(0), jacks: 0, jackRatio: 0, sameLaneRepeatRatio: 0,
      chords: 0, sameHandTriples: 0, unplayable: 0, holdCount: 0, holdRatio: 0, holdConflicts: 0 };
  }

  // Ritmo: quantas notas caem no beat e quantos beats "com música" o chart cobre.
  const beats = notes.map((note) => secondsToBeats(note.time, tempoMap));
  const onBeat = beats.filter((beat) => distanceToBeat(beat) <= options.onBeatTolerance).length;
  const sourceBeats = new Set(sourceNotes
    .map((note) => secondsToBeats(note.start ?? note.time, tempoMap))
    .filter((beat) => distanceToBeat(beat) <= options.onBeatTolerance)
    .map(Math.round));
  const chartBeats = new Set(beats.filter((beat) => distanceToBeat(beat) <= options.onBeatTolerance).map(Math.round));
  const coveredBeats = [...sourceBeats].filter((beat) => chartBeats.has(beat)).length;

  // Densidade: NPS médio no trecho ativo do chart (ignora intro/outro silenciosas).
  const times = notes.map((note) => note.time);
  const span = times.at(-1) - times[0];

  // Jogabilidade.
  const events = groupEvents(notes, options.chordTolerance);
  let jacks = 0;
  let sameLaneRepeats = 0;
  let sameHandTriples = 0;
  let unplayable = 0;
  const lastTimeInLane = new Map();
  events.forEach((event, index) => {
    const lanes = [...new Set(event.notes.map((note) => note.key))];
    lanes.forEach((lane) => {
      const last = lastTimeInLane.get(lane);
      if (last != null && event.time - last < options.jackGap) jacks += 1;
      lastTimeInLane.set(lane, event.time);
    });
    const previous = events[index - 1];
    if (previous && lanes.length === 1 && previous.notes.length === 1 && previous.notes[0].key === lanes[0]) sameLaneRepeats += 1;

    const left = lanes.filter((lane) => lane < half).length;
    const right = lanes.length - left;
    if (left >= 3 || right >= 3) {
      sameHandTriples += 1;
      const next = events[index + 1];
      const nearPrevious = previous && event.time - previous.time < options.fastGap;
      const nearNext = next && next.time - event.time < options.fastGap;
      if (nearPrevious || nearNext) unplayable += 1;
    }
  });

  // Holds: conflito = outra nota na mesma lane durante o hold, ou dois holds
  // simultâneos na mesma mão. Ambos deveriam ser sempre 0.
  const holds = notes.filter((note) => note.duration > 0);
  let holdConflicts = 0;
  holds.forEach((hold, index) => {
    const end = hold.time + hold.duration;
    const sameLane = notes.some((note) => note !== hold && note.key === hold.key && note.time > hold.time && note.time < end);
    const sameHand = holds.slice(index + 1).some((other) => (other.key < half) === (hold.key < half) && other.time < end);
    if (sameLane || sameHand) holdConflicts += 1;
  });

  const laneUsage = Array(options.laneCount).fill(0);
  notes.forEach((note) => { laneUsage[note.key] += 1; });

  return {
    noteCount: notes.length,
    averageNps: span > 0 ? notes.length / span : notes.length,
    peakNps: peakNps(times, options.npsWindow),
    onBeatRatio: onBeat / notes.length,
    beatRecall: sourceBeats.size ? coveredBeats / sourceBeats.size : 0,
    laneEntropy: laneEntropy(notes, options.laneCount),
    laneUsage,
    jacks,
    jackRatio: jacks / notes.length,
    sameLaneRepeatRatio: events.length > 1 ? sameLaneRepeats / (events.length - 1) : 0,
    chords: events.filter((event) => event.notes.length > 1).length,
    sameHandTriples,
    unplayable,
    holdCount: holds.length,
    holdRatio: holds.length / notes.length,
    holdConflicts,
  };
}
