import assert from "node:assert/strict";
import test from "node:test";
import { createStats } from "../src/game/scoring.js";
import { buildSubmitPayload, validateCredentials } from "../src/leaderboard/validation.js";

test("valida usuário só com letras, números e espaços e senha de 6 a 255 caracteres, preservando a senha", () => {
  assert.deepEqual(validateCredentials(" \u00a0Jogador1\t", " senha "), {
    p_username: "Jogador1",
    p_password: " senha ",
  });
  assert.doesNotThrow(() => validateCredentials("A".repeat(255), "🎵".repeat(255)));
  assert.doesNotThrow(() => validateCredentials("a", "123456"));
  for (const username of ["", "a".repeat(256), "João", "a/b", "a_b", "a.b", "a-b"]) {
    assert.throws(() => validateCredentials(username, "123456"), /usuário/);
  }
  assert.equal(validateCredentials("  luiz   teste ", "123456").p_username, "luiz teste");
  for (const password of ["12345", "🎵".repeat(256), "123456\0", "123456\ud800"]) {
    assert.throws(() => validateCredentials("Jogador", password), /senha/);
  }
});

test("monta o payload RPC com precisão ponderada, contadores e nota final", () => {
  const stats = {
    ...createStats(), score: 1800, total: 3, maxCombo: 2, holdsComplete: 1,
    counts: { perfect: 1, good: 1, offset: 0, miss: 1 },
  };
  assert.deepEqual(buildSubmitPayload("sessão", "42", stats, "mobile"), {
    p_token: "sessão", p_chart_id: "42", p_score: 1800, p_accuracy: 56.67, p_max_combo: 2,
    p_perfect: 1, p_good: 1, p_offset: 0, p_miss: 1, p_holds_complete: 1, p_rank: "C", p_platform: "mobile",
  });
  assert.equal(buildSubmitPayload("sessão", "42", createStats()).p_accuracy, 0);
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
