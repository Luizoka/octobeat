// Grade musical: conversão segundos ↔ beats, compassos, quantização e força
// rítmica de cada posição. "Beat" aqui é sempre uma semínima, independente da
// fórmula de compasso. Puro, sem dependência de React.

export const DEFAULT_BPM = 120;
const EPSILON = 1e-6;

/**
 * Monta um mapa de tempo com a posição acumulada (em beats) de cada mudança.
 * Aceita a lista `tempoChanges` do OctoBeatSong ({ time, bpm }).
 */
export function buildTempoMap(tempoChanges = []) {
  const changes = tempoChanges
    .filter((change) => Number.isFinite(change?.time) && Number(change?.bpm) > 0)
    .map((change) => ({ time: Math.max(0, change.time), bpm: Number(change.bpm) }))
    .sort((a, b) => a.time - b.time);
  // Garante um segmento iniciando em 0 s. Se o primeiro tempo começa depois,
  // o trecho inicial usa o BPM do primeiro evento (comportamento comum em MIDI).
  if (!changes.length) changes.push({ time: 0, bpm: DEFAULT_BPM });
  else if (changes[0].time > 0) changes.unshift({ time: 0, bpm: changes[0].bpm });

  const segments = [];
  let beat = 0;
  changes.forEach((change, index) => {
    const previous = segments.at(-1);
    if (previous) beat += ((change.time - previous.time) * previous.bpm) / 60;
    // Mudanças no mesmo instante: a última vence.
    if (previous && change.time === previous.time) segments.pop();
    segments.push({ time: change.time, bpm: change.bpm, beat: index === 0 ? 0 : beat });
  });
  return segments;
}

function findSegment(tempoMap, key, value) {
  let low = 0;
  let high = tempoMap.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (tempoMap[mid][key] <= value) low = mid;
    else high = mid - 1;
  }
  return tempoMap[low];
}

export function secondsToBeats(time, tempoMap) {
  const segment = findSegment(tempoMap, "time", time);
  return segment.beat + ((time - segment.time) * segment.bpm) / 60;
}

export function beatsToSeconds(beat, tempoMap) {
  const segment = findSegment(tempoMap, "beat", beat);
  return segment.time + ((beat - segment.beat) * 60) / segment.bpm;
}

/** Arredonda uma posição em beats para a grade com `subdivision` passos por beat. */
export function quantizeBeat(beat, subdivision = 4) {
  return Math.round(beat * subdivision) / subdivision;
}

/** A posição está na grade (1 = semínima, 2 = colcheia, 4 = semicolcheia)? */
export function isOnGrid(beat, subdivision, tolerance = 0.06) {
  return Math.abs(beat - quantizeBeat(beat, subdivision)) <= tolerance;
}

/**
 * Monta a grade de compassos a partir de `timeSignatures` ({ time, beats, beatType }).
 * Cada segmento guarda onde começa (em beats), o tamanho do compasso em semínimas
 * e o índice do primeiro compasso. Sem fórmula de compasso, assume 4/4.
 */
export function buildMeasureMap(timeSignatures = [], tempoMap = buildTempoMap()) {
  const signatures = timeSignatures
    .filter((signature) => Number.isFinite(signature?.time) && signature.beats > 0 && signature.beatType > 0)
    .map((signature) => ({ beat: secondsToBeats(Math.max(0, signature.time), tempoMap), beats: signature.beats, beatType: signature.beatType }))
    .sort((a, b) => a.beat - b.beat);
  if (!signatures.length || signatures[0].beat > EPSILON) {
    const first = signatures[0] ?? { beats: 4, beatType: 4 };
    signatures.unshift({ beat: 0, beats: first.beats, beatType: first.beatType });
  }

  const segments = [];
  signatures.forEach((signature) => {
    const previous = segments.at(-1);
    // MusicXML repete a fórmula em cada parte; mudanças no mesmo ponto colapsam.
    if (previous && Math.abs(signature.beat - previous.beat) < EPSILON) segments.pop();
    const before = segments.at(-1);
    if (before && before.beats === signature.beats && before.beatType === signature.beatType) return;
    const compound = signature.beatType === 8 && signature.beats % 3 === 0 && signature.beats > 3;
    const measureLength = (signature.beats * 4) / signature.beatType;
    segments.push({
      beat: signature.beat,
      beats: signature.beats,
      beatType: signature.beatType,
      measureLength,
      // Pulso: semínima em 4/4, mínima em 2/2, semínima pontuada em 6/8, 9/8, 12/8.
      pulse: compound ? 1.5 : 4 / signature.beatType,
      measureIndex: before ? before.measureIndex + Math.ceil((signature.beat - before.beat) / before.measureLength - EPSILON) : 0,
    });
  });
  return segments;
}

/** Posição dentro do compasso: { measure, beatInMeasure, segment }. */
export function getMeasurePosition(beat, measureMap) {
  const segment = findSegment(measureMap, "beat", beat);
  const elapsed = Math.max(0, beat - segment.beat);
  const offset = Math.floor(elapsed / segment.measureLength + EPSILON);
  return {
    measure: segment.measureIndex + offset,
    beatInMeasure: Math.max(0, elapsed - offset * segment.measureLength),
    segment,
  };
}

/** Início (em beats) de cada compasso entre `fromBeat` e `toBeat`. */
export function measureStarts(measureMap, fromBeat, toBeat) {
  const starts = [];
  measureMap.forEach((segment, index) => {
    const end = measureMap[index + 1]?.beat ?? Infinity;
    for (let beat = segment.beat; beat < end - EPSILON && beat <= toBeat; beat += segment.measureLength) {
      if (beat >= fromBeat - EPSILON) starts.push(beat);
    }
  });
  return starts;
}

export const BEAT_STRENGTH = Object.freeze({
  downbeat: 1, // tempo 1 do compasso
  strong: 0.8, // tempo forte secundário (ex.: tempo 3 em 4/4)
  beat: 0.6, // demais pulsos
  eighth: 0.4, // contratempo de colcheia
  triplet: 0.3, // tercinas
  sixteenth: 0.25, // semicolcheias
  offGrid: 0.1, // fora de qualquer grade conhecida
});

/**
 * Força rítmica de uma posição: tempo 1 > tempo forte > pulso > contratempo > subdivisões.
 */
export function beatStrength(beat, measureMap, tolerance = 0.06) {
  const { beatInMeasure, segment } = getMeasurePosition(beat, measureMap);
  const near = (value) => Math.abs(value - Math.round(value)) <= tolerance;
  const pulseCount = Math.round(segment.measureLength / segment.pulse);
  const position = beatInMeasure / segment.pulse;
  if (beatInMeasure <= tolerance || segment.measureLength - beatInMeasure <= tolerance) return BEAT_STRENGTH.downbeat;
  if (near(position)) {
    const index = Math.round(position);
    return pulseCount >= 4 && pulseCount % 2 === 0 && index === pulseCount / 2 ? BEAT_STRENGTH.strong : BEAT_STRENGTH.beat;
  }
  if (near(beatInMeasure)) return BEAT_STRENGTH.beat; // semínima em compasso composto
  if (near(beatInMeasure * 2)) return BEAT_STRENGTH.eighth;
  if (near(beatInMeasure * 3)) return BEAT_STRENGTH.triplet;
  if (near(beatInMeasure * 4)) return BEAT_STRENGTH.sixteenth;
  return BEAT_STRENGTH.offGrid;
}
