import { TRACK_DENSITY } from "./config.js";

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function calculateVoiceRatios(notes) {
  const events = notes.flatMap((note) => [
    { time: note.start, delta: 1 },
    { time: note.start + Math.max(note.duration, 0.001), delta: -1 },
  ]).sort((a, b) => a.time - b.time || a.delta - b.delta);
  let voices = 0;
  let previousTime = events[0]?.time ?? 0;
  let activeDuration = 0;
  let monoDuration = 0;
  let polyDuration = 0;
  for (const event of events) {
    const elapsed = Math.max(0, event.time - previousTime);
    if (voices > 0) activeDuration += elapsed;
    if (voices === 1) monoDuration += elapsed;
    if (voices > 1) polyDuration += elapsed;
    voices += event.delta;
    previousTime = event.time;
  }
  return {
    activeDuration,
    monophonyRatio: activeDuration ? monoDuration / activeDuration : 0,
    polyphonyRatio: activeDuration ? polyDuration / activeDuration : 0,
  };
}

export function analyzeTrack(track, songDuration, density = TRACK_DENSITY) {
  const notes = track.notes ?? [];
  const noteCount = notes.length;
  if (!noteCount) {
    return {
      id: track.id, name: track.name, instrumentFamily: track.family || "unknown", instrumentName: track.instrument,
      noteCount: 0, duration: 0, notesPerSecond: 0, minPitch: null, maxPitch: null, averagePitch: null,
      medianPitch: null, averageVelocity: null, velocityVariance: null, averageNoteDuration: null,
      monophonyRatio: 0, polyphonyRatio: 0, activeRatio: 0, suspicious: false, densityLevel: "empty",
    };
  }

  const pitches = notes.map((note) => note.pitch);
  const velocities = notes.map((note) => note.velocity).filter(Number.isFinite);
  const durations = notes.map((note) => note.duration).filter(Number.isFinite);
  const firstStart = Math.min(...notes.map((note) => note.start));
  const lastEnd = Math.max(...notes.map((note) => note.start + note.duration));
  const duration = Math.max(0, lastEnd - firstStart);
  const effectiveSongDuration = Math.max(songDuration || lastEnd, 0.001);
  const notesPerSecond = noteCount / effectiveSongDuration;
  const velocityMean = average(velocities);
  const { activeDuration, monophonyRatio, polyphonyRatio } = calculateVoiceRatios(notes);
  const densityLevel = notesPerSecond >= density.suspicious ? "suspicious"
    : notesPerSecond >= density.veryDense ? "very-dense"
      : notesPerSecond >= density.dense ? "dense" : "normal";

  return {
    id: track.id,
    name: track.name,
    instrumentFamily: track.family || "unknown",
    instrumentName: track.instrument,
    noteCount,
    duration,
    notesPerSecond,
    minPitch: Math.min(...pitches),
    maxPitch: Math.max(...pitches),
    averagePitch: average(pitches),
    medianPitch: median(pitches),
    averageVelocity: velocityMean,
    velocityVariance: velocities.length ? average(velocities.map((value) => (value - velocityMean) ** 2)) : null,
    averageNoteDuration: average(durations),
    monophonyRatio,
    polyphonyRatio,
    activeRatio: Math.min(1, activeDuration / effectiveSongDuration),
    suspicious: notesPerSecond >= density.suspicious,
    densityLevel,
  };
}
