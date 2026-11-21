import test from "node:test";
import assert from "node:assert/strict";
import { breakJacks, neighborLane } from "./breakJacks.js";

test("vizinha fica na mesma mão", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(neighborLane), [1, 2, 3, 2, 5, 6, 7, 6]);
});

test("nota repetida rápida vira alternância entre duas colunas", () => {
  const notes = [0, 0.1, 0.2, 0.3].map((time) => ({ time, key: 2 }));
  assert.deepEqual(breakJacks(notes).map((note) => note.key), [2, 3, 2, 3]);
});

test("repetição lenta continua na mesma coluna", () => {
  const notes = [0, 0.5, 1].map((time) => ({ time, key: 6 }));
  assert.deepEqual(breakJacks(notes).map((note) => note.key), [6, 6, 6]);
});

test("acordes e campos extras não são mexidos; entrada não é alterada", () => {
  const notes = [{ time: 0, key: 1 }, { time: 0, key: 5 }, { time: 0.1, key: 1, duration: 0.5 }];
  const result = breakJacks(notes);
  assert.deepEqual(result, notes);
  assert.notEqual(result[0], notes[0]);
});

test("é determinístico", () => {
  const notes = Array.from({ length: 12 }, (_, index) => ({ time: index * 0.12, key: index < 6 ? 4 : 7 }));
  assert.deepEqual(breakJacks(notes), breakJacks(notes));
});
