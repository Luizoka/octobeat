const SETTINGS = {
  easy: { minInterval: 0.28, maxChord: 1 },
  normal: { minInterval: 0.2, maxChord: 2 },
  hard: { minInterval: 0.1, maxChord: 3 },
};

export function simplifyChart(notes, difficulty = "normal") {
  const { minInterval, maxChord } = SETTINGS[difficulty] ?? SETTINGS.normal;
  const groups = [];
  notes.forEach((note) => {
    const group = groups.at(-1);
    if (group && Math.abs(note.time - group.time) <= 0.035) group.notes.push(note);
    else groups.push({ time: note.time, notes: [note] });
  });
  const lastInLane = Array(8).fill(-Infinity);
  let lastGroupTime = -Infinity;
  return groups.flatMap((group) => {
    // A limitação é global: sem ela, camadas de instrumentos poderiam criar
    // entradas simultâneas demais mesmo respeitando o intervalo de cada lane.
    if (group.time - lastGroupTime < minInterval) return [];
    const chartNotes = group.notes
      .sort((a, b) => (b.velocity ?? 0.8) - (a.velocity ?? 0.8) || b.pitch - a.pitch)
      .filter((note, index, all) => all.findIndex((item) => item.key === note.key) === index)
      .slice(0, maxChord)
      .filter((note) => note.time - lastInLane[note.key] >= minInterval)
      .map((note) => { lastInLane[note.key] = note.time; return { time: Number(note.time.toFixed(3)), key: note.key }; });
    if (chartNotes.length) lastGroupTime = group.time;
    return chartNotes;
  });
}
