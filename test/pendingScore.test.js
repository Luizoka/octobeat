import assert from "node:assert/strict";
import test from "node:test";
import { readPendingScore, savePendingScore, takePendingScore } from "../src/leaderboard/pendingScore.js";

test("guarda a pontuação durante o redirecionamento e retira uma única vez", (context) => {
  const values = new Map();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  });
  context.after(() => {
    if (previous) Object.defineProperty(globalThis, "sessionStorage", previous);
    else delete globalThis.sessionStorage;
  });

  const score = { payload: { p_chart_id: "42", p_score: 1800 }, title: "Flower Man", difficulty: "easy" };
  assert.equal(readPendingScore(), null);
  savePendingScore(score);
  assert.deepEqual(readPendingScore(), score);
  assert.deepEqual(takePendingScore(), score);
  assert.equal(takePendingScore(), null);
});
