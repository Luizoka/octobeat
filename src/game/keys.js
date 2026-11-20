export const KEYS = [
  { label: "A", values: ["a"], color: "#ff6860" },
  { label: "S", values: ["s"], color: "#ffd166" },
  { label: "D", values: ["d"], color: "#7fd45a" },
  { label: "F", values: ["f"], color: "#27d9c4" },
  { label: "J", values: ["j"], color: "#69a7ff" },
  { label: "K", values: ["k"], color: "#a978ff" },
  { label: "L", values: ["l"], color: "#ff8c42" },
  { label: "Ç", values: ["ç", ";"], color: "#f45dc8" },
];

export function keyToLane(event) {
  const key = event.key.toLowerCase();
  return KEYS.findIndex((item) => item.values.includes(key));
}

// Geometria da pista (precisa bater com o CSS de .track e .note).
export const HAND_GAP = 14; // px entre as duas mãos
export const HIT_LINE_OFFSET = 76; // px da base da pista até a linha de acerto

export function laneCenterX(lane, trackWidth) {
  const laneWidth = (trackWidth - HAND_GAP) / 8;
  return laneWidth * (lane + 0.5) + (lane >= 4 ? HAND_GAP : 0);
}
