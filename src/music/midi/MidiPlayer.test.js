import test from "node:test";
import assert from "node:assert/strict";
import { MidiPlayer } from "./MidiPlayer.js";

function fakePlayer(duration = 10) {
  const player = new MidiPlayer({ duration, tracks: [] });
  const calls = { schedulerStop: 0, voiceStop: 0 };
  player.context = { currentTime: 0 };
  player.scheduler = { stop: () => { calls.schedulerStop += 1; } };
  player.players.set("t1", { player: { stop: () => { calls.voiceStop += 1; } } });
  return { player, calls };
}

test("currentTime passa da duração do MIDI (senão a partida nunca termina)", () => {
  const { player } = fakePlayer(10);
  player.playing = true;
  player.startedAt = 2;
  player.context.currentTime = 14;
  assert.equal(player.currentTime(), 12);
});

test("halt guarda a posição, limpa a fila do Scheduler e cancela as vozes sem descartar nada", () => {
  const { player, calls } = fakePlayer(10);
  player.playing = true;
  player.startedAt = 1;
  player.context.currentTime = 5;
  player.halt();
  assert.equal(player.playing, false);
  assert.equal(player.position, 4);
  assert.equal(player.currentTime(), 4);
  assert.equal(calls.schedulerStop, 1);
  assert.equal(calls.voiceStop, 1);
  assert.equal(player.disposed, false);
  assert.equal(player.players.size, 1, "instrumentos continuam carregados");
});

test("stop volta ao início", () => {
  const { player } = fakePlayer(10);
  player.playing = true;
  player.context.currentTime = 3;
  player.stop();
  assert.equal(player.position, 0);
});
