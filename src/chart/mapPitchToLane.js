export function mapPitchToLane(pitch, range) {
  const { min, max } = range;
  if (max <= min) return 3;
  return Math.max(0, Math.min(7, Math.round(((pitch - min) / (max - min)) * 7)));
}

/**
 * Faixa de pitch usada no mapeamento. Usa percentis (por padrão 5%–95%) em vez
 * de min–max: poucas notas extremas (um baixo isolado, um grito agudo) não
 * comprimem mais a melodia inteira em 2–3 colunas. Notas fora da faixa caem
 * nas colunas das pontas (mapPitchToLane já limita a 0–7).
 */
export function getPitchRange(notes, { lowPercentile = 0.05, highPercentile = 0.95 } = {}) {
  const pitches = notes.map((note) => note.pitch).filter(Number.isFinite).sort((a, b) => a - b);
  if (!pitches.length) return { min: 60, max: 60 };
  const at = (fraction) => pitches[Math.min(pitches.length - 1, Math.max(0, Math.round(fraction * (pitches.length - 1))))];
  return { min: at(lowPercentile), max: at(highPercentile) };
}
