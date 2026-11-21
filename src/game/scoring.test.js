import test from "node:test";
import assert from "node:assert/strict";
import { judgeNote } from "./judgeNote.js";
import {
  applyHit, applyHoldResults, applyMiss, comboMultiplier, createStats, crossedMilestone, finalRank, isFever, weightedAccuracy,
} from "./scoring.js";
import { effectiveEffects, loadSettings, sanitizeSettings, saveSettings } from "../settings/settings.js";

const perfect = judgeNote(0);
const repeat = (stats, times, fn) => Array.from({ length: times }).reduce(fn, stats);

test("judgeNote informa o tipo de julgamento", () => {
  assert.equal(judgeNote(0.01).kind, "perfect");
  assert.equal(judgeNote(0.1).kind, "good");
  assert.equal(judgeNote(0.15).kind, "late");
  assert.equal(judgeNote(-0.15).kind, "early");
  assert.equal(judgeNote(0.3), null);
});

test("multiplicador sobe com o combo e Fever começa em 50", () => {
  assert.equal(comboMultiplier(0), 1);
  assert.equal(comboMultiplier(25), 2);
  assert.equal(comboMultiplier(50), 3);
  assert.equal(comboMultiplier(100), 4);
  assert.equal(isFever(49), false);
  assert.equal(isFever(50), true);
});

test("acerto soma pontos com bônus de combo e multiplicador", () => {
  const first = applyHit(createStats(), perfect);
  assert.equal(first.score, 1000 + 12);
  assert.equal(first.combo, 1);
  assert.equal(first.counts.perfect, 1);
  const at25 = applyHit({ ...createStats(), combo: 24 }, perfect);
  assert.equal(at25.score, (1000 + 25 * 12) * 2);
});

test("erro quebra o combo e preserva o combo máximo", () => {
  const stats = applyMiss(repeat(createStats(), 30, (s) => applyHit(s, perfect)), 2);
  assert.equal(stats.combo, 0);
  assert.equal(stats.maxCombo, 30);
  assert.equal(stats.counts.miss, 2);
  assert.equal(stats.total, 32);
});

test("hold derrubado quebra o combo; completo mantém e multiplica", () => {
  const base = { ...createStats(), combo: 30 };
  const complete = applyHoldResults(base, [{ holdState: "complete", score: 500 }]);
  assert.equal(complete.combo, 30);
  assert.equal(complete.score, 1000);
  assert.equal(complete.holdsComplete, 1);
  const dropped = applyHoldResults(base, [{ holdState: "dropped", score: 100 }]);
  assert.equal(dropped.combo, 0);
  assert.equal(dropped.holdsDropped, 1);
});

test("marcos de combo", () => {
  assert.equal(crossedMilestone(24, 25), 25);
  assert.equal(crossedMilestone(25, 26), null);
  assert.equal(crossedMilestone(99, 100), 100);
});

test("nota final pela precisão ponderada", () => {
  const allPerfect = repeat(createStats(), 20, (s) => applyHit(s, perfect));
  assert.equal(weightedAccuracy(allPerfect), 1);
  assert.equal(finalRank(allPerfect), "S");
  assert.equal(finalRank(applyMiss(allPerfect, 1)), "A", "um erro tira o S");
  assert.equal(finalRank(applyMiss(allPerfect, 20)), "D");
});

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return { getItem: (key) => data[key] ?? null, setItem: (key, value) => { data[key] = String(value); }, data };
}

test("configurações migram as chaves antigas", () => {
  const storage = memoryStorage({ "octobeat.leadInSeconds": "3", "octobeat.handMode": "left", "octobeat.masterVolume": "0.4" });
  const settings = loadSettings(storage);
  assert.equal(settings.leadInSeconds, 3);
  assert.equal(settings.handMode, "left");
  assert.equal(settings.masterVolume, 0.4);
  assert.equal(settings.particles, "medium");
});

test("configurações salvas são recarregadas e valores inválidos corrigidos", () => {
  const storage = memoryStorage();
  saveSettings(storage, { ...sanitizeSettings(), particles: "high", shakeIntensity: 99 });
  const settings = loadSettings(storage);
  assert.equal(settings.particles, "high");
  assert.equal(settings.shakeIntensity, 2);
  assert.equal(sanitizeSettings({ handMode: "foo" }).handMode, "both");
});

test("reduzir movimento desliga tremor e reduz partículas", () => {
  const effects = effectiveEffects(sanitizeSettings({ reducedMotion: true, shake: true }));
  assert.equal(effects.shake, 0);
  assert.ok(effects.particleScale < 1);
  assert.equal(loadSettings(memoryStorage(), { prefersReducedMotion: true }).reducedMotion, true);
});

test("no celular as partículas saem em menor quantidade; o resto dos efeitos não muda", () => {
  const settings = sanitizeSettings({});
  const desktop = effectiveEffects(settings);
  const touch = effectiveEffects(settings, { touch: true });
  assert.ok(touch.particleScale < desktop.particleScale);
  assert.ok(touch.particleScale > 0);
  assert.equal(touch.shake, desktop.shake);
  assert.equal(touch.laneBeams, desktop.laneBeams);
});
