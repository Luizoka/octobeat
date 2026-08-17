export function mapPitchToLane(pitch, range) {
  const { min, max } = range;
  if (max <= min) return 3;
  return Math.max(0, Math.min(7, Math.round(((pitch - min) / (max - min)) * 7)));
}

export function getPitchRange(notes) {
  const pitches = notes.map((note) => note.pitch).filter(Number.isFinite).sort((a, b) => a - b);
  return { min: pitches[0] ?? 60, max: pitches.at(-1) ?? 60 };
}
