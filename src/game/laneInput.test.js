import test from "node:test";
import assert from "node:assert/strict";
import { createLaneInput, holdLane, isLaneHeld, keySource, laneFromX, pointerSource, releaseAll, releaseSource } from "./laneInput.js";
import { HAND_GAP, laneCenterX } from "./keys.js";

test("laneFromX segue a geometria da pista (4 + vão + 4)", () => {
  const width = 814; // (814 - 14) / 8 = 100 px por lane
  assert.equal(laneFromX(0, width), 0);
  assert.equal(laneFromX(99.9, width), 0);
  assert.equal(laneFromX(100, width), 1);
  assert.equal(laneFromX(399, width), 3);
  assert.equal(laneFromX(400 + HAND_GAP, width), 4);
  assert.equal(laneFromX(width, width), 7);
  for (let lane = 0; lane < 8; lane += 1) assert.equal(laneFromX(laneCenterX(lane, width), width), lane);
});

test("laneFromX: toque no vão vai para a lane mais próxima; fora da pista é -1", () => {
  assert.equal(laneFromX(402, 814), 3);
  assert.equal(laneFromX(412, 814), 4);
  assert.equal(laneFromX(-1, 814), -1);
  assert.equal(laneFromX(815, 814), -1);
  assert.equal(laneFromX(10, 0), -1);
  assert.equal(laneFromX(Number.NaN, 814), -1);
});

test("dois dedos na mesma lane: só solta quando o último sai", () => {
  const input = createLaneInput();
  holdLane(input, pointerSource(1), 2);
  holdLane(input, pointerSource(2), 2);
  assert.equal(releaseSource(input, pointerSource(1)), -1);
  assert.equal(isLaneHeld(input, 2), true);
  assert.equal(releaseSource(input, pointerSource(2)), 2);
  assert.equal(isLaneHeld(input, 2), false);
});

test("teclado e toque compartilham a lane (soltar a tecla não derruba o dedo)", () => {
  const input = createLaneInput();
  holdLane(input, keySource(5), 5);
  holdLane(input, pointerSource(7), 5);
  assert.equal(releaseSource(input, keySource(5)), -1);
  assert.equal(releaseSource(input, pointerSource(7)), 5);
});

test("acorde com dois dedos em lanes diferentes", () => {
  const input = createLaneInput();
  holdLane(input, pointerSource(1), 0);
  holdLane(input, pointerSource(2), 7);
  assert.equal(isLaneHeld(input, 0), true);
  assert.equal(isLaneHeld(input, 7), true);
  assert.equal(releaseSource(input, pointerSource(2)), 7);
  assert.equal(isLaneHeld(input, 0), true);
});

test("holdLane devolve a lane antiga quando a fonte troca de lane", () => {
  const input = createLaneInput();
  assert.equal(holdLane(input, pointerSource(1), 1), -1);
  assert.equal(holdLane(input, pointerSource(1), 1), -1);
  assert.equal(holdLane(input, pointerSource(1), 2), 1);
});

test("soltar fonte desconhecida não faz nada; releaseAll limpa tudo", () => {
  const input = createLaneInput();
  assert.equal(releaseSource(input, pointerSource(9)), -1);
  holdLane(input, pointerSource(1), 3);
  holdLane(input, pointerSource(2), 3);
  holdLane(input, keySource(6), 6);
  assert.deepEqual(releaseAll(input).sort(), [3, 6]);
  assert.equal(input.size, 0);
});
