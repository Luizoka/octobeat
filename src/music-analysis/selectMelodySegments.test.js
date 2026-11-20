import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSong } from "./analyzeSong.js";
import { notesForSegments, selectMelodySegments } from "./selectMelodySegments.js";
import { selectGameplayTracks } from "./selectGameplayTracks.js";

// 120 BPM, 4/4: 1 compasso = 2 s; bloco de 4 compassos = 8 s.
function line(fromSec, toSec, { pitch = 72, step = 0.25 } = {}) {
  const notes = [];
  for (let time = fromSec; time < toSec - 1e-9; time += step) notes.push({ pitch: pitch + (notes.length % 5), start: time, duration: step * 0.9, velocity: 0.8 });
  return notes;
}
const track = (id, family, notes, instrument = family) => ({ id, name: id, family, instrument, notes });
const song = (tracks, duration) => ({ duration, tempoChanges: [{ time: 0, bpm: 120 }], timeSignatures: [{ time: 0, beats: 4, beatType: 4 }], tracks });

test("melodia que troca de instrumento é seguida em cada trecho", () => {
  const s = song([
    track("lead", "synth", line(0, 16), "lead 1"),
    track("flute", "winds", line(16, 32)),
    track("drums", "percussion", line(0, 32, { pitch: 36 })),
  ], 32);
  const { segments, trackIds } = selectMelodySegments(s, analyzeSong(s));
  assert.deepEqual(segments.map((seg) => [seg.start, seg.trackId]), [[0, "lead"], [16, "flute"]]);
  assert.deepEqual(trackIds, ["lead", "flute"]);
});

test("custo de troca evita pular para outra track num bloco isolado", () => {
  // O lead toca a música inteira; o violino (pontuação parecida) só num bloco.
  const s = song([
    track("lead", "synth", line(0, 32), "lead 1"),
    track("violin", "strings", line(8, 16, { pitch: 84 })),
  ], 32);
  const { trackIds } = selectMelodySegments(s, analyzeSong(s));
  assert.deepEqual(trackIds, ["lead"]);
});

test("trecho só com bateria vira silêncio, sem penalidade ao voltar", () => {
  const s = song([
    track("lead", "synth", [...line(0, 8), ...line(16, 24)], "lead 1"),
    track("drums", "percussion", line(0, 24, { pitch: 36 })),
  ], 24);
  const { segments } = selectMelodySegments(s, analyzeSong(s));
  assert.deepEqual(segments.map((seg) => seg.trackId), ["lead", null, "lead"]);
});

test("notesForSegments usa cada track só no seu trecho", () => {
  const s = song([track("a", "synth", line(0, 16)), track("b", "winds", line(0, 16))], 16);
  const notes = notesForSegments(s, [{ start: 0, end: 8, trackId: "a" }, { start: 8, end: Infinity, trackId: "b" }]);
  assert.equal(notes.length, 64);
  assert.ok(notes.slice(0, 32).every((note) => note.start < 8));
});

test("modo Essência devolve os segmentos", () => {
  const s = song([track("lead", "synth", line(0, 16), "lead 1"), track("flute", "winds", line(16, 32))], 32);
  const selection = selectGameplayTracks(s, { mode: "essence" });
  assert.equal(selection.segments.length, 2);
});
