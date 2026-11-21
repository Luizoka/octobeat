import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSong } from "./analyzeSong.js";
import { blockCoverage, notesForSegments, selectMelodySegments } from "./selectMelodySegments.js";
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

test("blockCoverage conta janelas com onset", () => {
  assert.equal(blockCoverage([0, 0.5, 1], 0, 16, 2), 1 / 8);
  assert.equal(blockCoverage([0, 2, 4, 6, 8, 10, 12, 14], 0, 16, 2), 1);
  assert.equal(blockCoverage([], 0, 16, 2), 0);
});

test("track quase parada no bloco perde para outra que toca a melodia", () => {
  // O lead (melhor pontuado) toca tudo, mas no 2º bloco só 4 notas no fim;
  // a flauta toca o 2º bloco inteiro.
  const s = song([
    track("lead", "synth", [...line(0, 8), ...line(15, 16), ...line(16, 24)], "lead 1"),
    track("flute", "winds", line(8, 16)),
  ], 24);
  const { segments } = selectMelodySegments(s, analyzeSong(s));
  const at12 = segments.filter((seg) => seg.start <= 12 && seg.end > 12).map((seg) => seg.trackId);
  assert.ok(at12.includes("flute"));
});

test("buraco dentro do trecho é preenchido por outra track (fill)", () => {
  // Lead: 0–14 s e 16–32 s (buraco de 2 s = 4 beats); flauta toca 0–32 s.
  const s = song([
    track("lead", "synth", [...line(0, 12), ...line(16, 32)], "lead 1"),
    track("flute", "winds", line(0, 32, { pitch: 70 })),
  ], 32);
  const { segments } = selectMelodySegments(s, analyzeSong(s));
  const fill = segments.find((seg) => seg.fill);
  assert.ok(fill, "há um fill");
  assert.equal(fill.trackId, "flute");
  assert.equal(fill.start, 12);
  assert.equal(fill.end, 16);
  const notes = notesForSegments(s, segments);
  assert.ok(notes.some((note) => note.start >= 12 && note.start < 16));
});

test("baixo não preenche buraco da melodia", () => {
  const s = song([
    track("lead", "synth", [...line(0, 12), ...line(16, 32)], "lead 1"),
    track("bass", "synth", line(0, 32, { pitch: 40 })),
  ], 32);
  const { segments } = selectMelodySegments(s, analyzeSong(s));
  assert.ok(!segments.some((seg) => seg.fill));
});
