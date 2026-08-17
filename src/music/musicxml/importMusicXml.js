import { DEFAULT_TEMPO, makeOctoBeatSong, validateOctoBeatSong } from "../models/OctoBeatSong.js";

const STEP_TO_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function children(node, tag) { return [...node.children].filter((child) => child.localName === tag); }
function child(node, tag) { return children(node, tag)[0]; }
function text(node, tag) { return child(node, tag)?.textContent?.trim(); }
function number(node, tag, fallback = 0) { const value = Number(text(node, tag)); return Number.isFinite(value) ? value : fallback; }

function parsePitch(note) {
  const pitch = child(note, "pitch");
  if (!pitch) return null;
  const step = text(pitch, "step");
  const octave = number(pitch, "octave", NaN);
  if (!(step in STEP_TO_SEMITONE) || !Number.isFinite(octave)) return null;
  return (octave + 1) * 12 + STEP_TO_SEMITONE[step] + number(pitch, "alter");
}

export async function importMusicXml(file) {
  const xml = await file.text();
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror") || !document.querySelector("score-partwise, score-timewise")) {
    throw new Error("O arquivo XML não é um MusicXML válido.");
  }

  const title = document.querySelector("work-title, movement-title")?.textContent?.trim() || file.name.replace(/\.(musicxml|xml)$/i, "");
  const creator = [...document.querySelectorAll("creator")].find((item) => item.getAttribute("type") === "composer")?.textContent?.trim();
  const partsById = new Map([...document.querySelectorAll("part-list > score-part")].map((part) => [part.getAttribute("id"), {
    name: text(part, "part-name"), instrument: text(part, "instrument-name"),
  }]));
  const tempoChanges = [];
  const timeSignatures = [];
  let maxDuration = 0;
  const tracks = [...document.querySelectorAll("part")].map((part, index) => {
    let divisions = 1;
    let cursorBeats = 0;
    let lastStart = 0;
    let bpm = DEFAULT_TEMPO;
    let seconds = 0;
    let beatAtTempo = 0;
    const toSeconds = (beats) => seconds + ((beats - beatAtTempo) * 60) / bpm;
    const notes = [];

    children(part, "measure").forEach((measure) => {
      const attributes = child(measure, "attributes");
      if (attributes) {
        divisions = number(attributes, "divisions", divisions) || divisions;
        const signature = child(attributes, "time");
        if (signature) timeSignatures.push({ time: toSeconds(cursorBeats), beats: number(signature, "beats", 4), beatType: number(signature, "beat-type", 4) });
      }
      children(measure, "direction").forEach((direction) => {
        const nextBpm = Number(direction.querySelector("per-minute")?.textContent) || Number(child(direction, "sound")?.getAttribute("tempo"));
        if (Number.isFinite(nextBpm) && nextBpm > 0) {
          const at = toSeconds(cursorBeats);
          tempoChanges.push({ time: at, bpm: nextBpm });
          seconds = at; beatAtTempo = cursorBeats; bpm = nextBpm;
        }
      });
      children(measure, "note").forEach((note) => {
        const durationBeats = number(note, "duration") / divisions;
        const isChord = Boolean(child(note, "chord"));
        const startBeats = isChord ? lastStart : cursorBeats;
        const pitch = parsePitch(note);
        if (pitch != null && !child(note, "rest")) notes.push({ pitch, start: toSeconds(startBeats), duration: (durationBeats * 60) / bpm, velocity: 0.8, voice: text(note, "voice") });
        if (!isChord) { lastStart = startBeats; cursorBeats += durationBeats; }
      });
    });
    maxDuration = Math.max(maxDuration, toSeconds(cursorBeats));
    const descriptor = partsById.get(part.getAttribute("id")) ?? {};
    return { id: `musicxml-${index + 1}`, name: descriptor.name || `Part ${index + 1}`, instrument: descriptor.instrument || "unknown", notes };
  });

  return validateOctoBeatSong(makeOctoBeatSong({
    title, artist: creator, duration: maxDuration,
    tempoChanges: tempoChanges.length ? tempoChanges : [{ time: 0, bpm: DEFAULT_TEMPO }],
    timeSignatures, tracks, source: { format: "MusicXML", fileName: file.name },
  }));
}
