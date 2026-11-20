// Sons curtos de feedback (acerto, erro, marcos), sintetizados com Web Audio.
// Usa um AudioContext próprio para não interferir no player de MIDI.

let context = null;

function getContext() {
  if (typeof window === "undefined" || !window.AudioContext) return null;
  context ??= new AudioContext();
  if (context.state === "suspended") context.resume();
  return context;
}

function tone(ctx, { frequency, type = "sine", start = 0, duration = 0.08, volume = 0.1, slideTo }) {
  const time = ctx.currentTime + start;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, time);
  if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, time + duration);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(volume, time + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(time);
  oscillator.stop(time + duration + 0.02);
}

const SOUNDS = {
  perfect: (ctx, v) => { tone(ctx, { frequency: 1568, duration: 0.07, volume: 0.09 * v }); tone(ctx, { frequency: 2093, start: 0.02, duration: 0.07, volume: 0.05 * v }); },
  good: (ctx, v) => tone(ctx, { frequency: 1175, duration: 0.07, volume: 0.08 * v }),
  offset: (ctx, v) => tone(ctx, { frequency: 880, type: "triangle", duration: 0.07, volume: 0.08 * v }),
  miss: (ctx, v) => tone(ctx, { frequency: 180, type: "sawtooth", duration: 0.16, volume: 0.06 * v, slideTo: 70 }),
  holdComplete: (ctx, v) => { tone(ctx, { frequency: 1319, duration: 0.09, volume: 0.07 * v }); tone(ctx, { frequency: 1976, start: 0.06, duration: 0.12, volume: 0.06 * v }); },
  comboBreak: (ctx, v) => { tone(ctx, { frequency: 440, type: "square", duration: 0.12, volume: 0.04 * v, slideTo: 220 }); tone(ctx, { frequency: 330, type: "square", start: 0.1, duration: 0.18, volume: 0.04 * v, slideTo: 110 }); },
  milestone: (ctx, v) => [1047, 1319, 1568, 2093].forEach((frequency, index) => tone(ctx, { frequency, type: "triangle", start: index * 0.06, duration: 0.14, volume: 0.07 * v })),
};

/** Cria o AudioContext dos sons antes do jogo (criar no 1º acerto travava ~100 ms). */
export function warmupSfx() {
  getContext();
}

export function playSfx(name, volume) {
  if (!(volume > 0)) return;
  const ctx = getContext();
  if (!ctx) return;
  SOUNDS[name]?.(ctx, volume);
}
