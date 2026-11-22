const SESSION_KEY = "octobeat.leaderboard.session";
const GUEST_KEY = "octobeat.leaderboard.guest";

export function loadSession() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (typeof session?.username === "string" && /^[0-9a-f]{64}$/.test(session.token)) {
      return session;
    }
  } catch {
    // O navegador pode bloquear o armazenamento local.
  }
  return null;
}

export function saveSession(session) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // A sessão continua disponível em memória.
  }
}

export function loadGuestPreference() {
  try {
    return localStorage.getItem(GUEST_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveGuestPreference() {
  try {
    localStorage.setItem(GUEST_KEY, "true");
  } catch {
    // A escolha continua válida no resultado atual.
  }
}
