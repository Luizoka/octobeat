import { finalRank, weightedAccuracy } from "../game/scoring.js";

export function validateCredentials(username, password) {
  // Igual ao banco: corta as pontas e junta espaços repetidos.
  const cleaned = username.trim().replace(/\s+/g, " ");
  // Letras (sem acento), números e espaços. 255 é apenas o limite interno do banco.
  if (!cleaned || cleaned.length > 255 || /[^A-Za-z0-9 ]/.test(cleaned)) {
    throw new Error("Use só letras, números e espaços no usuário.");
  }
  const length = [...password].length;
  if (length < 6 || length > 255 || /[\u0000\uD800-\uDFFF]/u.test(password)) {
    throw new Error("A senha precisa ter pelo menos 6 caracteres.");
  }
  return { p_username: cleaned, p_password: password };
}

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

export function buildSubmitPayload(token, chartId, stats, platform = null) {
  const { perfect, good, offset, miss } = stats.counts;
  return {
    p_token: token,
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
