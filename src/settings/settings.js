// Preferências do jogador, salvas no navegador. Puro (o storage é injetado).

const STORAGE_KEY = "octobeat.settings";

export const PARTICLE_LEVELS = Object.freeze({ off: 0, low: 0.4, medium: 1, high: 1.8 });

export const DEFAULT_SETTINGS = Object.freeze({
  // Jogo
  leadInSeconds: 2,
  handMode: "both",
  // Áudio
  masterVolume: 0.7,
  hitSounds: true,
  hitSoundVolume: 0.5,
  // Efeitos
  particles: "medium",
  shake: true,
  shakeIntensity: 1,
  missFlash: true,
  feverEffects: true,
  judgementText: true,
  laneBeams: true,
  holdFire: true,
  reducedMotion: false,
});

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
};
const oneOf = (value, options, fallback) => (options.includes(value) ? value : fallback);
const bool = (value, fallback) => (typeof value === "boolean" ? value : fallback);

/** Garante tipos e limites válidos para qualquer objeto vindo do storage. */
export function sanitizeSettings(raw = {}) {
  const d = DEFAULT_SETTINGS;
  return {
    leadInSeconds: clamp(raw.leadInSeconds, 0, 5, d.leadInSeconds),
    handMode: oneOf(raw.handMode, ["both", "left", "right"], d.handMode),
    masterVolume: clamp(raw.masterVolume, 0, 1, d.masterVolume),
    hitSounds: bool(raw.hitSounds, d.hitSounds),
    hitSoundVolume: clamp(raw.hitSoundVolume, 0, 1, d.hitSoundVolume),
    particles: oneOf(raw.particles, Object.keys(PARTICLE_LEVELS), d.particles),
    shake: bool(raw.shake, d.shake),
    shakeIntensity: clamp(raw.shakeIntensity, 0.25, 2, d.shakeIntensity),
    missFlash: bool(raw.missFlash, d.missFlash),
    feverEffects: bool(raw.feverEffects, d.feverEffects),
    judgementText: bool(raw.judgementText, d.judgementText),
    laneBeams: bool(raw.laneBeams, d.laneBeams),
    holdFire: bool(raw.holdFire, d.holdFire),
    reducedMotion: bool(raw.reducedMotion, d.reducedMotion),
  };
}

/**
 * Carrega as preferências. Migra as chaves antigas (octobeat.leadInSeconds etc.)
 * e, na primeira vez, respeita "reduzir movimento" do sistema.
 */
export function loadSettings(storage, { prefersReducedMotion = false } = {}) {
  try {
    const saved = storage?.getItem(STORAGE_KEY);
    if (saved) return sanitizeSettings(JSON.parse(saved));
    const legacy = {
      leadInSeconds: storage?.getItem("octobeat.leadInSeconds") ?? undefined,
      handMode: storage?.getItem("octobeat.handMode") ?? undefined,
      masterVolume: storage?.getItem("octobeat.masterVolume") ?? undefined,
      reducedMotion: prefersReducedMotion,
    };
    return sanitizeSettings(legacy);
  } catch {
    return sanitizeSettings({ reducedMotion: prefersReducedMotion });
  }
}

export function saveSettings(storage, settings) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(sanitizeSettings(settings)));
  } catch { /* Sem storage: as preferências valem só nesta sessão. */ }
}

/** Efeitos realmente aplicados, considerando "reduzir movimento". */
export function effectiveEffects(settings) {
  const reduced = settings.reducedMotion;
  return {
    particleScale: PARTICLE_LEVELS[settings.particles] * (reduced ? 0.4 : 1),
    shake: settings.shake && !reduced ? settings.shakeIntensity : 0,
    missFlash: settings.missFlash,
    fever: settings.feverEffects,
    feverMotion: settings.feverEffects && !reduced,
    judgementText: settings.judgementText,
    laneBeams: settings.laneBeams,
    holdFire: settings.holdFire,
    hitSounds: settings.hitSounds ? settings.hitSoundVolume * settings.masterVolume : 0,
  };
}
