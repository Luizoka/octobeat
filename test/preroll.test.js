import assert from "node:assert/strict";
import test from "node:test";
import { START_MARGIN_SECONDS, startPosition } from "../src/game/preroll.js";

const FALL = 1.55;

test("primeira nota cedo: começa antes do zero para a nota cair do topo com folga", () => {
  const notes = [{ time: 0.4 }, { time: 1 }];
  const position = startPosition(notes, FALL);
  assert.ok(position < 0);
  // Tempo que a 1ª nota tem do início até a linha = queda completa + folga.
  assert.ok(Math.abs((0.4 - position) - (FALL + START_MARGIN_SECONDS)) < 1e-9);
});

test("nota no tempo 0 ou negativa também ganha a queda inteira", () => {
  assert.ok(Math.abs(startPosition([{ time: 0 }], FALL) + FALL + START_MARGIN_SECONDS) < 1e-9);
});

test("sem pressa: se a primeira nota já está longe, começa no 0", () => {
  assert.equal(startPosition([{ time: 5 }, { time: 3 }], FALL), 0);
  assert.equal(startPosition([{ time: FALL + START_MARGIN_SECONDS }], FALL), 0);
});

test("usa a nota mais cedo mesmo fora de ordem; sem notas = 0", () => {
  assert.ok(startPosition([{ time: 4 }, { time: 0.2 }], FALL) < 0);
  assert.equal(startPosition([], FALL), 0);
  assert.equal(startPosition(null, FALL), 0);
});
