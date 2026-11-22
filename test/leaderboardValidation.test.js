import assert from "node:assert/strict";
import test from "node:test";
import { createStats } from "../src/game/scoring.js";
import { buildSubmitPayload } from "../src/leaderboard/validation.js";

test("monta o payload RPC com precisão ponderada, contadores e nota final", () => {
  const stats = {
    ...createStats(), score: 1800, total: 3, maxCombo: 2, holdsComplete: 1,
    counts: { perfect: 1, good: 1, offset: 0, miss: 1 },
  };
  assert.deepEqual(buildSubmitPayload("42", stats, "mobile"), {
    p_chart_id: "42", p_score: 1800, p_accuracy: 56.67, p_max_combo: 2,
    p_perfect: 1, p_good: 1, p_offset: 0, p_miss: 1, p_holds_complete: 1, p_rank: "C", p_platform: "mobile",
  });
  assert.equal(buildSubmitPayload("42", createStats()).p_accuracy, 0);
});

test("detecta plataforma pelo tipo de ponteiro e formata o rótulo", async () => {
  const { detectPlatform, platformLabel } = await import("../src/leaderboard/validation.js");
  assert.equal(detectPlatform(() => ({ matches: true })), "mobile");
  assert.equal(detectPlatform(() => ({ matches: false })), "pc");
  assert.equal(detectPlatform(undefined), "pc");
  assert.equal(detectPlatform(() => { throw new Error("sem matchMedia"); }), "pc");
  assert.match(platformLabel("mobile"), /Mobile/);
  assert.match(platformLabel("pc"), /PC/);
  assert.equal(platformLabel(null), "—");
});
