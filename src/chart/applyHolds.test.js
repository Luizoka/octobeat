import test from "node:test";
import assert from "node:assert/strict";
import { applyHolds } from "./applyHolds.js";

// 120 BPM: 1 beat = 0,5 s.
const note = (beat, key, beats) => ({ time: beat * 0.5, key, ...(beats ? { sourceDuration: beats * 0.5 } : {}) });

test("nota de 2 beats vira hold no normal; nota curta não", () => {
  const chart = applyHolds([note(0, 2, 2), note(4, 2, 0.5)], "normal");
  assert.equal(chart[0].duration, 1);
  assert.equal("duration" in chart[1], false);
});

test("sourceDuration nunca vaza para o chart final", () => {
  const chart = applyHolds([note(0, 2, 0.5), note(1, 3, 3)], "normal");
  chart.forEach((item) => assert.equal("sourceDuration" in item, false));
});

test("fácil exige 2 beats", () => {
  // Muitas notas comuns para o limite de proporção não interferir.
  const filler = Array.from({ length: 8 }, (_, index) => note(20 + index, 5));
  assert.equal("duration" in applyHolds([note(0, 1, 1.5), ...filler], "easy")[0], false);
  // 2,5 beats → grade de 1 beat do fácil → 2 beats (1 s).
  assert.equal(applyHolds([note(0, 1, 2.5), ...filler], "easy")[0].duration, 1);
});

test("cauda para antes da próxima nota da mesma lane", () => {
  // 4 beats no MIDI, mas a lane volta no beat 3: cauda em 3 - 0,5 = 2,5 beats.
  const chart = applyHolds([note(0, 2, 4), note(3, 2), ...Array.from({ length: 4 }, (_, i) => note(10 + i, 6))], "normal");
  assert.equal(chart[0].duration, 1.25);
});

test("no fácil, outra nota na mesma mão encurta o hold; na outra mão não", () => {
  const filler = Array.from({ length: 8 }, (_, index) => note(20 + index, 5));
  // Limite em 3 - 0,5 = 2,5 beats; a grade do fácil é 1 beat → 2 beats (1 s).
  const sameHand = applyHolds([note(0, 0, 4), note(3, 2), ...filler], "easy");
  assert.equal(sameHand[0].duration, 1);
  const otherHand = applyHolds([note(0, 0, 4), note(3, 6), ...filler], "easy");
  assert.equal(otherHand[0].duration, 2);
});

test("no máximo um hold por mão ao mesmo tempo", () => {
  const notes = [note(0, 0, 4), note(1, 2, 4), note(1, 5, 4), ...Array.from({ length: 9 }, (_, i) => note(10 + i, 7))];
  const holds = applyHolds(notes, "hard").filter((item) => item.duration);
  assert.deepEqual(holds.map((item) => item.key), [0, 5]);
});

test("proporção máxima de holds mantém os mais longos", () => {
  const notes = [note(0, 0, 2), note(4, 1, 3), note(8, 2, 1.5), ...Array.from({ length: 5 }, (_, i) => note(12 + i, 6))];
  // 8 notas × 0,25 = 2 holds: ficam os de 3 e 2 beats.
  const holds = applyHolds(notes, "normal").filter((item) => item.duration);
  assert.deepEqual(holds.map((item) => item.key), [0, 1]);
});

test("cauda alinhada à grade da dificuldade, sem esticar a nota", () => {
  const filler = Array.from({ length: 4 }, (_, i) => note(10 + i, 6));
  // 2,3 beats no normal (grade de 1/2 beat) → 2 beats, nunca 2,5.
  assert.equal(applyHolds([note(0, 3, 2.3), ...filler], "normal")[0].duration, 1);
  // 1,9 beat (articulação típica de MIDI) → 2 beats.
  assert.equal(applyHolds([note(0, 3, 1.9), ...filler], "normal")[0].duration, 1);
});
