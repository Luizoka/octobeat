export const TRACK_DENSITY = Object.freeze({
  dense: 8,
  veryDense: 15,
  suspicious: 30,
});

export const FAMILY_MELODY_WEIGHT = Object.freeze({
  piano: 25,
  "electric-piano": 24,
  synth: 27,
  winds: 20,
  guitar: 18,
  strings: 8,
  bass: -20,
  percussion: -30,
  unknown: 0,
});

export const SALIENCE_PRESETS = Object.freeze({
  default: Object.freeze({
    familyWeights: FAMILY_MELODY_WEIGHT,
    monophonyWeight: 25,
    pitchWeight: 10,
    velocityWeight: 8,
    durationWeight: 5,
    activityWeight: 10,
    leadInstrumentBonus: 5,
    musicBoxBonus: 12,
    sparsePenalty: 14,
    densePenalty: 4,
    veryDensePenalty: 14,
    suspiciousPenalty: 100,
  }),
});

export const DEFAULT_SALIENCE_PRESET = "default";

// Melodia por segmento (modo Essência): a música é dividida em blocos de
// compassos e cada bloco usa a melhor track que está tocando nele.
// - measuresPerSegment: tamanho do bloco.
// - switchCost: penalidade por trocar de track entre blocos (evita pular toda hora).
// - minNotes / sparsePenalty: track quase parada no bloco perde pontos.
export const MELODY_SEGMENTS = Object.freeze({
  measuresPerSegment: 4,
  switchCost: 15,
  minNotes: 4,
  sparsePenalty: 20,
});

// Densidade por dificuldade, em tempo musical.
// - subdivision: grade preferida (1 = semínima, 2 = colcheia, 4 = semicolcheia).
//   Notas fora dela continuam elegíveis, mas com prioridade menor.
// - minSpacingBeats: distância mínima entre notas do chart, em beats.
// - minSeconds: piso em segundos para músicas muito rápidas não ficarem impossíveis.
// - offGridPenalty: multiplica a força rítmica de notas fora da grade preferida.
// Notas longas (holds):
// - holdMinBeats: duração mínima no MIDI (em beats) para virar hold.
// - holdMaxRatio: fração máxima de notas do chart que podem ser holds (evita
//   que MIDIs legato transformem tudo em hold); ficam os holds mais longos.
// - holdBlocksHand: no fácil, nenhuma outra nota na mesma mão durante o hold
//   (o hold é encurtado até a próxima nota daquela mão).
// - holdTailGapBeats: folga entre o fim do hold e a próxima nota que o limita.
export const CHART_DIFFICULTY = Object.freeze({
  easy: Object.freeze({ subdivision: 1, minSpacingBeats: 1, minSeconds: 0.28, maxChord: 1, offGridPenalty: 0.5,
    holdMinBeats: 2, holdMaxRatio: 0.25, holdBlocksHand: true, holdTailGapBeats: 0.5 }),
  normal: Object.freeze({ subdivision: 2, minSpacingBeats: 0.5, minSeconds: 0.18, maxChord: 2, offGridPenalty: 0.5,
    holdMinBeats: 1, holdMaxRatio: 0.25, holdBlocksHand: false, holdTailGapBeats: 0.5 }),
  hard: Object.freeze({ subdivision: 4, minSpacingBeats: 0.25, minSeconds: 0.1, maxChord: 3, offGridPenalty: 0.5,
    holdMinBeats: 1, holdMaxRatio: 0.25, holdBlocksHand: false, holdTailGapBeats: 0.25 }),
});
