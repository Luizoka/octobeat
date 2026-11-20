// `kind` identifica o tipo de julgamento para efeitos e estatísticas;
// `label` é o texto exibido.
export function judgeNote(delta) {
  const absolute = Math.abs(delta);
  if (absolute <= 0.055) return { kind: "perfect", label: "Perfeito", score: 1000 };
  if (absolute <= 0.115) return { kind: "good", label: "Bom", score: 650 };
  if (absolute <= 0.18) return delta > 0 ? { kind: "late", label: "Atrasado", score: 300 } : { kind: "early", label: "Cedo", score: 300 };
  return null;
}
