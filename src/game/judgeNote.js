export function judgeNote(delta) {
  const absolute = Math.abs(delta);
  if (absolute <= 0.055) return { label: "Perfeito", score: 1000 };
  if (absolute <= 0.115) return { label: "Bom", score: 650 };
  if (absolute <= 0.18) return { label: delta > 0 ? "Atrasado" : "Cedo", score: 300 };
  return null;
}
