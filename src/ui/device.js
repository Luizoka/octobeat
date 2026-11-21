import { useSyncExternalStore } from "react";

// Celular/tablet: o ponteiro principal é o dedo.
export const TOUCH_QUERY = "(pointer: coarse)";
// Celular em pé: a pista de 8 colunas fica estreita demais para jogar.
// Tablets em retrato (lado curto ≥ 600 px) continuam liberados.
export const MUST_ROTATE_QUERY = "(pointer: coarse) and (orientation: portrait) and (max-width: 599px)";

const noop = () => {};

/** Valor atual de uma media query, atualizado quando ela muda (giro, redimensionar). */
export function useMediaQuery(query) {
  return useSyncExternalStore(
    (onChange) => {
      const list = typeof window !== "undefined" ? window.matchMedia?.(query) : null;
      if (!list) return noop;
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => typeof window !== "undefined" && Boolean(window.matchMedia?.(query).matches),
    () => false,
  );
}

export function fullscreenSupported() {
  if (typeof document === "undefined") return false;
  return Boolean(document.fullscreenEnabled || document.webkitFullscreenEnabled);
}

export function isFullscreen() {
  if (typeof document === "undefined") return false;
  return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
}

export function onFullscreenChange(listener) {
  document.addEventListener("fullscreenchange", listener);
  document.addEventListener("webkitfullscreenchange", listener);
  return () => {
    document.removeEventListener("fullscreenchange", listener);
    document.removeEventListener("webkitfullscreenchange", listener);
  };
}

/**
 * Tenta tela cheia + bloquear em paisagem. Precisa ser chamada dentro de um
 * toque/clique do usuário (o pedido de tela cheia sai antes do primeiro await).
 *
 * Nem todo navegador deixa: o iPhone (Safari) não tem tela cheia para páginas
 * nem `screen.orientation.lock`, e o Chrome só bloqueia a orientação em tela
 * cheia. Nada aqui lança erro; o resultado diz o que funcionou e o jogo cai no
 * aviso "Gire o celular" quando não der.
 */
export async function enterLandscapeFullscreen() {
  const root = document.documentElement;
  if (!isFullscreen()) {
    const request = root.requestFullscreen ?? root.webkitRequestFullscreen;
    try {
      if (request) await request.call(root, { navigationUI: "hide" });
    } catch {
      // Recusado (sem gesto, iframe, configuração do usuário): segue sem tela cheia.
    }
  }
  let locked = false;
  try {
    if (isFullscreen() && screen.orientation?.lock) {
      await screen.orientation.lock("landscape");
      locked = true;
    }
  } catch {
    // Sem suporte ou recusado: o aviso para girar o aparelho cobre esse caso.
  }
  return { fullscreen: isFullscreen(), locked };
}
