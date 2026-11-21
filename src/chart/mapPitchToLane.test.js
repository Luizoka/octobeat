import test from "node:test";
import assert from "node:assert/strict";
import { getPitchRange, mapPitchToLane } from "./mapPitchToLane.js";

const notes = (pitches) => pitches.map((pitch) => ({ pitch }));

test("faixa ignora poucas notas extremas (percentis)", () => {
  const melody = Array.from({ length: 40 }, (_, index) => 60 + (index % 13));
  const range = getPitchRange(notes([25, ...melody]));
  assert.equal(range.min, 60);
  assert.equal(range.max, 72);
});

test("faixa de lista vazia e de poucas notas", () => {
  assert.deepEqual(getPitchRange([]), { min: 60, max: 60 });
  assert.deepEqual(getPitchRange(notes([50, 70]), { lowPercentile: 0, highPercentile: 1 }), { min: 50, max: 70 });
});

test("notas fora da faixa caem nas pontas", () => {
  const range = { min: 60, max: 72 };
  assert.equal(mapPitchToLane(20, range), 0);
  assert.equal(mapPitchToLane(100, range), 7);
});
