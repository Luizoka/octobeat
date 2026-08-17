const DEFAULT_BPM = 120;

export function makeOctoBeatSong(data = {}) {
  const tracks = (data.tracks ?? []).map((track, index) => ({
    id: String(track.id ?? `track-${index + 1}`),
    name: String(track.name || `Track ${index + 1}`),
    instrument: String(track.instrument || "unknown"),
    notes: (track.notes ?? [])
      .map((note) => ({
        pitch: Number(note.pitch),
        start: Number(note.start),
        duration: Math.max(0, Number(note.duration) || 0),
        velocity: Number.isFinite(Number(note.velocity)) ? Math.max(0, Math.min(1, Number(note.velocity))) : undefined,
        voice: note.voice == null ? undefined : String(note.voice),
      }))
      .filter((note) => Number.isFinite(note.pitch) && Number.isFinite(note.start) && note.start >= 0)
      .sort((a, b) => a.start - b.start || a.pitch - b.pitch),
  }));

  const lastNote = tracks.flatMap((track) => track.notes).reduce((last, note) => Math.max(last, note.start + note.duration), 0);
  const tempoChanges = (data.tempoChanges ?? [{ time: 0, bpm: DEFAULT_BPM }])
    .map((change) => ({ time: Math.max(0, Number(change.time) || 0), bpm: Number(change.bpm) || DEFAULT_BPM }))
    .filter((change) => change.bpm > 0)
    .sort((a, b) => a.time - b.time);

  return {
    title: String(data.title || "Música importada"),
    artist: String(data.artist || "Artista desconhecido"),
    duration: Math.max(Number(data.duration) || 0, lastNote),
    tempoChanges: tempoChanges.length ? tempoChanges : [{ time: 0, bpm: DEFAULT_BPM }],
    timeSignatures: data.timeSignatures ?? [],
    tracks,
    source: data.source,
  };
}

export function validateOctoBeatSong(song) {
  const normalized = makeOctoBeatSong(song);
  if (!normalized.tracks.some((track) => track.notes.length)) {
    throw new Error("A música não possui notas interpretáveis.");
  }
  return normalized;
}

export const DEFAULT_TEMPO = DEFAULT_BPM;
