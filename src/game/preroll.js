// Pré-rolo do início da partida. Puro, sem React.
//
// Uma nota leva `fallDuration` segundos do topo até a linha de acerto. Se a
// primeira nota da música está antes disso (ex.: 0,4 s), ela "nascia" no meio
// da pista logo depois da contagem. Solução: o relógio do jogo começa
// NEGATIVO; as primeiras notas descem desde o topo e o áudio entra no 0.
// O áudio (MIDI e demo) aceita posição negativa como silêncio inicial.

/** Folga extra, além da queda completa, antes da primeira nota chegar. */
export const START_MARGIN_SECONDS = 0.75;

/**
 * Posição (em segundos de música) onde a partida começa: 0 se já há tempo de
 * sobra antes da primeira nota; senão um valor negativo (o pré-rolo).
 */
export function startPosition(notes, fallDuration, margin = START_MARGIN_SECONDS) {
  if (!notes?.length) return 0;
  let first = Infinity;
  for (const note of notes) if (note.time < first) first = note.time;
  const needed = fallDuration + margin;
  return first >= needed ? 0 : first - needed;
}
