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

test("bateria toca amostras inteiras na janela de 3 s e não repete batidas anteriores à retomada", async (t) => {
  const notes = [
    { pitch: 36, start: 0, duration: 2 },
    { pitch: 81, start: 1, duration: 0.1 },
    { pitch: 42, start: 2, duration: 0.1, velocity: 0.5 },
    { pitch: 36, start: 4, duration: 0.1 },
  ];
  const player = new MidiPlayer({ tracks: [{ id: "bateria", notes }] });
  t.after(() => player.stop());
  const starts = [];
  player.context = { currentTime: 10, resume: async () => {} };
  player.activeIds.add("bateria");
  player.players.set("bateria", {
    player: { start: (note) => starts.push(note), stop: () => {} },
    drums: new Map([[36, "kick"], [42, "closed-hat"]]),
  });

  await player.play(1);
  assert.deepEqual(starts, [{ note: "closed-hat", velocity: 64, time: 11, duration: undefined }]);
  player.context.currentTime += 0.25;
  player.feed();
  assert.deepEqual(starts.map(({ note, time }) => [note, time]), [["closed-hat", 11], ["kick", 13]]);
});

test("soundfontName casa nomes do MIDI com os do smplr, mesmo sem '_'", async () => {
  const { soundfontName } = await import("./MidiPlayer.js");
  assert.equal(soundfontName({ playback: { soundfontName: "synthstrings_1" } }), "synth_strings_1");
  assert.equal(soundfontName({ instrument: "Acoustic Grand Piano" }), "acoustic_grand_piano");
  assert.equal(soundfontName({ instrument: "instrumento inventado" }), soundfontName({}));
});
