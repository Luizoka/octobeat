import test from "node:test";
import assert from "node:assert/strict";
import { simplifyChart } from "./simplifyChart.js";

// 120 BPM, 4/4: 1 beat = 0,5 s.
const at = (beat, key = beat % 8, velocity = 0.8) => ({ time: beat * 0.5, key: Math.floor(key), pitch: 60 + Math.floor(key), velocity });
const beatsOf = (chart) => chart.map((note) => note.time / 0.5);

test("fácil mantém os tempos e descarta contratempos de uma linha de colcheias", () => {
  const eighths = Array.from({ length: 16 }, (_, index) => at(index / 2, index % 8));
  assert.deepEqual(beatsOf(simplifyChart(eighths, "easy")), [0, 1, 2, 3, 4, 5, 6, 7]);
});

test("contratempo não rouba o tempo forte seguinte (bug do filtro guloso)", () => {
  // Anacruse em 3,5 seguida do tempo 1 do compasso seguinte.
  const notes = [at(3.5, 1), at(4, 2)];
  assert.deepEqual(beatsOf(simplifyChart(notes, "easy")), [4]);
});

test("normal e difícil diferem pela subdivisão", () => {
  const sixteenths = Array.from({ length: 16 }, (_, index) => at(index / 4, index % 8));
  assert.equal(simplifyChart(sixteenths, "normal").length, 8);
  assert.equal(simplifyChart(sixteenths, "hard").length, 16);
});

test("piso em segundos protege músicas muito rápidas", () => {
  // 240 BPM: semicolcheias a 0,0625 s; difícil exige ≥ 0,1 s.
  const notes = Array.from({ length: 16 }, (_, index) => ({ time: index * 0.0625, key: index % 8, pitch: 60 }));
  const chart = simplifyChart(notes, "hard", { tempoChanges: [{ time: 0, bpm: 240 }] });
  chart.slice(1).forEach((note, index) => assert.ok(note.time - chart[index].time >= 0.1 - 1e-9));
});

test("espaçamento segue o tempo musical quando o BPM muda", () => {
  // 60 BPM por 4 s (4 beats) e depois 120 BPM: colcheias em ambos os trechos.
  const tempoChanges = [{ time: 0, bpm: 60 }, { time: 4, bpm: 120 }];
  const slow = Array.from({ length: 8 }, (_, index) => ({ time: index * 0.5, key: index % 8, pitch: 60 }));
  const fast = Array.from({ length: 8 }, (_, index) => ({ time: 4 + index * 0.25, key: index % 8, pitch: 60 }));
  const chart = simplifyChart([...slow, ...fast], "easy", { tempoChanges });
  assert.deepEqual(chart.map((note) => note.time), [0, 1, 2, 3, 4, 4.5, 5, 5.5]);
});

test("acordes respeitam maxChord e não repetem lane", () => {
  const chord = [at(0, 1, 0.9), at(0, 1, 0.7), at(0, 3, 0.8), at(0, 5, 0.6)];
  assert.equal(simplifyChart(chord, "easy").length, 1);
  assert.deepEqual(simplifyChart(chord, "normal").map((note) => note.key), [1, 3]);
  assert.deepEqual(simplifyChart(chord, "hard").map((note) => note.key), [1, 3, 5]);
});

test("tempo das notas não é deslocado para a grade", () => {
  const humanized = [{ time: 0.02, key: 0, pitch: 60 }, { time: 0.51, key: 1, pitch: 62 }];
  assert.deepEqual(simplifyChart(humanized, "easy").map((note) => note.time), [0.02, 0.51]);
});

test("resultado é determinístico", () => {
  const notes = Array.from({ length: 40 }, (_, index) => at((index * 7) % 23 / 3, index % 8, (index % 5) / 5));
  const sorted = [...notes].sort((a, b) => a.time - b.time);
  assert.deepEqual(simplifyChart(sorted, "normal"), simplifyChart(sorted, "normal"));
});
