// Músicas que acompanham o jogo (tela inicial). Os MIDIs ficam em `songs/`,
// com nome no padrão `<jogo>-<nome-da-musica>.mid` (minúsculas, hífen).
// O título exibido vem daqui, não do nome do arquivo.

const flowerManUrl = new URL("../../songs/deltarune-flower-man.mid", import.meta.url).href;
const deathByGlamourUrl = new URL("../../songs/undertale-death-by-glamour.mid", import.meta.url).href;
const chaosKingUrl = new URL("../../songs/deltarune-chaos-king.mid", import.meta.url).href;
const cutieMewMewUrl = new URL("../../songs/deltarune-cutie-mew-mew-magic.mid", import.meta.url).href;

export const SONG_CATALOG = Object.freeze([
  { id: "flower-man", file: "deltarune-flower-man.mid", url: flowerManUrl,
    title: "Flower Man", artist: "Deltarune — Chapter 5", vibe: "Equilibrada, boa para começar" },
  { id: "cutie-mew-mew-magic", file: "deltarune-cutie-mew-mew-magic.mid", url: cutieMewMewUrl,
    title: "Cutie Mew Mew Magic", artist: "Deltarune — Chapter 5", vibe: "Rápida e animada, com notas longas" },
  { id: "chaos-king", file: "deltarune-chaos-king.mid", url: chaosKingUrl,
    title: "Chaos King", artist: "Deltarune — MIDI por ShinkoNetCavy", vibe: "Batalha agitada, cheia de trinados" },
  { id: "death-by-glamour", file: "undertale-death-by-glamour.mid", url: deathByGlamourUrl,
    title: "Death by Glamour", artist: "Undertale", vibe: "A mais intensa: muitas notas e acordes" },
]);

export async function loadCatalogFile(entry, signal) {
  const response = await fetch(entry.url, { signal });
  if (!response.ok) throw new Error(`Não foi possível carregar ${entry.title}.`);
  return new File([await response.blob()], entry.file, { type: "audio/midi" });
}
