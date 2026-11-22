import { anonymousToken, authUrl, isLeaderboardEnabled, request } from "../leaderboard/dataApi.js";
import { isValidUsername, normalizeUsername, passwordAccountEmail, PASSWORD_ACCOUNT_DOMAIN, USERNAME_ERROR } from "./username.js";

export const MIN_PASSWORD_LENGTH = 8;
const CONNECTION_ERROR = "Falha de conexão. Verifique sua internet e tente novamente.";
const NO_ACCOUNT = "Entre na sua conta para continuar.";
const INVALID_CREDENTIALS = "Usuário ou senha inválidos.";
const FETCH_OPTIONS = { credentials: "include", timeout: 8000 };
export const isAuthEnabled = isLeaderboardEnabled;

let snapshot = { status: "loading" };
let session = null;
let revision = 0;
let restoring;
let refreshing;
let client;
const listeners = new Set();

export const getSnapshot = () => snapshot;
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(next) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

async function getClient() {
  if (!isAuthEnabled()) throw new Error("Contas online indisponíveis.");
  client ??= import("@neon/neon-js/auth")
    .then(({ createAuthClient }) => createAuthClient(authUrl))
    .catch(() => {
      client = null;
      throw new Error(CONNECTION_ERROR);
    });
  return client;
}

async function authCall(call, fallback) {
  const sdk = await getClient();
  let response;
  try {
    response = await call(sdk);
  } catch (error) {
    // Algumas respostas HTTP do adaptador são lançadas em vez de retornadas.
    response = { error };
  }
  const { data, error } = response;
  if (!error) return data;
  if (!error.status || error.status >= 500) throw new Error(CONNECTION_ERROR);
  if (error.status === 429) throw new Error("Muitas tentativas. Aguarde um pouco e tente novamente.");
  if (["USER_ALREADY_EXISTS", "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"].includes(error.code) || error.status === 409) {
    throw new Error("Este nome de usuário já está em uso.");
  }
  throw Object.assign(new Error(fallback), { status: error.status });
}

function expiresAt(token) {
  try {
    const [, payload, signature] = token.split(".");
    if (!signature) return 0;
    return Number(JSON.parse(atob(payload.replaceAll("-", "+").replaceAll("_", "/"))).exp) * 1000 || 0;
  } catch {
    return 0;
  }
}

// Na volta do Google o Neon Auth anexa este parâmetro à URL. A 1ª consulta de
// sessão o envia (o SDK faz isso) e o servidor troca o código pelo cookie de
// sessão da partição DESTE site (cookie `Partitioned`). O código vale uma vez.
const OAUTH_VERIFIER_PARAM = "neon_auth_session_verifier";

function returningFromOAuth() {
  try {
    return new URLSearchParams(window.location.search).has(OAUTH_VERIFIER_PARAM);
  } catch {
    return false;
  }
}

function dropOAuthVerifier() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(OAUTH_VERIFIER_PARAM)) return;
    url.searchParams.delete(OAUTH_VERIFIER_PARAM);
    window.history.replaceState(window.history.state, "", url.href);
  } catch {
    // Sem history (ambiente de teste): nada a limpar.
  }
}

async function fetchSession() {
  // O adaptador vanilla injeta no campo session.token o JWT de set-auth-jwt.
  const data = await authCall((sdk) => sdk.getSession({
    fetchOptions: { ...FETCH_OPTIONS, headers: { "X-Force-Fetch": "true" } },
  }), "Não foi possível verificar sua sessão. Tente novamente.").catch((error) => {
    if (error.status === 401) return null;
    throw error;
  });
  if (!data?.user || !data.session) return null;
  const token = data.session.token;
  return { user: data.user, token, expiry: expiresAt(token) };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readSession() {
  const fromOAuth = returningFromOAuth();
  const attempts = fromOAuth ? 4 : 2;
  let lastError = null;
  let sessionWithoutJwt = false;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let current = null;
    try {
      current = await fetchSession();
      lastError = null;
    } catch (error) {
      lastError = error;
    }
    if (current && current.expiry <= Date.now()) sessionWithoutJwt = true;
    if (current && current.expiry > Date.now()) {
      dropOAuthVerifier();
      return current;
    }
    // Visitante comum: sem sessão é resposta definitiva.
    if (!current && !lastError && !fromOAuth) return null;
    // Volta do Google: a troca do código pode responder sem JWT ou falhar
    // (código já usado). Tenta de novo só com o cookie, sem reenviar o código.
    if (fromOAuth) console.warn(`[auth] volta do Google: tentativa ${attempt} sem sessão válida`, current ? "(sem JWT)" : lastError?.message ?? "(sem sessão)");
    dropOAuthVerifier();
    if (attempt < attempts) await wait(400 * attempt);
  }
  if (lastError) throw lastError;
  if (fromOAuth) throw new Error("Não foi possível concluir o login com Google. Tente entrar novamente.");
  if (sessionWithoutJwt) throw new Error("Não foi possível renovar sua sessão. Tente novamente.");
  return null;
}

export async function getAccessToken({ refresh = false } = {}) {
  if (!session) return null;
  if (!refresh && session.expiry > Date.now() + 60_000) return session.token;

  if (refreshing?.revision !== revision) {
    const version = revision;
    const userId = session.user.id;
    const pending = readSession().then((current) => {
      if (version !== revision) return null;
      if (!current) {
        session = null;
        publish({ status: "guest" });
        return null;
      }
      if (current.user.id !== userId) {
        void init();
        return null;
      }
      session = current;
      return current.token;
    }).finally(() => {
      if (refreshing?.pending === pending) refreshing = null;
    });
    refreshing = { revision: version, pending };
  }
  return refreshing.pending;
}

async function profileRequest(name, payload) {
  return request(`rpc/${name}`, payload, async (options) => {
    const token = await getAccessToken(options);
    if (!token) throw new Error(NO_ACCOUNT);
    return { Authorization: `Bearer ${token}` };
  });
}

function startSessionChange() {
  revision += 1;
  session = null;
}

async function restore(expectedUser = false) {
  startSessionChange();
  const version = revision;
  try {
    const current = await readSession();
    if (version !== revision) return snapshot;
    session = current;
    if (!current) {
      publish({ status: "guest" });
    } else {
      // As funções da Data API recebem POST mesmo quando não têm argumentos.
      const profile = await profileRequest("get_my_profile", {});
      if (version === revision) {
        publish(profile ? { status: "ready", user: current.user, profile } : { status: "needsProfile", user: current.user });
      }
    }
  } catch (error) {
    if (version === revision) publish({ status: "error", error: error.message });
    throw error;
  }
  if (expectedUser && snapshot.status === "guest") {
    throw new Error("Não foi possível iniciar a sessão. Tente entrar novamente.");
  }
  return snapshot;
}

export function init() {
  if (!isAuthEnabled()) {
    if (snapshot.status !== "guest") publish({ status: "guest" });
    return Promise.resolve(snapshot);
  }
  if (!restoring) {
    publish({ status: "loading" });
    restoring = restore().catch(() => snapshot).finally(() => { restoring = null; });
  }
  return restoring;
}

function checkedUsername(username) {
  const name = normalizeUsername(username);
  if (!isValidUsername(name)) throw new Error(USERNAME_ERROR);
  return name;
}

export async function usernameAvailable(username) {
  const name = checkedUsername(username);
  const result = await request("rpc/username_available", { p_username: name }, async (options) => {
    const token = await getAccessToken(options) ?? await anonymousToken(options);
    return { Authorization: `Bearer ${token}` };
  });
  return { available: result?.available === true, reason: result?.reason ?? "Este nome de usuário já está em uso." };
}

/** `displayName`: como a pessoa digitou (pode ter acento); o @usuário vai sem acento. */
export async function signUpWithUsername(username, password, displayName = null) {
  const name = checkedUsername(username);
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  if (password.length > 128) throw new Error("A senha pode ter até 128 caracteres.");
  const availability = await usernameAvailable(name);
  if (!availability.available) throw new Error(availability.reason);
  await authCall((sdk) => sdk.signUp.email({
    email: passwordAccountEmail(name), password, name, fetchOptions: FETCH_OPTIONS,
  }), "Não foi possível criar a conta. Confira os dados e tente novamente.");
  const current = await restore(true);
  if (current.status === "needsProfile") await createProfile(name, displayName);
}

export async function signInWithUsername(username, password) {
  const name = normalizeUsername(username);
  if (!isValidUsername(name) || !password) throw new Error(INVALID_CREDENTIALS);
  await authCall((sdk) => sdk.signIn.email({
    email: passwordAccountEmail(name), password, fetchOptions: FETCH_OPTIONS,
  }), INVALID_CREDENTIALS);
  await restore(true);
}

// ── Login com Google em popup ──────────────────────────────────────────────
// Por quê: Brave e Safari apagam os cookies de terceiros de um site quando a
// aba SAI dele. No redirecionamento comum a aba vai ao Google e volta, e o
// cookie de desafio do Neon Auth (gravado no clique) some: a conta é criada,
// mas a sessão nunca chega ao site. Com popup, esta aba nunca sai do site.
// Fluxo (o mesmo que o SDK usa em iframes):
//   1. o pedido sai DESTA aba (grava o cookie de desafio na partição do site);
//   2. o popup faz Google → Neon → volta para `/?octobeat_oauth_popup=1&neon_auth_session_verifier=…`;
//   3. o popup manda o código para esta aba e fecha (completeOAuthPopup);
//   4. esta aba troca o código pela sessão, sem recarregar (o resultado da partida fica na tela).
const POPUP_PARAM = "octobeat_oauth_popup";
const POPUP_MESSAGE = "octobeat:oauth-complete";
// O Google separa o popup de quem o abriu (Cross-Origin-Opener-Policy): depois
// dele, `window.opener` some e `popup.closed` fica true na aba principal mesmo
// com o popup aberto. Por isso a conversa é por BroadcastChannel (mesmo site).
const POPUP_CHANNEL = "octobeat-auth";

/** Roda ANTES de montar o React. Se esta janela é o popup de retorno, entrega o código à aba principal. */
export function completeOAuthPopup() {
  let params;
  try {
    params = new URLSearchParams(window.location.search);
  } catch {
    return false;
  }
  if (!params.has(POPUP_PARAM)) return false;
  const message = { type: POPUP_MESSAGE, verifier: params.get(OAUTH_VERIFIER_PARAM), error: params.get("error") };
  try {
    const channel = new BroadcastChannel(POPUP_CHANNEL);
    channel.postMessage(message);
    channel.close();
  } catch { /* sem BroadcastChannel: tenta o opener abaixo */ }
  try {
    if (window.opener && window.opener !== window) window.opener.postMessage(message, window.location.origin);
  } catch { /* opener cortado pelo Google */ }
  window.close();
  // Se o navegador não deixar fechar sozinho, mostra um aviso no lugar do jogo.
  setTimeout(() => {
    document.body.innerHTML = '<p style="font:16px system-ui;color:#e8f4f8;text-align:center;margin-top:30vh">'
      + "Login concluído. Pode fechar esta janela e voltar ao OctoBeat.</p>";
  }, 300);
  return true;
}

function waitForPopup(signal) {
  return new Promise((resolve, reject) => {
    let channel = null;
    const finish = (fn, value) => {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      signal?.removeEventListener("abort", onAbort);
      try { channel?.close(); } catch { /* já fechado */ }
      fn(value);
    };
    function handle(data) {
      if (data?.type !== POPUP_MESSAGE) return;
      if (data.verifier) finish(resolve, data.verifier);
      else finish(reject, new Error("O Google não concluiu o login. Tente novamente."));
    }
    function onMessage(event) {
      if (event.origin === window.location.origin) handle(event.data);
    }
    function onAbort() {
      finish(reject, Object.assign(new Error("Login com Google cancelado."), { cancelled: true }));
    }
    try {
      channel = new BroadcastChannel(POPUP_CHANNEL);
      channel.onmessage = (event) => handle(event.data);
    } catch { /* fica só com postMessage */ }
    window.addEventListener("message", onMessage);
    signal?.addEventListener("abort", onAbort);
    const timer = setTimeout(() => finish(reject, new Error("O login com Google demorou demais. Tente novamente.")), 300_000);
  });
}

/**
 * Chame direto no clique (antes de qualquer await), senão o popup é bloqueado.
 * `beforeRedirect` só roda se o popup for bloqueado e a página precisar sair
 * para o Google (ex.: guardar a pontuação pendente). `signal` cancela a espera;
 * `onWaiting` avisa quando o popup já está no Google.
 */
export async function signInWithGoogle({ beforeRedirect, signal, onWaiting } = {}) {
  let popup = null;
  try {
    popup = window.open("", "octobeat_google_login", "width=500,height=700,popup=yes");
  } catch {
    popup = null;
  }
  try {
    if (popup) popup.document.title = "Entrando com Google…";
  } catch { /* página em branco de outra origem: ignora */ }
  try {
    const back = new URL(window.location.pathname, window.location.origin);
    back.searchParams.set(POPUP_PARAM, "1");
    const data = await authCall((sdk) => sdk.signIn.social({
      provider: "google",
      callbackURL: popup ? back.href : window.location.href,
      disableRedirect: true,
      fetchOptions: FETCH_OPTIONS,
    }), "Não foi possível entrar com Google. Tente novamente.");
    if (!data?.url) throw new Error("Não foi possível abrir a página do Google. Tente novamente.");
    if (!popup) {
      // Popup bloqueado: redirecionamento comum (pode falhar no Brave/Safari).
      beforeRedirect?.();
      window.location.assign(data.url);
      return { redirected: true };
    }
    popup.location.href = data.url;
    onWaiting?.();
    const verifier = await waitForPopup(signal);
    // O SDK lê o código da URL na próxima consulta de sessão e o remove depois.
    const url = new URL(window.location.href);
    url.searchParams.set(OAUTH_VERIFIER_PARAM, verifier);
    window.history.replaceState(window.history.state, "", url.href);
    await restore(true);
    return { redirected: false };
  } catch (error) {
    try { popup?.close(); } catch { /* já fechado */ }
    throw error;
  }
}

export function passwordProfileUsername(user) {
  const email = user?.email?.toLowerCase() ?? "";
  const suffix = `@${PASSWORD_ACCOUNT_DOMAIN}`;
  return email.endsWith(suffix) ? email.slice(0, -suffix.length).replaceAll(".", " ") : null;
}

export async function createProfile(username, displayName = null) {
  const version = revision;
  const profile = await profileRequest("create_my_profile", {
    p_username: checkedUsername(username), p_display_name: displayName,
  });
  if (version === revision && session) publish({ status: "ready", user: session.user, profile });
  return profile;
}

export async function updateProfile({ displayName, bio, visibility, avatarColor }) {
  const version = revision;
  const profile = await profileRequest("update_my_profile", {
    p_display_name: displayName, p_bio: bio, p_visibility: visibility, p_avatar_color: avatarColor,
  });
  if (version === revision && session) publish({ status: "ready", user: session.user, profile });
  return profile;
}

export async function signOut() {
  await authCall((sdk) => sdk.signOut({ fetchOptions: FETCH_OPTIONS }), "Não foi possível sair. Tente novamente.");
  startSessionChange();
  publish({ status: "guest" });
}
