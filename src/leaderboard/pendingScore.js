const KEY = "octobeat.leaderboard.pending-score";

export function savePendingScore(score) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(score));
  } catch {
    throw new Error("Não foi possível guardar a pontuação para voltar do Google. Tente entrar com usuário e senha.");
  }
}

export function readPendingScore() {
  try {
    const score = JSON.parse(sessionStorage.getItem(KEY));
    if (score?.payload?.p_chart_id != null && typeof score.title === "string"
        && typeof score.difficulty === "string") {
      return score;
    }
  } catch {
    // O navegador pode bloquear o armazenamento da aba.
  }
  return null;
}

export function takePendingScore() {
  try {
    const score = readPendingScore();
    sessionStorage.removeItem(KEY);
    return score;
  } catch {
    return null;
  }
}
