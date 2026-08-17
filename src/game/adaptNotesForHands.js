export function adaptNotesForHands(notes, mode = "both") {
  if (mode === "both") return notes.map((note) => ({ ...note }));
  const laneOffset = mode === "right" ? 4 : 0;
  const seen = new Set();
  return notes.flatMap((note) => {
    const compactLane = Math.max(0, Math.min(3, Math.round((note.key / 7) * 3)));
    const mapped = { ...note, key: compactLane + laneOffset };
    const identity = `${Number(note.time).toFixed(3)}:${mapped.key}`;
    if (seen.has(identity)) return [];
    seen.add(identity);
    return [mapped];
  });
}
