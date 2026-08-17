import { importMidi } from "./midi/importMidi.js";
import { importMusicXml } from "./musicxml/importMusicXml.js";

export async function importSong(file) {
  if (!file) throw new Error("Escolha um arquivo MIDI ou MusicXML.");
  const name = file.name.toLowerCase();
  if (name.endsWith(".mid") || name.endsWith(".midi")) return importMidi(file);
  if (name.endsWith(".musicxml")) return importMusicXml(file);
  if (name.endsWith(".xml")) {
    const sample = (await file.slice(0, 4096).text()).toLowerCase();
    if (sample.includes("score-partwise") || sample.includes("score-timewise")) return importMusicXml(file);
  }
  throw new Error("Formato não suportado. Use .mid, .midi, .musicxml ou um .xml MusicXML.");
}
