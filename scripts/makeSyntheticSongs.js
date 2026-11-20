// Gera MIDIs sintéticos em test-songs/ que reproduzem os problemas conhecidos
// do gerador de charts. Determinístico: rodar de novo produz os mesmos arquivos.
//
//   node scripts/makeSyntheticSongs.js

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ToneMidi from "@tonejs/midi";

const { Midi } = ToneMidi;
const OUT_DIR = join(process.cwd(), "test-songs");
const PPQ = 480;
const C_MAJOR = [0, 2, 4, 5, 7, 9, 11];

function lcg(seed) {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 2 ** 32; };
}

function scalePitch(degree, root = 60) {
  const octave = Math.floor(degree / 7);
  return root + octave * 12 + C_MAJOR[((degree % 7) + 7) % 7];
}

// Padrões rítmicos de 1 compasso: [início em beats, duração em beats].
const RHYTHMS_4 = [
  [[0, 1], [1, 1], [2, 1], [3, 1]],
  [[0, 1], [1, 0.5], [1.5, 0.5], [2, 1], [3, 0.5], [3.5, 0.5]],
  [[0, 1.5], [1.5, 0.5], [2, 2]],
  [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 1], [3, 1]],
  [[0.5, 0.5], [1, 1], [2, 0.5], [2.5, 1.5]], // síncope
];
const RHYTHMS_3 = [
  [[0, 1], [1, 1], [2, 1]],
  [[0, 2], [2, 1]],
  [[0, 1], [1, 0.5], [1.5, 0.5], [2, 1]],
];
const RHYTHMS_LONG = [
  [[0, 4]],
  [[0, 2], [2, 2]],
  [[0, 3], [3.5, 0.5]],
  [[0, 1.5], [1.5, 2.5]],
];

function addTrack(midi, { name, program, channel }) {
  const track = midi.addTrack();
  track.name = name;
  track.channel = channel;
  track.instrument.number = program;
  return track;
}

function note(track, pitch, beat, beats, velocity = 0.8) {
  track.addNote({ midi: pitch, ticks: Math.round(beat * PPQ), durationTicks: Math.round(beats * PPQ * 0.95), velocity });
}

/** Melodia por passeio aleatório na escala. Retorna as notas criadas. */
function melody(track, { bars, beatsPerBar, rhythms, seed, root = 72, fromBar = 0, low = -3, high = 9, velocity = 0.85 }) {
  const random = lcg(seed);
  let degree = 2;
  for (let bar = fromBar; bar < fromBar + bars; bar += 1) {
    const rhythm = rhythms[Math.floor(random() * rhythms.length)];
    rhythm.forEach(([start, length], index) => {
      const step = [-2, -1, -1, 1, 1, 2, 3, -3][Math.floor(random() * 8)];
      degree = Math.max(low, Math.min(high, degree + step));
      const accent = index === 0 ? 0.1 : 0;
      note(track, scalePitch(degree, root), bar * beatsPerBar + start, length, Math.min(1, velocity + accent));
    });
  }
}

function bassLine(track, { bars, beatsPerBar, fromBar = 0, roots = [0, 5, 3, 4] }) {
  for (let bar = fromBar; bar < fromBar + bars; bar += 1) {
    const root = 36 + C_MAJOR[roots[bar % roots.length]];
    for (let beat = 0; beat < beatsPerBar; beat += 1) note(track, root, bar * beatsPerBar + beat, 0.9, 0.7);
  }
}

function drums(track, { bars, beatsPerBar }) {
  for (let bar = 0; bar < bars; bar += 1) {
    for (let eighth = 0; eighth < beatsPerBar * 2; eighth += 1) {
      const beat = bar * beatsPerBar + eighth / 2;
      note(track, 42, beat, 0.25, 0.5); // chimbal
      if (eighth % 4 === 0) note(track, 36, beat, 0.25, 0.9); // bumbo
      if (eighth % 4 === 2) note(track, 38, beat, 0.25, 0.8); // caixa
    }
  }
}

function newSong({ tempos, signature = [4, 4] }) {
  const midi = new Midi();
  midi.header.tempos = tempos.map(([beat, bpm]) => ({ ticks: beat * PPQ, bpm }));
  midi.header.timeSignatures = [{ ticks: 0, timeSignature: signature, measures: 0 }];
  midi.header.update();
  return midi;
}

const SONGS = {
  // Tempo muda no meio: simplificação em segundos fica desalinhada do ritmo.
  "synthetic-tempo-change": () => {
    const midi = newSong({ tempos: [[0, 100], [32, 150]] });
    melody(addTrack(midi, { name: "Lead", program: 80, channel: 0 }), { bars: 16, beatsPerBar: 4, rhythms: RHYTHMS_4, seed: 1 });
    bassLine(addTrack(midi, { name: "Bass", program: 33, channel: 1 }), { bars: 16, beatsPerBar: 4 });
    drums(addTrack(midi, { name: "Drums", program: 0, channel: 9 }), { bars: 16, beatsPerBar: 4 });
    return midi;
  },
  // Duas notas extremas comprimem a melodia em poucas lanes no mapeamento global.
  "synthetic-outlier-pitch": () => {
    const midi = newSong({ tempos: [[0, 120]] });
    const flute = addTrack(midi, { name: "Flute", program: 73, channel: 0 });
    melody(flute, { bars: 16, beatsPerBar: 4, rhythms: RHYTHMS_4, seed: 2, root: 64, low: 0, high: 5 });
    note(flute, 36, 4 * 4 + 3.75, 0.25);
    note(flute, 100, 10 * 4 + 3.75, 0.25);
    bassLine(addTrack(midi, { name: "Bass", program: 33, channel: 1 }), { bars: 16, beatsPerBar: 4 });
    return midi;
  },
  // Melodia troca de instrumento na metade: o modo Essência pega uma track só.
  "synthetic-melody-switch": () => {
    const midi = newSong({ tempos: [[0, 110]] });
    melody(addTrack(midi, { name: "Flute", program: 73, channel: 0 }), { bars: 8, beatsPerBar: 4, rhythms: RHYTHMS_4, seed: 3 });
    melody(addTrack(midi, { name: "Violin", program: 40, channel: 1 }), { bars: 8, fromBar: 8, beatsPerBar: 4, rhythms: RHYTHMS_4, seed: 4 });
    const pad = addTrack(midi, { name: "Strings Pad", program: 48, channel: 2 });
    for (let bar = 0; bar < 16; bar += 1) [60, 64, 67].forEach((pitch) => note(pad, pitch + C_MAJOR[[0, 5, 3, 4][bar % 4]], bar * 4, 4, 0.5));
    bassLine(addTrack(midi, { name: "Bass", program: 33, channel: 3 }), { bars: 16, beatsPerBar: 4 });
    return midi;
  },
  // Valsa 3/4 com mão direita e esquerda em tracks separadas de piano.
  "synthetic-piano-two-hands": () => {
    const midi = newSong({ tempos: [[0, 90]], signature: [3, 4] });
    melody(addTrack(midi, { name: "Piano RH", program: 0, channel: 0 }), { bars: 16, beatsPerBar: 3, rhythms: RHYTHMS_3, seed: 5 });
    const left = addTrack(midi, { name: "Piano LH", program: 0, channel: 1 });
    for (let bar = 0; bar < 16; bar += 1) {
      const root = 48 + C_MAJOR[[0, 5, 3, 4][bar % 4]];
      note(left, root - 12, bar * 3, 1, 0.75);
      [1, 2].forEach((beat) => [root, root + 4, root + 7].forEach((pitch) => note(left, pitch, bar * 3 + beat, 0.8, 0.6)));
    }
    return midi;
  },
  // Balada com notas longas na melodia e arpejo denso de piano por baixo.
  "synthetic-ballad-long-notes": () => {
    const midi = newSong({ tempos: [[0, 72]] });
    melody(addTrack(midi, { name: "Alto Sax", program: 65, channel: 0 }), { bars: 16, beatsPerBar: 4, rhythms: RHYTHMS_LONG, seed: 6, root: 67 });
    const piano = addTrack(midi, { name: "Piano", program: 0, channel: 1 });
    for (let bar = 0; bar < 16; bar += 1) {
      const root = 48 + C_MAJOR[[0, 5, 3, 4][bar % 4]];
      const arpeggio = [root, root + 7, root + 12, root + 16];
      for (let sixteenth = 0; sixteenth < 16; sixteenth += 1) note(piano, arpeggio[sixteenth % 4], bar * 4 + sixteenth / 4, 0.25, 0.45);
    }
    return midi;
  },
};

mkdirSync(OUT_DIR, { recursive: true });
Object.entries(SONGS).forEach(([name, build]) => {
  writeFileSync(join(OUT_DIR, `${name}.mid`), Buffer.from(build().toArray()));
  console.log(`test-songs/${name}.mid`);
});
