import { isPianoFamily } from "../music/midi/classifyTrack.js";
import { analyzeSong } from "./analyzeSong.js";

export function selectGameplayTracks(song, { mode = "essence", customTrackIds = [], analysis } = {}) {
  const report = analysis ?? analyzeSong(song);
  if (mode === "custom") {
    const safe = new Set(report.tracks.filter((track) => track.noteCount && !track.suspicious).map((track) => track.id));
    return { trackIds: customTrackIds.filter((id) => safe.has(id)), analysis: report };
  }
  if (mode === "piano") {
    const safePianos = report.tracks.filter((track) => track.noteCount && !track.suspicious && isPianoFamily(track.instrumentFamily));
    return { trackIds: safePianos.map((track) => track.id), analysis: report };
  }
  return { trackIds: report.selectedTrackId ? [report.selectedTrackId] : [], analysis: report };
}
