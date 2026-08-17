import ToneMidi from "@tonejs/midi";
import { makeOctoBeatSong, validateOctoBeatSong } from "../models/OctoBeatSong.js";
import { classifyMidiTrack } from "./classifyTrack.js";

const { Midi } = ToneMidi;

export async function importMidi(file) {
  let midi;
  try {
    midi = new Midi(await file.arrayBuffer());
  } catch {
    throw new Error("Não foi possível ler este MIDI. Verifique se o arquivo não está corrompido.");
  }

  const song = makeOctoBeatSong({
    // MIDI não possui um campo de título interoperável; em muitos arquivos midi.name
    // acaba sendo o nome da primeira track. O nome do arquivo é mais previsível.
    title: file.name.replace(/\.(mid|midi)$/i, ""),
    artist: "Créditos não informados no MIDI",
    duration: midi.duration,
    tempoChanges: midi.header.tempos.map((tempo) => ({ time: tempo.seconds, bpm: tempo.bpm })),
    timeSignatures: midi.header.timeSignatures.map((signature) => ({
      time: signature.seconds,
      beats: signature.timeSignature[0],
      beatType: signature.timeSignature[1],
    })),
    source: { format: "MIDI", fileName: file.name },
    tracks: midi.tracks.map((track, index) => {
      const playback = { program: track.instrument?.number ?? 0, channel: track.channel, isPercussion: track.channel === 9, soundfontName: track.instrument?.name };
      return {
      id: `midi-${index + 1}`,
      name: track.name || `Track ${index + 1}`,
      instrument: track.instrument?.name || `program-${track.instrument?.number ?? 0}`,
      family: classifyMidiTrack({ ...playback, name: track.name, instrument: track.instrument?.name }),
      playback,
      notes: track.notes.map((note) => ({
        pitch: note.midi,
        start: note.time,
        duration: note.duration,
        velocity: note.velocity,
      })),
    }; }),
  });

  return validateOctoBeatSong(song);
}
