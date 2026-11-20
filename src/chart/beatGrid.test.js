import test from "node:test";
import assert from "node:assert/strict";
import {
  BEAT_STRENGTH, beatStrength, buildMeasureMap, buildTempoMap, getMeasurePosition, isOnGrid, measureStarts, quantizeBeat,
} from "./beatGrid.js";

test("quantizeBeat arredonda para a subdivisão pedida", () => {
  assert.equal(quantizeBeat(1.3, 1), 1);
  assert.equal(quantizeBeat(1.3, 2), 1.5);
  assert.equal(quantizeBeat(1.3, 4), 1.25);
});

test("isOnGrid tolera pequena humanização", () => {
  assert.equal(isOnGrid(2.03, 1), true);
  assert.equal(isOnGrid(2.5, 1), false);
  assert.equal(isOnGrid(2.5, 2), true);
  assert.equal(isOnGrid(2.25, 2), false);
  assert.equal(isOnGrid(2.25, 4), true);
});

test("sem fórmula de compasso assume 4/4", () => {
  const map = buildMeasureMap([]);
  assert.equal(map.length, 1);
  assert.equal(map[0].measureLength, 4);
  assert.deepEqual(getMeasurePosition(9, map).measure, 2);
  assert.equal(getMeasurePosition(9, map).beatInMeasure, 1);
});

test("mudança de compasso continua a contagem de compassos", () => {
  // 120 BPM: 2 compassos de 4/4 = 8 beats = 4 s; depois 3/4.
  const tempoMap = buildTempoMap([{ time: 0, bpm: 120 }]);
  const map = buildMeasureMap([{ time: 0, beats: 4, beatType: 4 }, { time: 4, beats: 3, beatType: 4 }], tempoMap);
  assert.equal(map.length, 2);
  assert.equal(map[1].measureIndex, 2);
  assert.equal(getMeasurePosition(11, map).measure, 3);
  assert.deepEqual(measureStarts(map, 0, 14), [0, 4, 8, 11, 14]);
});

test("fórmulas repetidas (MusicXML por parte) não duplicam segmentos", () => {
  const map = buildMeasureMap([{ time: 0, beats: 3, beatType: 4 }, { time: 0, beats: 3, beatType: 4 }, { time: 3, beats: 3, beatType: 4 }]);
  assert.equal(map.length, 1);
  assert.equal(map[0].measureLength, 3);
});

test("beatStrength em 4/4: tempo 1 > tempo 3 > tempos 2/4 > colcheia > semicolcheia", () => {
  const map = buildMeasureMap([]);
  assert.equal(beatStrength(0, map), BEAT_STRENGTH.downbeat);
  assert.equal(beatStrength(4, map), BEAT_STRENGTH.downbeat);
  assert.equal(beatStrength(2, map), BEAT_STRENGTH.strong);
  assert.equal(beatStrength(1, map), BEAT_STRENGTH.beat);
  assert.equal(beatStrength(3.5, map), BEAT_STRENGTH.eighth);
  assert.equal(beatStrength(1.25, map), BEAT_STRENGTH.sixteenth);
  assert.equal(beatStrength(1 + 1 / 3, map), BEAT_STRENGTH.triplet);
  assert.equal(beatStrength(1.1, map), BEAT_STRENGTH.offGrid);
  assert.equal(beatStrength(3.98, map), BEAT_STRENGTH.downbeat, "nota levemente adiantada ainda conta como tempo 1");
});

test("beatStrength em 3/4 não tem tempo forte secundário", () => {
  const map = buildMeasureMap([{ time: 0, beats: 3, beatType: 4 }]);
  assert.equal(beatStrength(3, map), BEAT_STRENGTH.downbeat);
  assert.equal(beatStrength(1, map), BEAT_STRENGTH.beat);
  assert.equal(beatStrength(2, map), BEAT_STRENGTH.beat);
});

test("beatStrength em 6/8 usa semínima pontuada como pulso", () => {
  const map = buildMeasureMap([{ time: 0, beats: 6, beatType: 8 }]);
  assert.equal(map[0].measureLength, 3);
  assert.equal(beatStrength(1.5, map), BEAT_STRENGTH.beat);
  assert.equal(beatStrength(0.5, map), BEAT_STRENGTH.eighth);
});
