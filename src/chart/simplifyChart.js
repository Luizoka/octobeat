import { CHART_DIFFICULTY } from "../music-analysis/config.js";
import { beatStrength, buildMeasureMap, buildTempoMap, isOnGrid, quantizeBeat, secondsToBeats } from "./beatGrid.js";

const CHORD_TOLERANCE = 0.035; // segundos
// Grade fina (1/12 de beat cobre semicolcheias e tercinas) usada para medir o
// espaçamento: duas notas a 0,98 beat por humanização contam como 1 beat.
const SPACING_GRID = 12;

function groupByOnset(notes) {
  const groups = [];
  notes.forEach((note) => {
    const group = groups.at(-1);
    if (group && Math.abs(note.time - group.time) <= CHORD_TOLERANCE) group.notes.push(note);
    else groups.push({ time: note.time, notes: [note] });
  });
  return groups;
}

/** Primeiro índice de `items` (ordenado por .beat) com beat >= value. */
function lowerBound(items, value) {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (items[mid].beat < value) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * Reduz as notas à densidade da dificuldade usando tempo musical.
 *
 * Os onsets são processados do mais forte para o mais fraco (tempo 1 > tempo forte
 * > pulso > contratempo > subdivisões) e aceitos quando respeitam o espaçamento
 * mínimo em beats até os vizinhos já aceitos. Assim, um contratempo nunca
 * "rouba" o lugar do tempo forte seguinte, como acontecia no filtro guloso.
 *
 * O tempo das notas NÃO é movido para a grade: o áudio toca o MIDI original, e
 * deslocar a nota faria o jogador acertar fora do som. A grade só decide prioridade.
 */
export function simplifyChart(notes, difficulty = "normal", { tempoChanges, timeSignatures } = {}) {
  const settings = CHART_DIFFICULTY[difficulty] ?? CHART_DIFFICULTY.normal;
  const tempoMap = buildTempoMap(tempoChanges);
  const measureMap = buildMeasureMap(timeSignatures, tempoMap);

  const groups = groupByOnset(notes).map((group, index) => {
    const beat = secondsToBeats(group.time, tempoMap);
    const onGrid = isOnGrid(beat, settings.subdivision);
    return {
      ...group,
      index,
      beat,
      gridBeat: quantizeBeat(beat, SPACING_GRID),
      strength: beatStrength(beat, measureMap) * (onGrid ? 1 : settings.offGridPenalty),
      loudness: Math.max(...group.notes.map((note) => note.velocity ?? 0.8)),
    };
  });

  // Ordem determinística: força rítmica, depois volume, depois quem vem antes.
  const byPriority = [...groups].sort((a, b) => b.strength - a.strength || b.loudness - a.loudness || a.time - b.time);
  const accepted = [];
  const fits = (candidate, neighbor) => !neighbor || (
    Math.abs(candidate.gridBeat - neighbor.gridBeat) >= settings.minSpacingBeats - 1e-6
    && Math.abs(candidate.time - neighbor.time) >= settings.minSeconds - 1e-6);
  byPriority.forEach((group) => {
    const position = lowerBound(accepted, group.beat);
    if (fits(group, accepted[position - 1]) && fits(group, accepted[position])) accepted.splice(position, 0, group);
  });

  return accepted.flatMap((group) => group.notes
    .sort((a, b) => (b.velocity ?? 0.8) - (a.velocity ?? 0.8) || b.pitch - a.pitch)
    .filter((note, index, all) => all.findIndex((item) => item.key === note.key) === index)
    .slice(0, settings.maxChord)
    // `sourceDuration` é interno: usado por applyHolds e removido antes do chart final.
    .map((note) => ({ time: Number(note.time.toFixed(3)), key: note.key, ...(note.duration > 0 ? { sourceDuration: note.duration } : {}) }))
    .sort((a, b) => a.key - b.key));
}
