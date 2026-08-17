import { Midi } from "@tonejs/midi";
import { makeOctoBeatSong, validateOctoBeatSong } from "../models/OctoBeatSong.js";

export async function importMidi(file) {
  let midi;
  try {
    midi = new Midi(await file.arrayBuffer());
  } catch {
    throw new Error("Não foi possível ler este MIDI. Verifique se o arquivo não está corrompido.");
  }

  const song = makeOctoBeatSong({
    title: midi.name || file.name.replace(/\.(mid|midi)$/i, ""),
    duration: midi.duration,
    tempoChanges: midi.header.tempos.map((tempo) => ({ time: tempo.seconds, bpm: tempo.bpm })),
    timeSignatures: midi.header.timeSignatures.map((signature) => ({
      time: signature.seconds,
      beats: signature.timeSignature[0],
      beatType: signature.timeSignature[1],
    })),
    source: { format: "MIDI", fileName: file.name },
    tracks: midi.tracks.map((track, index) => ({
      id: `midi-${index + 1}`,
      name: track.name || `Track ${index + 1}`,
      instrument: track.instrument?.name || `program-${track.instrument?.number ?? 0}`,
      notes: track.notes.map((note) => ({
        pitch: note.midi,
        start: note.time,
        duration: note.duration,
        velocity: note.velocity,
      })),
    })),
  });

  return validateOctoBeatSong(song);
}
