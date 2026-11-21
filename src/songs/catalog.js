// Músicas que acompanham o jogo (tela inicial). Os MIDIs ficam em `songs/`,
// com nome no padrão `<jogo>-<nome-da-musica>.mid` (minúsculas, hífen).
// O título exibido vem daqui, não do nome do arquivo.

import flowerManUrl from "../../songs/deltarune-flower-man.mid?url";
import deathByGlamourUrl from "../../songs/undertale-death-by-glamour.mid?url";
import chaosKingUrl from "../../songs/deltarune-chaos-king.mid?url";
import cutieMewMewUrl from "../../songs/deltarune-cutie-mew-mew-magic.mid?url";

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
