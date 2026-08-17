import { analyzeTrack } from "./analyzeTrack.js";
import { scoreTrack } from "./scoreTrack.js";

export function analyzeSong(song, options = {}) {
  const tracks = song.tracks
    .map((track) => {
      const analysis = analyzeTrack(track, song.duration, options.density);
      const scored = scoreTrack(analysis, options.preset);
      return { ...analysis, melodyScore: scored.score, scoreReasons: scored.reasons };
    });
  const candidates = tracks
    .filter((track) => track.noteCount > 0 && !track.suspicious)
    .sort((a, b) => b.melodyScore - a.melodyScore || b.noteCount - a.noteCount);
  return { tracks, candidates, selectedTrackId: candidates[0]?.id ?? null };
}
