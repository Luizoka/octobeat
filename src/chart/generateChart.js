import { getPitchRange, mapPitchToLane } from "./mapPitchToLane.js";
import { simplifyChart } from "./simplifyChart.js";

export function generateChart(song, { trackIds, difficulty = "normal" } = {}) {
  const selected = song.tracks.filter((track) => !trackIds || trackIds.includes(track.id));
  const sourceNotes = selected.flatMap((track) => track.notes);
  const range = getPitchRange(sourceNotes);
  return simplifyChart(sourceNotes
    .map((note) => ({ ...note, key: mapPitchToLane(note.pitch, range) }))
    .sort((a, b) => a.start - b.start || a.pitch - b.pitch)
    .map((note) => ({ ...note, time: note.start })), difficulty);
}
