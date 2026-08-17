import test from "node:test";
import assert from "node:assert/strict";
import { analyzeTrack } from "./analyzeTrack.js";
import { analyzeSong } from "./analyzeSong.js";
import { selectGameplayTracks } from "./selectGameplayTracks.js";
import { classifyMidiTrack } from "../music/midi/classifyTrack.js";

function notes(count, { spacing = 0.25, pitch = 64, duration = 0.18, velocity = 0.8 } = {}) {
  return Array.from({ length: count }, (_, index) => ({ pitch: pitch + (index % 5), start: index * spacing, duration, velocity }));
}

function track(id, family, trackNotes, instrument = family) {
  return { id, name: id, family, instrument, notes: trackNotes };
}

test("tracks vazias são ignoradas no ranking", () => {
  const report = analyzeSong({ duration: 20, tracks: [track("empty", "piano", []), track("lead", "synth", notes(40))] });
  assert.equal(report.tracks[0].noteCount, 0);
  assert.equal(report.tracks[0].melodyScore, Number.NEGATIVE_INFINITY);
  assert.equal(report.selectedTrackId, "lead");
});

test("track acima de 30 NPS é suspeita e não é selecionada", () => {
  const absurd = analyzeTrack(track("absurd", "synth", notes(1000, { spacing: 0.001 })), 10);
  assert.equal(absurd.notesPerSecond, 100);
  assert.equal(absurd.suspicious, true);
  const result = selectGameplayTracks({ duration: 10, tracks: [track("absurd", "synth", notes(1000, { spacing: 0.001 })), track("piano", "piano", notes(30))] });
  assert.deepEqual(result.trackIds, ["piano"]);
});

test("lead monofônico vence bass normal", () => {
  const song = { duration: 20, tracks: [
    track("bass", "bass", notes(60, { pitch: 36 })),
    track("lead", "synth", notes(50, { pitch: 72 }), "lead 1 (square)"),
  ] };
  const report = analyzeSong(song);
  assert.equal(report.selectedTrackId, "lead");
  assert.ok(report.candidates[0].melodyScore > report.candidates[1].melodyScore);
});

test("monofonia distingue linha melódica de acordes", () => {
  const melody = analyzeTrack(track("melody", "piano", notes(20)), 10);
  const chords = analyzeTrack(track("chords", "piano", Array.from({ length: 20 }, (_, index) => ({ pitch: 60 + index % 4, start: Math.floor(index / 4), duration: 0.8, velocity: 0.8 }))), 10);
  assert.ok(melody.monophonyRatio > 0.95);
  assert.ok(chords.polyphonyRatio > 0.9);
});

test("modo piano e modo personalizado permanecem independentes", () => {
  const song = { duration: 10, tracks: [track("piano", "piano", notes(30)), track("lead", "synth", notes(30, { pitch: 76 }), "lead 1")] };
  assert.deepEqual(selectGameplayTracks(song, { mode: "piano" }).trackIds, ["piano"]);
  assert.deepEqual(selectGameplayTracks(song, { mode: "custom", customTrackIds: ["lead"] }).trackIds, ["lead"]);
});

test("nomes explícitos de bass vencem fallback de piano ou guitar", () => {
  assert.equal(classifyMidiTrack({ program: 0, name: "808 Bass", instrument: "acoustic grand piano" }), "bass");
  assert.equal(classifyMidiTrack({ program: 32, name: "Bass Guitar", instrument: "acoustic bass" }), "bass");
});
