import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { effectiveEffects } from "../settings/settings.js";
import { HIT_LINE_OFFSET, KEYS, laneCenterX } from "../game/keys.js";
import { comboMultiplier } from "../game/scoring.js";
import { playSfx, warmupSfx } from "./sfx.js";

const JUDGEMENT_TEXT = {
  perfect: "PERFEITO!", good: "BOM", early: "CEDO", late: "ATRASADO", miss: "ERRO", complete: "COMPLETO!", dropped: "SOLTOU",
};
const SPARK_INTERVAL = 0.045; // segundos entre faíscas de um hold
const FIRE_COLORS = ["#ffe08a", "#ffab40", "#ff6a2b", "#e8341c"];

/**
 * Concentra todos os efeitos de "game feel": partículas, tremor, flash,
 * textos de julgamento, faixas de combo e sons. Lê as preferências do jogador.
 */
export function useGameEffects(settings, trackRef) {
  const effects = useMemo(() => effectiveEffects(settings), [settings]);
  const effectsRef = useRef(effects);
  useEffect(() => { effectsRef.current = effects; }, [effects]);

  const particlesRef = useRef(null);
  const stageRef = useRef(null);
  const flashRef = useRef(null);
  const lastSparkRef = useRef(new Map());
  const popupIdRef = useRef(0);
  const [popup, setPopup] = useState(null);
  const [banner, setBanner] = useState(null);
  const bannerTimerRef = useRef(0);

  const geometry = useCallback((lane) => {
    const track = trackRef.current;
    if (!track) return null;
    return { x: laneCenterX(lane, track.clientWidth), y: track.clientHeight - HIT_LINE_OFFSET, width: track.clientWidth, height: track.clientHeight };
  }, [trackRef]);

  const showPopup = useCallback((kind, extra = "") => {
    if (!effectsRef.current.judgementText) return;
    popupIdRef.current += 1;
    setPopup({ id: popupIdRef.current, kind, text: JUDGEMENT_TEXT[kind] ?? kind, extra });
  }, []);

  const showBanner = useCallback((text, tone = "combo") => {
    window.clearTimeout(bannerTimerRef.current);
    setBanner({ id: Date.now(), text, tone });
    bannerTimerRef.current = window.setTimeout(() => setBanner(null), 1400);
  }, []);
  useEffect(() => () => window.clearTimeout(bannerTimerRef.current), []);

  const shake = useCallback((strength = 1) => {
    const amount = effectsRef.current.shake * strength;
    const stage = stageRef.current;
    if (!amount || !stage?.animate) return;
    const offset = (scale) => `translate(${((Math.random() - 0.5) * 2 * 9 * amount * scale).toFixed(1)}px, ${((Math.random() - 0.5) * 2 * 6 * amount * scale).toFixed(1)}px)`;
    stage.animate([
      { transform: "translate(0, 0)" },
      { transform: offset(1) },
      { transform: offset(0.75) },
      { transform: offset(0.5) },
      { transform: offset(0.25) },
      { transform: "translate(0, 0)" },
    ], { duration: 280, easing: "ease-out" });
  }, []);

  const flash = useCallback((strength = 1) => {
    if (!effectsRef.current.missFlash || !flashRef.current?.animate) return;
    flashRef.current.animate([{ opacity: 0.5 * strength }, { opacity: 0.001 }], { duration: 320, easing: "ease-out" });
  }, []);

  const particles = useCallback((lane, options, color = KEYS[lane]?.color) => {
    const scale = effectsRef.current.particleScale;
    const point = geometry(lane);
    if (!scale || !point || !particlesRef.current) return;
    particlesRef.current.burst(point.x, point.y, color, { ...options, count: (options.count ?? 14) * scale });
  }, [geometry]);

  const onHit = useCallback((lane, kind, combo) => {
    const fx = effectsRef.current;
    const point = geometry(lane);
    const hot = comboMultiplier(combo) > 1;
    if (kind === "perfect") {
      particles(lane, { count: hot ? 26 : 18, speed: 340, size: 3.2 });
      particles(lane, { count: 6, speed: 520, size: 2, shape: "spark", spread: 0.6, gravity: 200, life: 0.35 }, "#ffffff");
      if (fx.particleScale && point) particlesRef.current?.ring(point.x, point.y, KEYS[lane].color, { radius: 90 });
    } else if (kind === "good") {
      particles(lane, { count: 12, speed: 260 });
    } else {
      particles(lane, { count: 6, speed: 180, size: 2.5 });
    }
    playSfx(kind === "perfect" ? "perfect" : kind === "good" ? "good" : "offset", fx.hitSounds);
    showPopup(kind);
  }, [geometry, particles, showPopup]);

  const onMiss = useCallback((lanes, comboBefore) => {
    const fx = effectsRef.current;
    lanes.forEach((lane) => particles(lane, { count: 8, speed: 120, size: 2.5, gravity: 900, angle: Math.PI / 2, spread: Math.PI }, "#ff3b5c"));
    const bigBreak = comboBefore >= 25;
    shake(bigBreak ? 1.6 : 1);
    flash(bigBreak ? 1.4 : 1);
    playSfx(bigBreak ? "comboBreak" : "miss", fx.hitSounds);
    showPopup("miss");
    if (bigBreak) showBanner(`COMBO ${comboBefore} PERDIDO`, "break");
  }, [flash, particles, shake, showBanner, showPopup]);

  /** Tecla apertada sem nota: feedback mais leve que um erro de verdade. */
  const onStray = useCallback((lane, comboBefore) => {
    particles(lane, { count: 4, speed: 90, size: 2, gravity: 900, angle: Math.PI / 2, spread: Math.PI }, "#ff3b5c");
    shake(0.35);
    if (comboBefore >= 25) {
      playSfx("comboBreak", effectsRef.current.hitSounds);
      showBanner(`COMBO ${comboBefore} PERDIDO`, "break");
    }
    showPopup("miss");
  }, [particles, shake, showBanner, showPopup]);

  /**
   * Chamado a cada frame para cada hold sendo segurado.
   * Holds épicos pegam fogo: as chamas crescem com o tempo segurado (`heat`)
   * e a pista começa a tremer de leve.
   */
  const onHoldSpark = useCallback((lane, time, { heat = 0, epic = false } = {}) => {
    const fx = effectsRef.current;
    const onFire = epic && fx.holdFire;
    const interval = onFire ? SPARK_INTERVAL * (1 - heat * 0.45) : SPARK_INTERVAL;
    const last = lastSparkRef.current.get(lane) ?? -Infinity;
    if (time - last < interval) return;
    lastSparkRef.current.set(lane, time);

    if (!onFire) {
      particles(lane, { count: 4, speed: 300, size: 2, shape: "spark", spread: 0.9, gravity: 300, life: 0.4 });
      return;
    }
    // Chamas: sobem (gravidade negativa), maiores e mais numerosas com o calor.
    FIRE_COLORS.forEach((color, index) => {
      particles(lane, {
        count: 1.5 + heat * 3.5 - index * 0.4,
        speed: 140 + heat * 160,
        size: 3.5 + heat * 3.5 - index,
        gravity: -520 - heat * 300,
        drag: 3,
        spread: 0.7 + heat * 0.5,
        life: 0.35 + heat * 0.3,
      }, color);
    });
    particles(lane, { count: 2 + heat * 4, speed: 420 + heat * 260, size: 1.8, shape: "spark", spread: 0.8, gravity: 260, life: 0.45 }, "#fff3b0");
    // Tremor contínuo, bem leve, que cresce com o calor.
    const lastRumble = lastSparkRef.current.get(`rumble-${lane}`) ?? -Infinity;
    if (heat > 0.25 && time - lastRumble > 0.13) {
      lastSparkRef.current.set(`rumble-${lane}`, time);
      shake(0.12 + heat * 0.22);
    }
  }, [particles, shake]);

  const onHoldEnd = useCallback((lane, complete, comboBefore, { epic = false, heldSeconds = 0 } = {}) => {
    const fx = effectsRef.current;
    if (complete) {
      const point = geometry(lane);
      if (epic && fx.holdFire) {
        // Final explosivo: bola de fogo, duas ondas de choque e faixa.
        FIRE_COLORS.forEach((color) => particles(lane, { count: 22, speed: 520, size: 4.5, spread: Math.PI * 2, gravity: 300, life: 0.9, drag: 1.4 }, color));
        particles(lane, { count: 18, speed: 760, size: 2, shape: "spark", spread: Math.PI * 1.2, gravity: 500, life: 0.6 }, "#ffffff");
        if (fx.particleScale && point) {
          particlesRef.current?.ring(point.x, point.y, "#ffb347", { radius: 170, width: 7, life: 0.5 });
          particlesRef.current?.ring(point.x, point.y, "#ffffff", { radius: 110, width: 4, life: 0.35 });
        }
        shake(0.7);
        if (heldSeconds >= 2) showBanner("HOLD ÉPICO!", "fire");
      } else {
        particles(lane, { count: 22, speed: 380, size: 3 });
        if (fx.particleScale && point) particlesRef.current?.ring(point.x, point.y, "#ffffff", { radius: 110, width: 5 });
      }
      playSfx("holdComplete", fx.hitSounds);
      showPopup("complete");
    } else {
      particles(lane, { count: 8, speed: 100, size: 2.5, gravity: 900, angle: Math.PI / 2, spread: Math.PI }, "#8a93a8");
      shake(0.6);
      if (comboBefore >= 25) showBanner(`COMBO ${comboBefore} PERDIDO`, "break");
      playSfx("miss", fx.hitSounds);
      showPopup("dropped");
    }
  }, [geometry, particles, shake, showBanner, showPopup]);

  const onMilestone = useCallback((combo) => {
    const fx = effectsRef.current;
    showBanner(`COMBO ${combo}!`, "combo");
    playSfx("milestone", fx.hitSounds);
    const size = particlesRef.current?.size();
    if (!fx.particleScale || !size?.width) return;
    // Fogos espalhados pela parte de cima da pista.
    for (let index = 0; index < 5; index += 1) {
      const x = size.width * (0.15 + 0.175 * index);
      const y = size.height * (0.22 + Math.random() * 0.18);
      const color = KEYS[(index * 2 + combo) % 8].color;
      window.setTimeout(() => particlesRef.current?.burst(x, y, color, { count: 30 * fx.particleScale, speed: 320, gravity: 260, spread: Math.PI * 2, life: 0.9, drag: 1.2 }), index * 70);
    }
  }, [showBanner]);

  const onFever = useCallback(() => {
    if (!effectsRef.current.fever) return;
    showBanner("FEVER! ×3", "fever");
  }, [showBanner]);

  /** Chamado ao iniciar a partida (já com gesto do usuário): prepara o áudio dos sons. */
  const warmup = useCallback(() => {
    if (effectsRef.current.hitSounds > 0) warmupSfx();
  }, []);

  const reset = useCallback(() => {
    particlesRef.current?.clear();
    lastSparkRef.current.clear();
    setPopup(null);
    setBanner(null);
  }, []);

  // Efeitos nunca podem derrubar o jogo: um erro aqui é registrado e ignorado,
  // e o loop da partida continua.
  const handlers = useMemo(() => Object.fromEntries(Object.entries({
    onHit, onMiss, onStray, onHoldSpark, onHoldEnd, onMilestone, onFever, reset, warmup,
  }).map(([name, handler]) => [name, (...args) => {
    try {
      handler(...args);
    } catch (error) {
      console.error(`Efeito ${name} falhou:`, error);
    }
  }])), [onFever, onHit, onHoldEnd, onHoldSpark, onMilestone, onMiss, onStray, reset, warmup]);

  return { effects, particlesRef, stageRef, flashRef, popup, banner, ...handlers };
}
