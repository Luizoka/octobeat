export function calculateChartMetrics(notes, duration = 0, sourceTracks = []) {
  const perSecond = new Map();
  const chords = new Map();
  notes.forEach((note) => {
    const second = Math.floor(note.time);
    perSecond.set(second, (perSecond.get(second) ?? 0) + 1);
    const chordKey = note.time.toFixed(3);
    chords.set(chordKey, (chords.get(chordKey) ?? 0) + 1);
  });
  const chordSizes = [...chords.values()];
  return {
    totalNotes: notes.length,
    averageNps: duration > 0 ? notes.length / duration : 0,
    peakNps: Math.max(0, ...perSecond.values()),
    chordCount: chordSizes.filter((size) => size > 1).length,
    largestChord: Math.max(0, ...chordSizes),
    sourceTracks,
  };
}
