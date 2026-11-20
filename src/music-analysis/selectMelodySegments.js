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
  const times = starts.map((beat) => beatsToSeconds(beat, tempoMap));
  return times.map((start, index) => ({ start, end: times[index + 1] ?? Infinity }));
}

function countNotes(notes, start, end) {
  let count = 0;
  for (const note of notes) {
    if (note.start >= end) break;
    if (note.start >= start) count += 1;
  }
  return count;
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
  const blocks = segmentBoundaries(song, settings.measuresPerSegment);
  const states = [...candidates.map((track) => track.id), SILENCE];

  // Pontuação de cada estado em cada bloco.
  const scores = blocks.map((block) => states.map((id) => {
    if (id === SILENCE) return 0;
    const track = candidates.find((item) => item.id === id);
    const count = countNotes(notesById.get(id) ?? [], block.start, block.end);
    if (!count) return -Infinity;
    return track.melodyScore - (count < settings.minNotes ? settings.sparsePenalty : 0);
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
    if (previous && previous.trackId === trackId) previous.end = blocks[block].end;
    else segments.push({ start: blocks[block].start, end: blocks[block].end, trackId });
  });
  const trackIds = [...new Set(segments.map((segment) => segment.trackId).filter(Boolean))];
  return { segments, trackIds };
}

/** Filtra as notas das tracks para manter só as do trecho em que cada track é a melodia. */
export function notesForSegments(song, segments) {
  return segments.flatMap((segment) => {
    if (!segment.trackId) return [];
    const track = song.tracks.find((item) => item.id === segment.trackId);
    return (track?.notes ?? []).filter((note) => note.start >= segment.start && note.start < segment.end);
  });
}
