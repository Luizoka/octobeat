import test from "node:test";
import assert from "node:assert/strict";
import ToneMidi from "@tonejs/midi";
import { importMidi } from "./importMidi.js";

const { Midi } = ToneMidi;

test("importMidi preserva o instante das mudanças de tempo e de compasso", async () => {
  const midi = new Midi();
  const ppq = midi.header.ppq;
  midi.header.tempos = [{ ticks: 0, bpm: 120 }, { ticks: 8 * ppq, bpm: 60 }];
  midi.header.timeSignatures = [{ ticks: 0, timeSignature: [4, 4], measures: 0 }, { ticks: 8 * ppq, timeSignature: [3, 4], measures: 2 }];
  midi.header.update();
  midi.addTrack().addNote({ midi: 60, ticks: 0, durationTicks: ppq });
  const bytes = midi.toArray();
  const song = await importMidi({ name: "teste.mid", arrayBuffer: async () => bytes.buffer });

  assert.deepEqual(song.tempoChanges.map((change) => [change.time, Math.round(change.bpm)]), [[0, 120], [4, 60]]);
  assert.deepEqual(song.timeSignatures.map((signature) => [signature.time, signature.beats, signature.beatType]), [[0, 4, 4], [4, 3, 4]]);
});
