import test from "node:test";
import assert from "node:assert/strict";
import { beatsToSeconds, buildTempoMap, secondsToBeats } from "./beatGrid.js";
import { evaluateChart } from "./chartQuality.js";

const close = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} ≠ ${expected}`);

test("beatGrid usa 120 BPM quando não há mudanças de tempo", () => {
  const map = buildTempoMap([]);
  close(secondsToBeats(1, map), 2);
  close(beatsToSeconds(3, map), 1.5);
});

test("beatGrid acumula beats através de mudanças de tempo", () => {
  // 4 s a 60 BPM = 4 beats; depois 120 BPM.
  const map = buildTempoMap([{ time: 0, bpm: 60 }, { time: 4, bpm: 120 }]);
  close(secondsToBeats(4, map), 4);
  close(secondsToBeats(5, map), 6);
  close(beatsToSeconds(6, map), 5);
  close(beatsToSeconds(2, map), 2);
});

test("beatGrid estende o primeiro tempo para antes do primeiro evento", () => {
  const map = buildTempoMap([{ time: 1, bpm: 60 }]);
  close(secondsToBeats(0.5, map), 0.5);
});

test("chart vazio retorna métricas zeradas", () => {
  const result = evaluateChart([]);
  assert.equal(result.noteCount, 0);
  assert.equal(result.unplayable, 0);
});

test("onBeatRatio separa notas no tempo de notas fora dele", () => {
  // 120 BPM: beats a cada 0,5 s.
  const notes = [{ time: 0, key: 0 }, { time: 0.5, key: 1 }, { time: 0.75, key: 2 }, { time: 1.1, key: 3 }];
  const result = evaluateChart(notes, { tempoChanges: [{ time: 0, bpm: 120 }] });
  close(result.onBeatRatio, 0.5);
});

test("beatRecall mede quantos beats com música o chart cobre", () => {
  const sourceNotes = [0, 0.5, 1, 1.5].map((start) => ({ start }));
  const chart = [{ time: 0, key: 0 }, { time: 1, key: 2 }];
  close(evaluateChart(chart, { sourceNotes }).beatRecall, 0.5);
});

test("entropia é 1 com as 8 lanes iguais e 0 com uma lane só", () => {
  const spread = Array.from({ length: 16 }, (_, index) => ({ time: index, key: index % 8 }));
  const single = Array.from({ length: 16 }, (_, index) => ({ time: index, key: 3 }));
  close(evaluateChart(spread).laneEntropy, 1);
  close(evaluateChart(single).laneEntropy, 0);
  assert.equal(evaluateChart(single).sameLaneRepeatRatio, 1);
});

test("jacks contam só repetições rápidas na mesma lane", () => {
  const notes = [{ time: 0, key: 2 }, { time: 0.1, key: 2 }, { time: 0.2, key: 2 }, { time: 1, key: 2 }];
  assert.equal(evaluateChart(notes).jacks, 2);
});

test("NPS de pico usa janela deslizante", () => {
  const notes = [0, 0.1, 0.2, 0.3, 5].map((time, key) => ({ time, key }));
  const result = evaluateChart(notes);
  assert.equal(result.peakNps, 4);
  close(result.averageNps, 1);
});

test("acorde de 3 na mesma mão só é injogável em alta velocidade", () => {
  const triple = (time) => [0, 1, 2].map((key) => ({ time, key }));
  const slow = evaluateChart([...triple(0), { time: 2, key: 5 }]);
  assert.equal(slow.sameHandTriples, 1);
  assert.equal(slow.unplayable, 0);
  const fast = evaluateChart([...triple(0), { time: 0.15, key: 5 }]);
  assert.equal(fast.unplayable, 1);
  // Acorde dividido entre as mãos (2 + 2) não conta.
  assert.equal(evaluateChart([0, 1, 4, 5].map((key) => ({ time: 0, key }))).sameHandTriples, 0);
});
