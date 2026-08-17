import test from "node:test";
import assert from "node:assert/strict";
import { adaptNotesForHands } from "./adaptNotesForHands.js";

const notes = Array.from({ length: 8 }, (_, key) => ({ time: key, key }));

test("modo esquerdo distribui o chart inteiro entre ASDF", () => {
  const result = adaptNotesForHands(notes, "left");
  assert.ok(result.every((note) => note.key >= 0 && note.key <= 3));
  assert.deepEqual([...new Set(result.map((note) => note.key))], [0, 1, 2, 3]);
});

test("modo direito distribui o chart inteiro entre JKLÇ", () => {
  const result = adaptNotesForHands(notes, "right");
  assert.ok(result.every((note) => note.key >= 4 && note.key <= 7));
  assert.deepEqual([...new Set(result.map((note) => note.key))], [4, 5, 6, 7]);
});

test("notas simultâneas que caem na mesma tecla são deduplicadas", () => {
  const result = adaptNotesForHands([{ time: 1, key: 0 }, { time: 1, key: 1 }], "left");
  assert.equal(result.length, 1);
});
