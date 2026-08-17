export function normalizeNotes(notes, laneCount = 8) {
  if (!Array.isArray(notes)) return [];
  return notes.map((note) => ({ time: Number(note?.time), key: Number(note?.key) }))
    .filter((note) => Number.isFinite(note.time) && Number.isInteger(note.key) && note.time >= 0 && note.key >= 0 && note.key < laneCount)
    .sort((a, b) => a.time - b.time || a.key - b.key);
}
