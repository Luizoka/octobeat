// A TR-808 cobre as peças centrais do GM. Variações da mesma peça podem
// compartilhar um sample. Notas sem uma peça equivalente ficam em silêncio.
const KICK = ["kick", "bassdrum", "bass", "bd"];
const SNARE = ["snare", "snaredrum", "sd"];
const CLOSED_HAT = ["closedhihat", "hihatclosed", "hihatclose", "closedhat", "hatclosed", "hihat", "ch"];
const OPEN_HAT = ["openhihat", "hihatopen", "openhat", "hatopen", "oh"];
const LOW_TOM = ["lowtom", "tomlow", "lt", "tom"];
const MID_TOM = ["midtom", "tommid", "mt", ...LOW_TOM];
const HIGH_TOM = ["hightom", "tomhigh", "tomhi", "ht", ...MID_TOM];
const CRASH = ["crashcymbal", "crash", "cymbal", "cy"];
const RIDE = ["ridecymbal", "ride", "cymbal", "cy"];
const GM_DRUMS = new Map([
  [35, KICK], [36, KICK], [37, ["sidestick", "rimshot", "rim", "rs"]],
  [38, SNARE], [39, ["clap", "handclap", "cp"]], [40, SNARE],
  [41, LOW_TOM], [42, CLOSED_HAT], [43, LOW_TOM], [44, CLOSED_HAT],
  [45, LOW_TOM], [46, OPEN_HAT], [47, MID_TOM], [48, MID_TOM],
  [49, CRASH], [50, HIGH_TOM], [51, RIDE], [52, CRASH], [53, RIDE],
  [54, ["tambourine"]], [55, CRASH], [56, ["cowbell", "cb"]], [57, CRASH],
  [59, RIDE], [60, ["highbongo", "bongohigh"]], [61, ["lowbongo", "bongolow"]],
  [62, ["mutehighconga", "highcongamute", "highconga", "congahigh", "congahi", "hc"]],
  [63, ["openhighconga", "highconga", "congahigh", "congahi", "hc"]],
  [64, ["lowconga", "congalow", "lc"]], [70, ["maracas", "maraca", "ma"]],
  [75, ["claves", "clave", "cl"]],
]);

export function mapGmDrums(sampleNames) {
  const byName = new Map();
  for (const sample of sampleNames) {
    const name = sample.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/\d+$/, "");
    if (!byName.has(name)) byName.set(name, sample);
  }

  const drums = new Map();
  for (const [pitch, candidates] of GM_DRUMS) {
    const name = candidates.find((candidate) => byName.has(candidate));
    if (name) drums.set(pitch, byName.get(name));
  }
  return drums;
}
