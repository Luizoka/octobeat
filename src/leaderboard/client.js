import { getAccessToken } from "../identity/auth.js";
import { anonymousToken, fetchJson, request as dataRequest } from "./dataApi.js";

export { isLeaderboardEnabled } from "./dataApi.js";

const env = import.meta.env ?? {};

export const UNAVAILABLE_VERSION = "Ranking indisponível para esta versão";
export const TWO_HANDS_NOTICE = "Ranking só vale no modo duas mãos";

export async function authHeaders(options) {
  const token = await getAccessToken(options) ?? await anonymousToken(options);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function signedInHeaders(options) {
  const token = await getAccessToken(options);
  if (!token) throw new Error("Entre na sua conta para continuar.");
  return { Authorization: `Bearer ${token}` };
}

function request(path, payload, getHeaders = authHeaders) {
  return dataRequest(path, payload, getHeaders);
}

export async function loadRankedChart(slug, difficulty) {
  const chart = await fetchJson(
    `${env.BASE_URL ?? "/"}ranked/${encodeURIComponent(slug)}/${encodeURIComponent(difficulty)}.json`,
    {},
    "Não foi possível carregar a fase ranqueada.",
  );
  if (chart?.slug !== slug || chart.difficulty !== difficulty || !chart.chartVersion || !chart.notes?.length) {
    throw new Error("Não foi possível carregar a fase ranqueada.");
  }
  return chart;
}

export async function findChartId({ slug, difficulty, chartVersion }) {
  const query = new URLSearchParams({
    select: "id",
    song_slug: `eq.${slug}`,
    difficulty: `eq.${difficulty}`,
    chart_version: `eq.${chartVersion}`,
    active: "eq.true",
    limit: "1",
  });
  const rows = await request(`ranked_charts?${query}`);
  if (!Array.isArray(rows)) throw new Error("Resposta inválida do ranking. Tente novamente.");
  if (!rows.length) throw new Error(UNAVAILABLE_VERSION);
  return rows[0].id;
}

export async function submitScore(payload) {
  const result = await request("rpc/submit_score", payload, signedInHeaders);
  if (result !== null && (result?.position == null || result.best_score == null)) {
    throw new Error("Não foi possível confirmar o envio da pontuação.");
  }
  return result;
}

export async function getLeaderboard(chartId) {
  const rows = await request("rpc/get_leaderboard", { p_chart_id: chartId, p_limit: 50 });
  if (!Array.isArray(rows)) throw new Error("Resposta inválida do ranking. Tente novamente.");
  return rows;
}

export async function getGlobalLeaderboard(difficulty) {
  const rows = await request("rpc/get_global_leaderboard", { p_difficulty: difficulty, p_limit: 50 });
  if (!Array.isArray(rows)) throw new Error("Resposta inválida do ranking. Tente novamente.");
  return rows;
}

export async function getPlayerProfile(slug) {
  const profile = await request("rpc/get_player_profile", { p_slug: slug });
  if (typeof profile?.display_name !== "string" || (profile.private !== true && !Array.isArray(profile.best))) {
    throw new Error("Resposta inválida do perfil. Tente novamente.");
  }
  return profile;
}
