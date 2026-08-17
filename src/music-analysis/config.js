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
