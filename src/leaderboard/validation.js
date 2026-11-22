import { finalRank, weightedAccuracy } from "../game/scoring.js";

/** "mobile" se o ponteiro principal é o dedo (mesma regra de src/ui/device.js), senão "pc". */
export function detectPlatform(matchMedia = globalThis.matchMedia) {
  try {
    return matchMedia?.("(pointer: coarse)").matches ? "mobile" : "pc";
  } catch {
    return "pc";
  }
}

export function platformLabel(platform) {
  return platform === "mobile" ? "📱 Mobile" : platform === "pc" ? "💻 PC" : "—";
}

export function buildSubmitPayload(chartId, stats, platform = null) {
  const { perfect, good, offset, miss } = stats.counts;
  return {
    p_chart_id: chartId,
    p_score: stats.score,
    p_accuracy: Number((weightedAccuracy(stats) * 100).toFixed(2)),
    p_max_combo: stats.maxCombo,
    p_perfect: perfect,
    p_good: good,
    p_offset: offset,
    p_miss: miss,
    p_holds_complete: stats.holdsComplete,
    p_rank: finalRank(stats),
    p_platform: platform,
  };
}
