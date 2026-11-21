// Entrada unificada das lanes: teclado e toque (pointer events) usam o mesmo
// registro de "quem está segurando cada lane". Puro, sem DOM nem React.
//
// Cada fonte tem um id próprio ("key:3", "pointer:12"). Toda fonte que começa a
// segurar uma lane dispara um toque nela (como uma tecla). A lane só é solta
// quando a ÚLTIMA fonte que a segurava sai — assim um dedo que levanta não
// derruba o hold que outro dedo (ou a tecla física) ainda segura.

import { HAND_GAP } from "./keys.js";

export const LANE_COUNT = 8;

/**
 * Lane sob a posição horizontal `x` (px a partir da borda interna esquerda da
 * pista). A geometria é a mesma do CSS de `.track`: 4 colunas, vão de
 * `HAND_GAP` px, 4 colunas. Um toque no vão vai para a lane mais próxima e um
 * toque fora da pista devolve -1.
 */
export function laneFromX(x, trackWidth) {
  if (!(trackWidth > HAND_GAP) || !Number.isFinite(x) || x < 0 || x > trackWidth) return -1;
  const laneWidth = (trackWidth - HAND_GAP) / LANE_COUNT;
  const half = laneWidth * 4;
  if (x < half) return Math.min(3, Math.floor(x / laneWidth));
  if (x < half + HAND_GAP) return x < half + HAND_GAP / 2 ? 3 : 4;
  return Math.min(LANE_COUNT - 1, 4 + Math.floor((x - half - HAND_GAP) / laneWidth));
}

export function createLaneInput() {
  return new Map(); // fonte → lane
}

export function isLaneHeld(input, lane) {
  for (const held of input.values()) if (held === lane) return true;
  return false;
}

/** A fonte passa a segurar `lane`. Devolve a lane a soltar, se a fonte segurava outra (ou -1). */
export function holdLane(input, source, lane) {
  const previous = input.has(source) ? input.get(source) : -1;
  input.set(source, lane);
  if (previous === -1 || previous === lane) return -1;
  return isLaneHeld(input, previous) ? -1 : previous;
}

/** A fonte deixa de segurar. Devolve a lane que ficou livre (ou -1 se outra fonte ainda a segura). */
export function releaseSource(input, source) {
  if (!input.has(source)) return -1;
  const lane = input.get(source);
  input.delete(source);
  return isLaneHeld(input, lane) ? -1 : lane;
}

/** Solta todas as fontes de uma vez (perda de foco, giro da tela). Devolve as lanes liberadas. */
export function releaseAll(input) {
  const lanes = [...new Set(input.values())];
  input.clear();
  return lanes;
}

export const keySource = (lane) => `key:${lane}`;
export const pointerSource = (pointerId) => `pointer:${pointerId}`;
