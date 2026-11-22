const env = import.meta.env ?? {};
const apiUrl = (env.VITE_NEON_DATA_API_URL ?? "").trim().replace(/\/+$/, "");

export const UNAVAILABLE_VERSION = "Ranking indisponível para esta versão";
export const TWO_HANDS_NOTICE = "Ranking só vale no modo duas mãos";

export function isLeaderboardEnabled() {
  // Sem o Neon Auth não há JWT anônimo, e a Data API recusa tudo.
  return Boolean(apiUrl && authUrl);
}

const authUrl = (env.VITE_NEON_AUTH_URL ?? "").trim().replace(/\/+$/, "");
let cachedToken = null; // { token, expiresAt (ms) }
let pendingToken = null;

// A Data API do Neon exige JWT até para o papel `anonymous`. O Neon Auth
// entrega um JWT anônimo (sem criar conta, ~1 h) em GET <auth>/token/anonymous.
// Nosso login (usuário/senha) é outro: fica no Postgres e viaja como p_token.
async function anonymousToken({ refresh = false } = {}) {
  if (!authUrl) return null;
  if (!refresh && cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) return cachedToken.token;
  pendingToken ??= fetchJson(`${authUrl}/token/anonymous`, {}, "O acesso ao ranking está indisponível no momento.")
    .then((body) => {
      if (typeof body?.token !== "string") throw new Error("O acesso ao ranking está indisponível no momento.");
      const expires = Number(body.expires_at) || 0;
      // expires_at pode vir em segundos ou em milissegundos.
      cachedToken = { token: body.token, expiresAt: expires < 1e12 ? expires * 1000 : expires };
      return body.token;
    })
    .finally(() => { pendingToken = null; });
  return pendingToken;
}

export async function authHeaders(options) {
  const token = await anonymousToken(options);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchJson(url, options, unavailable) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = response.status === 204 ? null : await response.json().catch((error) => {
      if (controller.signal.aborted) throw error;
      return null;
    });
    if (response.ok) return body;
    if (body?.code === "P0001" && typeof body.message === "string") throw new Error(body.message);
    if (response.status === 401 || response.status === 403) {
      throw Object.assign(new Error("O acesso ao ranking está indisponível no momento."), { status: response.status });
    }
    if (response.status === 429) throw new Error("Muitas tentativas. Aguarde um pouco e tente novamente.");
    throw new Error(unavailable);
  } catch (error) {
    if (controller.signal.aborted) throw new Error("A conexão demorou demais. Tente novamente.");
    if (error instanceof TypeError) throw new Error("Falha de conexão. Verifique sua internet e tente novamente.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function request(path, payload, { retried = false } = {}) {
  if (!isLeaderboardEnabled()) throw new Error("Ranking online indisponível.");
  const headers = { Accept: "application/json", ...(await authHeaders({ refresh: retried })) };
  const options = payload === undefined
    ? { headers }
    : { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(payload) };
  try {
    return await fetchJson(`${apiUrl}/${path}`, options, "Não foi possível acessar o ranking. Tente novamente.");
  } catch (error) {
    // Token anônimo vencido/rejeitado: busca outro uma única vez.
    if (!retried && authUrl && error.status === 401) return request(path, payload, { retried: true });
    throw error;
  }
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

export const register = (credentials) => request("rpc/register", credentials);
export const login = (credentials) => request("rpc/login", credentials);
export const logout = (token) => request("rpc/logout", { p_token: token });

export async function submitScore(payload) {
  const result = await request("rpc/submit_score", payload);
  if (result?.position == null || result.best_score == null) {
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

export async function getPlayerProfile(username) {
  const profile = await request("rpc/get_player_profile", { p_username: username });
  if (typeof profile?.username !== "string" || !Array.isArray(profile.best)) {
    throw new Error("Resposta inválida do perfil. Tente novamente.");
  }
  return profile;
}
