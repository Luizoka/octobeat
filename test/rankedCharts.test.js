import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { holdEnd, isHold, resolveHold } from "../src/game/holdNotes.js";
import { judgeNote } from "../src/game/judgeNote.js";
import { normalizeNotes } from "../src/game/normalizeNotes.js";
import { applyHit, applyHoldResults, createStats, maxScore } from "../src/game/scoring.js";
import { SONG_CATALOG } from "../src/songs/catalog.js";

test("maxScore processa cabeças e holds na ordem em que são julgados", () => {
  const notes = Array.from({ length: 25 }, (_, time) => ({ time, key: 0 }));
  notes[0].duration = 24;
  notes[1].duration = 24;
  const pointsBeforeTier = 24 * 1000 + 12 * (24 * 25 / 2);
  const holdPoints = 24 * 300 + 200;
  assert.equal(maxScore([]), 0);
  assert.equal(maxScore(notes.slice().reverse()), pointsBeforeTier + holdPoints + (1000 + 25 * 12) * 2 + holdPoints * 2);
});

test("charts congelados passam pela simulação de acertos e holds do jogo", async () => {
  const dir = new URL("../public/ranked/", import.meta.url);
  const readJson = async (file) => JSON.parse(await readFile(new URL(file, dir), "utf8"));
  const index = await readJson("index.json");
  assert.deepEqual(index.map(({ slug, difficulty }) => [slug, difficulty]),
    SONG_CATALOG.flatMap(({ id }) => ["easy", "normal", "hard"].map((difficulty) => [id, difficulty])));

  for (const { title, ...metadata } of index) {
    const { notes, ...chart } = await readJson(`${metadata.slug}/${metadata.difficulty}.json`);
    assert.deepEqual(chart, metadata);
    assert.equal(title, SONG_CATALOG.find(({ id }) => id === chart.slug).title);
    assert.equal(chart.chartVersion, createHash("sha256").update(JSON.stringify(notes)).digest("hex").slice(0, 12));
    assert.equal(chart.noteCount, notes.length);
    assert.deepEqual(normalizeNotes(notes), notes);

    let stats = createStats();
    const active = new Set();
    const times = new Set(notes.flatMap((note) => isHold(note) ? [note.time, holdEnd(note)] : [note.time]));
    let next = 0;
    for (const time of [...times].sort((a, b) => a - b)) {
      const completed = [];
      for (const hold of active) {
        if (holdEnd(hold) <= time) {
          completed.push(resolveHold(hold, time));
          active.delete(hold);
        }
      }
      stats = applyHoldResults(stats, completed);
      while (notes[next]?.time === time) {
        const note = notes[next++];
        stats = applyHit(stats, judgeNote(time - note.time));
        if (isHold(note)) active.add(note);
      }
    }
    assert.equal(stats.score, chart.maxScore, `${chart.slug}/${chart.difficulty}`);
    assert.equal(stats.maxCombo, chart.noteCount);
    assert.equal(stats.holdsComplete, notes.filter(isHold).length);
  }
});
