import test from "node:test";
import assert from "node:assert/strict";
import { mapGmDrums } from "./gmDrums.js";

test("mapeia notas GM para amostras presentes no kit e distingue pratos e chimbais", () => {
  const drums = mapGmDrums(["kick-1", "kick-2", "Snare", "closed-hat", "open-hi-hat",
    "tom/low", "tom/mid", "cymbal", "ride-cymbal", "cowbell"]);
  assert.equal(drums.get(35), "kick-1");
  assert.equal(drums.get(36), "kick-1");
  assert.equal(drums.get(38), "Snare");
  assert.equal(drums.get(42), "closed-hat");
  assert.equal(drums.get(46), "open-hi-hat");
  assert.equal(drums.get(45), "tom/low");
  assert.equal(drums.get(47), "tom/mid");
  assert.equal(drums.get(49), "cymbal");
  assert.equal(drums.get(51), "ride-cymbal");
  assert.equal(drums.get(56), "cowbell");
  for (const pitch of [34, 39, 61, 81, 82, 84]) assert.equal(drums.has(pitch), false);
});

test("mapeia os grupos reais da TR-808 do smplr (nomes de grupo, não de variação)", () => {
  const groups = ["clap", "clave", "conga-hi", "conga-low", "conga-mid", "cowbell", "cymbal", "hihat-close",
    "hihat-open", "kick", "maraca", "mid-tom", "rimshot", "snare", "tom-hi", "tom-low"];
  const drums = mapGmDrums(groups);
  const expected = { 36: "kick", 38: "snare", 42: "hihat-close", 44: "hihat-close", 46: "hihat-open",
    41: "tom-low", 47: "mid-tom", 50: "tom-hi", 49: "cymbal", 39: "clap", 56: "cowbell", 62: "conga-hi" };
  for (const [note, sample] of Object.entries(expected)) assert.equal(drums.get(Number(note)), sample, `nota ${note}`);
});
