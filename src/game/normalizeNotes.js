import { fitHoldsToLanes } from "./holdNotes.js";

export function normalizeNotes(notes, laneCount = 8) {
  if (!Array.isArray(notes)) return [];
  const sorted = notes.map((note) => {
    const base = { time: Number(note?.time), key: Number(note?.key) };
    // `duration` é opcional: presente e positivo = nota longa (hold).
    const duration = Number(note?.duration);
    return Number.isFinite(duration) && duration > 0 ? { ...base, duration } : base;
  })
    .filter((note) => Number.isFinite(note.time) && Number.isInteger(note.key) && note.time >= 0 && note.key >= 0 && note.key < laneCount)
    .sort((a, b) => a.time - b.time || a.key - b.key);
  return fitHoldsToLanes(sorted);
}
