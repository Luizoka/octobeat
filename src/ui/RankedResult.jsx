import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getSnapshot, subscribe } from "../identity/auth.js";
import { findChartId, isLeaderboardEnabled, submitScore, TWO_HANDS_NOTICE } from "../leaderboard/client.js";
import { loadGuestPreference, saveGuestPreference } from "../leaderboard/guestPreference.js";
import { savePendingScore, takePendingScore } from "../leaderboard/pendingScore.js";
import { buildSubmitPayload, detectPlatform } from "../leaderboard/validation.js";

export function RankedResult({ chart, title, stats, eligible, onAuth }) {
  const identity = useSyncExternalStore(subscribe, getSnapshot);
  const enabled = isLeaderboardEnabled();
  const [chartId, setChartId] = useState(null);
  const [chartError, setChartError] = useState("");
  const [chartAttempt, setChartAttempt] = useState(0);
  const [sendAttempt, setSendAttempt] = useState(0);
  const [submission, setSubmission] = useState(null);
  const [guest, setGuest] = useState(loadGuestPreference);
  const lastAttempt = useRef(null);
  const userId = identity.status === "ready" ? identity.user.id : null;

  useEffect(() => {
    if (!enabled || !eligible) return;
    let current = true;
    findChartId(chart).then(
      (id) => { if (current) setChartId(id); },
      (reason) => { if (current) setChartError(reason.message); },
    );
    return () => { current = false; };
  }, [chartAttempt, chart, eligible, enabled]);

  useEffect(() => {
    if (!eligible || chartId === null || !userId) return;
    const previous = lastAttempt.current;
    if (previous?.attempt === sendAttempt && previous.userId === userId) return;
    if (previous?.status === "pending" || previous?.status === "saved") return;

    // O resultado é montado por partida. A ref cobre a repetição do efeito no StrictMode.
    const request = { attempt: sendAttempt, userId, status: "pending" };
    lastAttempt.current = request;
    submitScore(buildSubmitPayload(chartId, stats, detectPlatform())).then(
      (result) => {
        request.status = "saved";
        setSubmission({ result });
      },
      (reason) => {
        request.status = "failed";
        if (getSnapshot().status === "guest") lastAttempt.current = null;
        setSubmission({ error: reason.message, attempt: sendAttempt, userId });
      },
    );
  }, [chartId, eligible, sendAttempt, stats, userId]);

  function openAccount() {
    onAuth(() => {
      savePendingScore({
        payload: buildSubmitPayload(chartId, stats, detectPlatform()), title, difficulty: chart.difficulty,
      });
      return takePendingScore;
    });
  }

  let content;
  let compact = false;
  if (!eligible || !enabled) {
    content = <p role="status">{!eligible ? TWO_HANDS_NOTICE : "Ranking online indisponível."}</p>;
  } else if (chartId === null) {
    content = <>
      <p role="status">{chartError || "Verificando a versão do ranking…"}</p>
      {chartError && <button className="menu-button" type="button" onClick={() => {
        setChartError("");
        setChartAttempt((value) => value + 1);
      }}>Tentar de novo</button>}
    </>;
  } else if (submission?.result) {
    const { position, best_score: bestScore } = submission.result;
    content = <p role="status">
      <strong>{position}º lugar</strong> · melhor: {Number(bestScore).toLocaleString("pt-BR")}
      {Number(bestScore) === stats.score && <> · <strong>Novo recorde!</strong></>}
    </p>;
  } else if (submission && "result" in submission) {
    content = <p role="status">Pontuação salva.</p>;
  } else if (userId) {
    const error = submission?.userId === userId && submission?.attempt === sendAttempt ? submission.error : "";
    content = error ? <div className="ranked-actions">
      <p role="alert">{error}</p>
      <button className="menu-button" type="button" onClick={() => setSendAttempt((value) => value + 1)}>
        Tentar de novo
      </button>
    </div> : <p role="status">Enviando…</p>;
  } else if (identity.status === "loading") {
    content = <p role="status">Verificando sua conta…</p>;
  } else if (identity.status === "needsProfile") {
    content = <button className="menu-button" type="button" onClick={openAccount}>Criar perfil para enviar</button>;
  } else if (guest) {
    compact = true;
    content = <p>Jogando como convidado — pontuação não salva{" "}
      <button className="ranked-link" type="button" onClick={openAccount}>Entrar</button>
    </p>;
  } else {
    content = <>
      <p>Salvar esta pontuação no ranking?</p>
      <div className="ranked-actions">
        <button className="menu-button" type="button" onClick={openAccount}>Entrar / criar conta</button>
        <button className="menu-button" type="button" onClick={() => {
          saveGuestPreference();
          setGuest(true);
        }}>Continuar como convidado</button>
      </div>
    </>;
  }

  return (
    <div className={compact ? "ranked-result is-guest" : "ranked-result"} aria-label="Ranking da partida">
      {content}
    </div>
  );
}
