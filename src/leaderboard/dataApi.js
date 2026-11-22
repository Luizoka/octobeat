const env = import.meta.env ?? {};
const apiUrl = (env.VITE_NEON_DATA_API_URL ?? "").trim().replace(/\/+$/, "");

export function isLeaderboardEnabled() {
  // Sem o Neon Auth não há JWT anônimo, e a Data API recusa tudo.
  return Boolean(apiUrl && authUrl);
}

export const authUrl = (env.VITE_NEON_AUTH_URL ?? "").trim().replace(/\/+$/, "");
let cachedToken = null; // { token, expiresAt (ms) }
let pendingToken = null;

// A Data API do Neon exige JWT até para o papel `anonymous`. O Neon Auth
// entrega um JWT anônimo (sem criar conta, ~1 h) em GET <auth>/token/anonymous.
export async function anonymousToken({ refresh = false } = {}) {
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

export async function fetchJson(url, options, unavailable) {
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

export async function request(path, payload, getHeaders, retried = false) {
  if (!isLeaderboardEnabled()) throw new Error("Ranking online indisponível.");
  const headers = { Accept: "application/json", ...(await getHeaders({ refresh: retried })) };
  const options = payload === undefined
    ? { headers }
    : { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(payload) };
  try {
    return await fetchJson(`${apiUrl}/${path}`, options, "Não foi possível acessar o ranking. Tente novamente.");
  } catch (error) {
    // Uma resposta 401 permite renovar o JWT e tentar uma vez.
    if (!retried && authUrl && error.status === 401) return request(path, payload, getHeaders, true);
    throw error;
  }
}
