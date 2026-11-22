const GUEST_KEY = "octobeat.leaderboard.guest";

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
