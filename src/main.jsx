import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { ErrorBoundary } from "./ui/ErrorBoundary.jsx";
import "./styles.css";

// Safari 16.4+: o áudio do jogo toca mesmo com o iPhone no modo silencioso
// (por padrão o Web Audio segue a chave de silêncio, como um toque).
try {
  if (navigator.audioSession) navigator.audioSession.type = "playback";
} catch {
  // Sem suporte: segue o comportamento padrão do navegador.
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
