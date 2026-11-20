import test from "node:test";
import assert from "node:assert/strict";
import { fitHoldsToLanes, holdEnd, holdHeat, holdPositions, isEpicHold, isHold, resolveHold } from "./holdNotes.js";
import { normalizeNotes } from "./normalizeNotes.js";
import { adaptNotesForHands } from "./adaptNotesForHands.js";

const hold = { time: 2, key: 3, duration: 1 };

test("hold épico e calor crescente enquanto segura", () => {
  assert.equal(isEpicHold({ duration: 0.6 }), false);
  assert.equal(isEpicHold({ duration: 1.2 }), true);
  const holding = { time: 2, duration: 3, holdState: "holding" };
  assert.equal(holdHeat(holding, 2), 0);
  assert.equal(holdHeat(holding, 2.75), 0.5);
  assert.equal(holdHeat(holding, 10), 1);
  assert.equal(holdHeat({ ...holding, holdState: null }, 3), 0);
});

test("isHold e holdEnd", () => {
  assert.equal(isHold(hold), true);
  assert.equal(isHold({ time: 1, key: 0 }), false);
  assert.equal(holdEnd(hold), 3);
});

test("segurar até perto do fim completa o hold", () => {
  const result = resolveHold(hold, 2.9);
  assert.equal(result.holdState, "complete");
  assert.equal(result.judgement, "Completo");
  assert.equal(result.score, Math.round(0.9 * 300) + 200);
});

test("soltar cedo derruba o hold e não dá bônus", () => {
  const result = resolveHold(hold, 2.4);
  assert.equal(result.holdState, "dropped");
  assert.equal(result.score, Math.round(0.4 * 300));
});

test("pontos de segurar não passam do fim do hold", () => {
  assert.equal(resolveHold(hold, 10).heldSeconds, 1);
});

test("enquanto segura, a cabeça fica presa na linha e o corpo encolhe", () => {
  const layout = { hitY: 500, fallDuration: 1 };
  const falling = holdPositions(hold, 1.5, layout);
  assert.equal(falling.headY, 250);
  assert.equal(falling.tailY, -250);
  const held = holdPositions({ ...hold, holdState: "holding" }, 2.5, layout);
  assert.equal(held.headY, 500);
  assert.equal(held.tailY, 250);
});

test("hold é encurtado antes da próxima nota da mesma lane", () => {
  const [first] = fitHoldsToLanes([hold, { time: 2.6, key: 3 }]);
  assert.equal(first.duration, 0.48);
});

test("hold curto demais vira nota comum", () => {
  const [first] = fitHoldsToLanes([hold, { time: 2.3, key: 3 }]);
  assert.equal("duration" in first, false);
});

test("notas em outras lanes não encurtam o hold", () => {
  const [first] = fitHoldsToLanes([hold, { time: 2.3, key: 4 }]);
  assert.equal(first.duration, 1);
});

test("normalizeNotes preserva duration e mantém o formato antigo sem ela", () => {
  const result = normalizeNotes([{ time: 0, key: 1 }, { time: 1, key: 2, duration: 0.8 }, { time: 2, key: 3, duration: -1 }]);
  assert.deepEqual(result, [{ time: 0, key: 1 }, { time: 1, key: 2, duration: 0.8 }, { time: 2, key: 3 }]);
});

test("modo de uma mão preserva holds e resolve colisões na lane compacta", () => {
  // Lanes 6 e 7 viram a mesma lane no modo direito; o hold precisa ser encurtado.
  const adapted = adaptNotesForHands([{ time: 0, key: 6, duration: 2 }, { time: 1, key: 7 }], "right");
  const [first] = normalizeNotes(adapted);
  assert.equal(first.duration, 0.88);
});
