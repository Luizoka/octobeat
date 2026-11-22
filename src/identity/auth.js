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

async function readSession() {
  // O adaptador vanilla injeta no campo session.token o JWT de set-auth-jwt.
  const data = await authCall((sdk) => sdk.getSession({
    fetchOptions: { ...FETCH_OPTIONS, headers: { "X-Force-Fetch": "true" } },
  }), "Não foi possível verificar sua sessão. Tente novamente.").catch((error) => {
    if (error.status === 401) return null;
    throw error;
  });
  if (!data?.user || !data.session) return null;
  const token = data.session.token;
  const expiry = expiresAt(token);
  if (expiry <= Date.now()) throw new Error("Não foi possível renovar sua sessão. Tente novamente.");
  return { user: data.user, token, expiry };
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

export async function signUpWithUsername(username, password) {
  const name = checkedUsername(username);
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  if (password.length > 128) throw new Error("A senha pode ter até 128 caracteres.");
  const availability = await usernameAvailable(name);
  if (!availability.available) throw new Error(availability.reason);
  await authCall((sdk) => sdk.signUp.email({
    email: passwordAccountEmail(name), password, name, fetchOptions: FETCH_OPTIONS,
  }), "Não foi possível criar a conta. Confira os dados e tente novamente.");
  const current = await restore(true);
  if (current.status === "needsProfile") await createProfile(name);
}

export async function signInWithUsername(username, password) {
  const name = normalizeUsername(username);
  if (!isValidUsername(name) || !password) throw new Error(INVALID_CREDENTIALS);
  await authCall((sdk) => sdk.signIn.email({
    email: passwordAccountEmail(name), password, fetchOptions: FETCH_OPTIONS,
  }), INVALID_CREDENTIALS);
  await restore(true);
}

export async function signInWithGoogle() {
  const data = await authCall((sdk) => sdk.signIn.social({
    provider: "google", callbackURL: window.location.href, fetchOptions: FETCH_OPTIONS,
  }), "Não foi possível entrar com Google. Tente novamente.");
  if (!data?.url) throw new Error("Não foi possível abrir a página do Google. Tente novamente.");
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
