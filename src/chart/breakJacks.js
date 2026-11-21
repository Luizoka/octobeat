// Quebra de jacks (mesma coluna repetida muito rápido). Puro, sem React.
//
// Nota repetida no MIDI (rufos, pulsos de synth) cai sempre na mesma coluna e
// vira "martelar uma tecla". Aqui, repetições rápidas de uma nota simples passam
// a alternar com a coluna vizinha da mesma mão (vira um trinado), o que é mais
// gostoso de tocar e continua acompanhando o som. Tempos não mudam.

import { JACK_BREAK } from "../music-analysis/config.js";

const CHORD_TOLERANCE = 0.035;

/** Coluna vizinha dentro da mesma mão (0–3 ou 4–7). */
export function neighborLane(key) {
  return key % 4 === 3 ? key - 1 : key + 1;
}

/**
 * @param {Array<{time:number,key:number}>} notes  ordenado por tempo
 * @returns cópia com `key` ajustado; demais campos preservados
 */
export function breakJacks(notes, { maxGapSeconds = JACK_BREAK.maxGapSeconds } = {}) {
  const result = notes.map((note) => ({ ...note }));
  const isChord = (index) => (
    (index > 0 && Math.abs(result[index].time - result[index - 1].time) <= CHORD_TOLERANCE)
    || (index + 1 < result.length && Math.abs(result[index + 1].time - result[index].time) <= CHORD_TOLERANCE));

  let previous = null; // { originalKey, key, time }
  result.forEach((note, index) => {
    if (isChord(index)) { previous = null; return; }
    const originalKey = note.key;
    const repeated = previous
      && previous.originalKey === originalKey
      && note.time - previous.time < maxGapSeconds;
    // Só move para a vizinha se a anterior estava na coluna original (alterna).
    if (repeated && previous.key === originalKey) note.key = neighborLane(originalKey);
    previous = { originalKey, key: note.key, time: note.time + (note.duration ?? 0) };
  });
  return result;
}
