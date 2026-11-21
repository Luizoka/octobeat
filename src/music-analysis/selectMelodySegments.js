// Melodia por segmento: escolhe, para cada bloco de compassos, qual track
// carrega a melodia. Resolve o caso em que a melodia troca de instrumento no
// meio da música (antes, o modo Essência ficava mudo nesses trechos).
// Puro, sem React.

import { MELODY_SEGMENTS } from "./config.js";
import { beatsToSeconds, buildMeasureMap, buildTempoMap, measureStarts, secondsToBeats } from "../chart/beatGrid.js";

const SILENCE = null;

function segmentBoundaries(song, measuresPerSegment) {
  const tempoMap = buildTempoMap(song.tempoChanges);
  const measureMap = buildMeasureMap(song.timeSignatures, tempoMap);
  const endBeat = secondsToBeats(Math.max(song.duration, 0), tempoMap);
  // Um compasso que começa exatamente no fim da música não forma bloco.
  const starts = measureStarts(measureMap, 0, endBeat)
    .filter((beat, index) => index % measuresPerSegment === 0 && (beat === 0 || beat < endBeat - 1e-6));
  const ends = [...starts.slice(1), Math.max(endBeat, (starts.at(-1) ?? 0) + 1)];
  return starts.map((beat, index) => ({
    start: beatsToSeconds(beat, tempoMap),
    end: index + 1 < starts.length ? beatsToSeconds(starts[index + 1], tempoMap) : Infinity,
    startBeat: beat,
    endBeat: ends[index],
  }));
}

function notesInBlock(notes, start, end) {
  const inside = [];
  for (const note of notes) {
    if (note.start >= end) break;
    if (note.start >= start) inside.push(note);
  }
  return inside;
}

/**
 * Cobertura de um bloco: fração das janelas de `windowBeats` que têm pelo menos
 * um onset. Uma track com 6 notas espalhadas num bloco de 16 beats deixa o
 * jogador parado vários segundos; outra que toca o bloco inteiro cobre 100%.
 */
export function blockCoverage(onsetBeats, startBeat, endBeat, windowBeats) {
  const windowCount = Math.max(1, Math.round((endBeat - startBeat) / windowBeats));
  const filled = new Set();
  onsetBeats.forEach((beat) => {
    const index = Math.floor((beat - startBeat) / windowBeats + 1e-6);
    if (index >= 0 && index < windowCount) filled.add(index);
  });
  return filled.size / windowCount;
}

/**
 * @returns {{ segments: Array<{ start: number, end: number, trackId: string|null }>, trackIds: string[] }}
 *   `trackId` null = trecho sem melodia (só bateria ou silêncio).
 */
export function selectMelodySegments(song, analysis, settings = MELODY_SEGMENTS) {
  const candidates = analysis.tracks.filter((track) => track.noteCount > 0
    && !track.suspicious
    && track.instrumentFamily !== "percussion"
    && Number.isFinite(track.melodyScore));
  if (!candidates.length) return { segments: [], trackIds: [] };

  const notesById = new Map(song.tracks.map((track) => [track.id, [...track.notes].sort((a, b) => a.start - b.start)]));
  const tempoMap = buildTempoMap(song.tempoChanges);
  const blocks = segmentBoundaries(song, settings.measuresPerSegment);
  const states = [...candidates.map((track) => track.id), SILENCE];

  // Pontuação de cada estado em cada bloco.
  const scores = blocks.map((block) => states.map((id) => {
    if (id === SILENCE) return 0;
    const track = candidates.find((item) => item.id === id);
    const notes = notesInBlock(notesById.get(id) ?? [], block.start, block.end);
    if (!notes.length) return -Infinity;
    const coverage = blockCoverage(notes.map((note) => secondsToBeats(note.start, tempoMap)), block.startBeat, block.endBeat, settings.coverageWindowBeats);
    return track.melodyScore
      - (notes.length < settings.minNotes ? settings.sparsePenalty : 0)
      - (1 - coverage) * settings.gapPenalty;
  }));

  // Viterbi: melhor caminho somando pontos e descontando trocas de track.
  // Entrar ou sair do silêncio não custa nada.
  const switchCost = (from, to) => (from === to || from === SILENCE || to === SILENCE ? 0 : settings.switchCost);
  let best = scores[0] ?? [];
  const back = [];
  for (let block = 1; block < blocks.length; block += 1) {
    const pointers = [];
    best = states.map((to, toIndex) => {
      let bestValue = -Infinity;
      let bestFrom = 0;
      states.forEach((from, fromIndex) => {
        const value = best[fromIndex] - switchCost(from, to);
        if (value > bestValue) { bestValue = value; bestFrom = fromIndex; }
      });
      pointers.push(bestFrom);
      return bestValue + scores[block][toIndex];
    });
    back.push(pointers);
  }

  let stateIndex = best.reduce((top, value, index) => (value > best[top] ? index : top), 0);
  const path = [stateIndex];
  for (let block = back.length - 1; block >= 0; block -= 1) {
    stateIndex = back[block][stateIndex];
    path.unshift(stateIndex);
  }

  // Junta blocos vizinhos com a mesma track.
  const segments = [];
  path.forEach((index, block) => {
    const trackId = states[index];
    const previous = segments.at(-1);
    if (previous && previous.trackId === trackId) {
      previous.end = blocks[block].end;
      previous.endBeat = blocks[block].endBeat;
    } else {
      segments.push({ start: blocks[block].start, end: blocks[block].end, startBeat: blocks[block].startBeat, endBeat: blocks[block].endBeat, trackId });
    }
  });
  const trackIds = [...new Set(segments.map((segment) => segment.trackId).filter(Boolean))];
  const fills = findGapFills(segments, candidates, notesById, tempoMap, settings);
  const all = [...segments, ...fills]
    .sort((a, b) => a.start - b.start || Number(Boolean(a.fill)) - Number(Boolean(b.fill)))
    .map(({ startBeat, endBeat, ...segment }) => segment);
  return { segments: all, trackIds };
}

/**
 * Preenchimento de buracos: dentro do trecho de uma track, janelas seguidas em
 * que ela não toca nada (nem nota sustentada) por `fillMinBeats` ou mais são
 * emprestadas da melhor outra track que tenha onsets ali. Resolve o caso em
 * que a melodia troca de instrumento no meio de um bloco de 4 compassos.
 * Devolve segmentos extras marcados com `fill: true`.
 */
function findGapFills(segments, candidates, notesById, tempoMap, settings) {
  const window = settings.coverageWindowBeats;
  const minWindows = Math.max(1, Math.round(settings.fillMinBeats / window));
  const fills = [];
  segments.forEach((segment) => {
    if (!segment.trackId) return;
    const own = notesById.get(segment.trackId) ?? [];
    const count = Math.max(1, Math.round((segment.endBeat - segment.startBeat) / window));
    const bounds = Array.from({ length: count + 1 }, (_, index) => beatsToSeconds(segment.startBeat + index * window, tempoMap));
    const busy = Array.from({ length: count }, (_, index) => own.some((note) => note.start < bounds[index + 1] - 1e-6
      && note.start + Math.max(note.duration ?? 0, 0) > bounds[index] + 1e-6));

    let index = 0;
    while (index < count) {
      if (busy[index]) { index += 1; continue; }
      let end = index;
      while (end < count && !busy[end]) end += 1;
      if (end - index >= minWindows) {
        const start = bounds[index];
        const stop = bounds[end];
        let best = null;
        const ownTrack = candidates.find((track) => track.id === segment.trackId);
        candidates.forEach((track) => {
          if (track.id === segment.trackId) return;
          // Track muito mais grave que a melodia (baixo, acompanhamento) não preenche.
          if (ownTrack && track.medianPitch < ownTrack.medianPitch - settings.fillMaxPitchDrop) return;
          const notes = (notesById.get(track.id) ?? []).filter((note) => note.start >= start && note.start < stop);
          if (notes.length < settings.minNotes) return;
          const coverage = blockCoverage(notes.map((note) => secondsToBeats(note.start, tempoMap)),
            segment.startBeat + index * window, segment.startBeat + end * window, window);
          const value = track.melodyScore - (1 - coverage) * settings.gapPenalty;
          if (!best || value > best.value) best = { value, trackId: track.id };
        });
        if (best) fills.push({ start, end: stop, trackId: best.trackId, fill: true });
      }
      index = end;
    }
  });
  return fills;
}

/**
 * Filtra as notas das tracks para manter só as do trecho em que cada track é a
 * melodia. Segmentos `fill` cobrem buracos dentro de outro segmento.
 */
export function notesForSegments(song, segments) {
  return segments.flatMap((segment) => {
    if (!segment.trackId) return [];
    const track = song.tracks.find((item) => item.id === segment.trackId);
    return (track?.notes ?? []).filter((note) => note.start >= segment.start && note.start < segment.end);
  });
}
