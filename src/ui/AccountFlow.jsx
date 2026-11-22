import { memo, useEffect, useState, useSyncExternalStore } from "react";
import { getSnapshot, init, subscribe } from "../identity/auth.js";
import { submitScore } from "../leaderboard/client.js";
import { readPendingScore, takePendingScore } from "../leaderboard/pendingScore.js";
import { AuthDialog } from "./AuthDialog.jsx";
import { ProfilePanel } from "./ProfilePanel.jsx";
import { ProfileSetup } from "./ProfileSetup.jsx";
import { DIFFICULTIES } from "./SetupScreen.jsx";

export const AccountFlow = memo(function AccountFlow({
  screen, settingsOpen, authRequest, profileSlug, onCloseAuth, onCloseProfile, onScoreNotice,
}) {
  const identity = useSyncExternalStore(subscribe, getSnapshot);
  const [dismissedUserId, setDismissedUserId] = useState(null);
  const [hasPendingScore] = useState(() => Boolean(readPendingScore()));

  useEffect(() => {
    void init();
    function restoreOnline() {
      if (getSnapshot().status === "error") void init();
    }
    window.addEventListener("online", restoreOnline);
    return () => window.removeEventListener("online", restoreOnline);
  }, []);

  useEffect(() => {
    if (!hasPendingScore) return;
    if (identity.status === "guest") {
      takePendingScore();
      return;
    }
    if (identity.status !== "ready") return;
    // Retira da aba antes de enviar para que um novo efeito ou recarga não repita o envio.
    const pending = takePendingScore();
    if (!pending) return;
    const label = DIFFICULTIES.find(({ id }) => id === pending.difficulty)?.label;
    const chartName = label ? `${pending.title} (${label})` : pending.title;
    submitScore(pending.payload).then(
      (result) => onScoreNotice(result ? `${chartName} · ${result.position}º lugar no ranking.` : `${chartName} · Pontuação salva.`),
      (error) => onScoreNotice(`${chartName} · ${error.message}`),
    );
  }, [hasPendingScore, identity.status, onScoreNotice]);

  if (screen === "game" || settingsOpen) return null;
  if (profileSlug) {
    return <ProfilePanel key={profileSlug} slug={profileSlug} ownProfile={identity.profile} onClose={onCloseProfile} />;
  }
  if (authRequest && !authRequest.setup) {
    return <AuthDialog beforeGoogle={authRequest.beforeGoogle} onClose={onCloseAuth} onSuccess={() => {
      setDismissedUserId(null);
      onCloseAuth();
    }} restoreError={identity.status === "error" ? identity.error : ""} />;
  }
  if (identity.status === "needsProfile" && (authRequest?.setup || dismissedUserId !== identity.user.id)
      && (screen === "home" || screen === "results")) {
    return <ProfileSetup key={identity.user.id} user={identity.user} onSuccess={onCloseAuth} onClose={() => {
      setDismissedUserId(identity.user.id);
      onCloseAuth();
    }} />;
  }
  return null;
});
