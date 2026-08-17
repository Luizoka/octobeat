const PIANO_PROGRAMS = new Set([...Array(8).keys()]);
const ELECTRIC_PIANO_PROGRAMS = new Set([4, 5]);

export function classifyMidiTrack({ program = 0, channel, name = "", instrument = "" } = {}) {
  const label = `${name} ${instrument}`.toLowerCase();
  if (channel === 9 || /drum|percussion|kit/.test(label)) return "percussion";
  if (/electric piano|e\. ?piano/.test(label)) return "electric-piano";
  if (/\bbass\b/.test(label)) return "bass";
  if (/piano/.test(label)) return "piano";
  if (program >= 32 && program <= 39) return "bass";
  if (program >= 24 && program <= 31 || /guitar/.test(label)) return "guitar";
  if (PIANO_PROGRAMS.has(program)) return ELECTRIC_PIANO_PROGRAMS.has(program) ? "electric-piano" : "piano";
  if (program >= 40 && program <= 51 || /string|violin|cello|pizzicato/.test(label)) return "strings";
  if (program >= 72 && program <= 79 || /flute|wind|sax|clarinet|oboe/.test(label)) return "winds";
  if (program >= 80 && program <= 87 || /lead|synth/.test(label)) return "synth";
  return "unknown";
}

export function isPianoFamily(family) {
  return family === "piano" || family === "electric-piano";
}
