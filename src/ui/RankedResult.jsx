import { useEffect, useRef, useState } from "react";
import { findChartId, isLeaderboardEnabled, submitScore, TWO_HANDS_NOTICE } from "../leaderboard/client.js";
import { loadGuestPreference, saveGuestPreference } from "../leaderboard/session.js";
import { buildSubmitPayload, detectPlatform } from "../leaderboard/validation.js";

export function RankedResult({ chart, stats, eligible, session, onSessionExpired, onAuth }) {
  const enabled = isLeaderboardEnabled();
  const [chartId, setChartId] = useState(null);
  const [chartError, setChartError] = useState("");
  const [chartAttempt, setChartAttempt] = useState(0);
  const [sendAttempt, setSendAttempt] = useState(0);
  const [submission, setSubmission] = useState(null);
  const [guest, setGuest] = useState(loadGuestPreference);
  const lastAttempt = useRef(null);
  const token = session?.token;

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
    if (!eligible || chartId === null || !token) return;
    const previous = lastAttempt.current;
    if (previous?.attempt === sendAttempt && previous.token === token) return;
    if (previous?.status === "pending" || previous?.status === "saved") return;

    // O resultado é montado por partida. A ref cobre a repetição do efeito no StrictMode.
    const request = { attempt: sendAttempt, token, status: "pending" };
    lastAttempt.current = request;
    submitScore(buildSubmitPayload(token, chartId, stats, detectPlatform())).then(
      (result) => {
        request.status = "saved";
        setSubmission({ result });
      },
      (reason) => {
        request.status = "failed";
        const expired = reason.message.startsWith("Sessão inválida");
        setSubmission({ error: reason.message, expired, attempt: sendAttempt, token });
        if (expired) onSessionExpired(token);
      },
    );
  }, [chartId, eligible, onSessionExpired, sendAttempt, stats, token]);

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
  } else if (session) {
    const error = submission?.token === token && submission?.attempt === sendAttempt ? submission.error : "";
    content = error ? <div className="ranked-actions">
      <p role="alert">{error}</p>
      <button className="menu-button" type="button" onClick={() => setSendAttempt((value) => value + 1)}>
        Tentar de novo
      </button>
    </div> : <p role="status">Enviando…</p>;
  } else if (guest) {
    compact = true;
    content = <p>Jogando como convidado — pontuação não salva{" "}
      <button className="ranked-link" type="button" onClick={onAuth}>Entrar</button>
    </p>;
  } else {
    content = <>
      <p>Salvar esta pontuação no ranking?</p>
      <div className="ranked-actions">
        <button className="menu-button" type="button" onClick={onAuth}>Entrar / criar conta</button>
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
      {!session && submission?.expired && <p role="alert">{submission.error}</p>}
    </div>
  );
}
