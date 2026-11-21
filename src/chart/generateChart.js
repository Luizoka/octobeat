import { getPitchRange, mapPitchToLane } from "./mapPitchToLane.js";
import { simplifyChart } from "./simplifyChart.js";
import { applyHolds } from "./applyHolds.js";
import { breakJacks } from "./breakJacks.js";
import { notesForSegments } from "../music-analysis/selectMelodySegments.js";

/**
 * @param {object} options
 * @param {string[]} [options.trackIds]  tracks usadas (todas as notas delas)
 * @param {Array}    [options.segments]  melodia por segmento (modo Essência); quando
 *                                       presente, cada track só contribui no seu trecho
 */
export function generateChart(song, { trackIds, segments, difficulty = "normal" } = {}) {
  const sourceNotes = segments?.length
    ? notesForSegments(song, segments)
    : song.tracks.filter((track) => !trackIds || trackIds.includes(track.id)).flatMap((track) => track.notes);
  const range = getPitchRange(sourceNotes);
  const simplified = simplifyChart(sourceNotes
    .map((note) => ({ ...note, key: mapPitchToLane(note.pitch, range) }))
    .sort((a, b) => a.start - b.start || a.pitch - b.pitch)
    .map((note) => ({ ...note, time: note.start })), difficulty, {
    tempoChanges: song.tempoChanges,
    timeSignatures: song.timeSignatures,
  });
  return applyHolds(breakJacks(simplified), difficulty, { tempoChanges: song.tempoChanges });
}
