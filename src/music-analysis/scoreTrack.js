import { DEFAULT_SALIENCE_PRESET, SALIENCE_PRESETS } from "./config.js";

function addReason(reasons, label, value) {
  const rounded = Math.round(value * 10) / 10;
  reasons.push(`${label}:${rounded >= 0 ? "+" : ""}${rounded}`);
  return value;
}

export function scoreTrack(analysis, presetName = DEFAULT_SALIENCE_PRESET) {
  const config = SALIENCE_PRESETS[presetName] ?? SALIENCE_PRESETS.default;
  if (!analysis.noteCount) return { score: Number.NEGATIVE_INFINITY, reasons: ["empty:ignored"] };
  const reasons = [];
  let score = 0;
  score += addReason(reasons, `family.${analysis.instrumentFamily}`, config.familyWeights[analysis.instrumentFamily] ?? 0);

  const instrumentLabel = `${analysis.name} ${analysis.instrumentName}`.toLowerCase();
  if (/lead/.test(instrumentLabel)) score += addReason(reasons, "lead", config.leadInstrumentBonus);
  if (/music box|vibraphone|marimba|xylophone/.test(instrumentLabel)) score += addReason(reasons, "melodic-instrument", config.musicBoxBonus);
  score += addReason(reasons, "monophony", analysis.monophonyRatio * config.monophonyWeight);

  const normalizedPitch = Math.max(0, Math.min(1, ((analysis.averagePitch ?? 60) - 36) / 48));
  score += addReason(reasons, "pitch", normalizedPitch * config.pitchWeight);
  score += addReason(reasons, "velocity", (analysis.averageVelocity ?? 0.65) * config.velocityWeight);

  const durationQuality = Math.max(0, 1 - Math.abs(Math.log2(Math.max(analysis.averageNoteDuration ?? 0.25, 0.02) / 0.3)) / 5);
  score += addReason(reasons, "duration", durationQuality * config.durationWeight);
  score += addReason(reasons, "activity", Math.sqrt(analysis.activeRatio) * config.activityWeight);

  if (analysis.noteCount < 12) score += addReason(reasons, "too-sparse", -config.sparsePenalty);
  else if (analysis.noteCount < 32) score += addReason(reasons, "sparse", -config.sparsePenalty / 2);
  if (analysis.densityLevel === "dense") score += addReason(reasons, "density", -config.densePenalty);
  if (analysis.densityLevel === "very-dense") score += addReason(reasons, "density", -config.veryDensePenalty);
  if (analysis.suspicious) score += addReason(reasons, "suspicious", -config.suspiciousPenalty);

  return { score: Math.round(score * 10) / 10, reasons };
}
