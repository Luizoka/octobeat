import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { importSong } from "./music/importSong.js";
import { generateChart } from "./chart/generateChart.js";
import { normalizeNotes } from "./game/normalizeNotes.js";
import { judgeNote } from "./game/judgeNote.js";
import { MidiPlayer } from "./music/midi/MidiPlayer.js";
import { isPianoFamily } from "./music/midi/classifyTrack.js";
import { analyzeSong } from "./music-analysis/analyzeSong.js";
import { selectGameplayTracks } from "./music-analysis/selectGameplayTracks.js";
import { adaptNotesForHands } from "./game/adaptNotesForHands.js";
import { holdEnd, holdHeat, holdPositions, isEpicHold, isHold, resolveHold } from "./game/holdNotes.js";
import { HIT_LINE_OFFSET, keyToLane } from "./game/keys.js";
import { createLaneInput, holdLane, isLaneHeld, keySource, laneFromX, pointerSource, releaseAll, releaseSource } from "./game/laneInput.js";
import { MUST_ROTATE_QUERY, TOUCH_QUERY, enterLandscapeFullscreen, fullscreenSupported, isFullscreen, onFullscreenChange, useMediaQuery } from "./ui/device.js";
import { applyHit, applyHoldResults, applyMiss, createStats, crossedMilestone, isFever } from "./game/scoring.js";
import { loadSettings, sanitizeSettings, saveSettings } from "./settings/settings.js";
import { useGameEffects } from "./effects/useGameEffects.js";
import { HomeScreen } from "./ui/HomeScreen.jsx";
import { RankingScreen } from "./ui/RankingScreen.jsx";
import { RankedResult } from "./ui/RankedResult.jsx";
import { AccountFlow } from "./ui/AccountFlow.jsx";
import { DIFFICULTIES, SetupScreen } from "./ui/SetupScreen.jsx";
import { GameScreen } from "./ui/GameScreen.jsx";
import { ResultsScreen } from "./ui/ResultsScreen.jsx";
import { SettingsPanel } from "./ui/SettingsPanel.jsx";
import { RotateOverlay } from "./ui/RotateOverlay.jsx";
import { getSnapshot } from "./identity/auth.js";
import { loadRankedChart } from "./leaderboard/client.js";
import { loadCatalogFile } from "./songs/catalog.js";
const FALL_DURATION = 1.55; // segundos que uma nota leva do topo até a linha
const MISS_WINDOW = 0.22; // segundos depois da linha em que a nota vira erro
const RESULTS_DELAY = 1200; // ms entre a última nota e a tela de resultado
const HIT_LINGER = 0.3; // segundos que uma nota acertada fica na tela (animação de "pop")
const OFFSCREEN_Y = -200; // posição das notas que ainda não entraram na tela

const BASE_CHART = [
  { time: 1.0, key: 0 }, { time: 1.25, key: 1 }, { time: 1.5, key: 2 }, { time: 1.75, key: 3 },
  { time: 2.0, key: 4 }, { time: 2.25, key: 5 }, { time: 2.5, key: 6 }, { time: 2.75, key: 7 },
  { time: 3.2, key: 3, duration: 0.7 }, { time: 3.45, key: 4 }, { time: 3.7, key: 2 }, { time: 3.95, key: 5 },
  { time: 4.35, key: 1 }, { time: 4.6, key: 6 }, { time: 4.85, key: 0 }, { time: 5.1, key: 7 },
  { time: 5.55, key: 0, duration: 1.1 }, { time: 5.8, key: 2 }, { time: 6.05, key: 4 }, { time: 6.3, key: 6 },
  { time: 6.75, key: 1 }, { time: 7.0, key: 3 }, { time: 7.25, key: 5 }, { time: 7.5, key: 7 },
  { time: 8.0, key: 0 }, { time: 8.0, key: 4 }, { time: 8.5, key: 1 }, { time: 8.5, key: 5 },
  { time: 9.0, key: 2 }, { time: 9.0, key: 6 }, { time: 9.5, key: 3 }, { time: 9.5, key: 7 },
  { time: 10.05, key: 7 }, { time: 10.3, key: 6 }, { time: 10.55, key: 5 }, { time: 10.8, key: 4 },
  { time: 11.05, key: 3 }, { time: 11.3, key: 2 }, { time: 11.55, key: 1 }, { time: 11.8, key: 0 },
  { time: 12.35, key: 0, duration: 1.2 }, { time: 12.6, key: 3 }, { time: 12.85, key: 4 }, { time: 13.1, key: 7 },
  { time: 13.55, key: 2 }, { time: 13.8, key: 5 }, { time: 14.05, key: 1 }, { time: 14.3, key: 6 },
  { time: 14.85, key: 0 }, { time: 15.1, key: 2 }, { time: 15.35, key: 5 }, { time: 15.6, key: 7 },
  { time: 16.15, key: 3 }, { time: 16.4, key: 4 }, { time: 16.9, key: 0, duration: 1.4 }, { time: 16.9, key: 7, duration: 1.4 },
];

function nowSeconds() {
  return performance.now() / 1000;
}

function safeStorage() {
  try { return window.localStorage; } catch { return null; }
}

function createDemoChart(difficulty) {
  if (difficulty === "easy") return BASE_CHART.filter((_, index) => index % 2 === 0).map((note) => ({ ...note }));
  if (difficulty === "hard") {
    const extra = BASE_CHART
      .filter((note, index) => index % 4 === 1 && note.time > 2)
      .map((note) => ({ time: Number((note.time + 0.125).toFixed(3)), key: (note.key + 2) % 8 }));
    return [...BASE_CHART, ...extra].sort((a, b) => a.time - b.time).map((note) => ({ ...note }));
  }
  return BASE_CHART.map((note) => ({ ...note }));
}

function makePlayableNotes(chart) {
  return normalizeNotes(chart).map((note, id) => ({ ...note, id, y: -40, tailY: -40, hit: false, missed: false, holdState: null }));
}

// Resolvida = perdida, acertada (nota comum) ou hold completado/derrubado.
function isResolved(note) {
  return note.missed || (note.hit && note.holdState !== "holding");
}

function lastNoteEnd(notes) {
  return notes.reduce((last, note) => Math.max(last, holdEnd(note)), 0);
}

function summarizeChart(chart) {
  const count = chart.length;
  const span = count > 1 ? chart.at(-1).time - chart[0].time : 0;
  return { chart, count, holds: chart.filter(isHold).length, nps: span > 0 ? count / span : 0 };
}

function scheduleTone(context, nodes, start, duration, frequency, type, gainValue) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
  nodes.current.push(oscillator);
}

function scheduleNoise(context, nodes, start, volume = 1) {
  const buffer = context.createBuffer(1, context.sampleRate * 0.05, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const noise = context.createBufferSource();
  const gain = context.createGain();
  noise.buffer = buffer;
  gain.gain.setValueAtTime(0.11 * volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.045);
  noise.connect(gain).connect(context.destination);
  noise.start(start);
  nodes.current.push(noise);
}

export default function App() {
  // ── Navegação e preferências ─────────────────────────────────────────────
  const [screen, setScreen] = useState("home"); // home | setup | ranking | game | results
  const [rankedChart, setRankedChart] = useState(null);
  // Música do catálogo aberta pela tela inicial: fases congeladas por dificuldade
  // ({ easy, normal, hard }) e a que está em jogo agora (vale para o ranking).
  const [catalogFrozen, setCatalogFrozen] = useState(null);
  const [catalogRanked, setCatalogRanked] = useState(null);
  const catalogSlugRef = useRef(null);
  const [authRequest, setAuthRequest] = useState(null);
  const [profileSlug, setProfileSlug] = useState(() => new URLSearchParams(window.location.search).get("perfil"));
  const [scoreNotice, setScoreNotice] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [settings, setSettings] = useState(() => loadSettings(safeStorage(), {
    prefersReducedMotion: typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  }));
  const closeAuth = useCallback(() => setAuthRequest(null), []);
  const openPrivacy = useCallback(() => setPrivacyOpen(true), []);
  const closePrivacy = useCallback(() => setPrivacyOpen(false), []);
  const closeProfile = useCallback(() => {
    setProfileSlug(null);
    const url = new URL(window.location.href);
    if (url.searchParams.has("perfil")) {
      url.searchParams.delete("perfil");
      window.history.replaceState(null, "", url);
    }
  }, []);
  const updateSettings = useCallback((patch) => setSettings((current) => sanitizeSettings({ ...current, ...patch })), []);

  // ── Fase ────────────────────────────────────────────────────────────────
  const [difficulty, setDifficulty] = useState("normal");
  const [phaseSource, setPhaseSource] = useState("demo"); // demo | song
  const [phaseNotes, setPhaseNotes] = useState([]);

  // ── Música importada ────────────────────────────────────────────────────
  const [importedSong, setImportedSong] = useState(null);
  const [selectedTrackIds, setSelectedTrackIds] = useState([]);
  const [homeStatus, setHomeStatus] = useState("");
  const [setupStatus, setSetupStatus] = useState("");
  const [songLoading, setSongLoading] = useState(false);
  const [audioTrackIds, setAudioTrackIds] = useState([]);
  const [audioMode, setAudioMode] = useState("piano-focus");
  const [midiAudioStatus, setMidiAudioStatus] = useState("");
  const [midiPreviewPlaying, setMidiPreviewPlaying] = useState(false);
  const [gameplaySourceMode, setGameplaySourceMode] = useState("essence");
  const [midiBusy, setMidiBusy] = useState(false);

  // ── Partida ─────────────────────────────────────────────────────────────
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [finished, setFinished] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [notes, setNotes] = useState([]);
  const [pressedLanes, setPressedLanes] = useState([]);
  const [stats, setStats] = useState(createStats);
  // Celular em pé (ou partida interrompida antes de começar): a fase espera um
  // toque em "Começar" — o toque também libera o áudio no navegador móvel.
  const [awaitingStart, setAwaitingStart] = useState(false);

  // ── Dispositivo ─────────────────────────────────────────────────────────
  const touchDevice = useMediaQuery(TOUCH_QUERY);
  const mustRotate = useMediaQuery(MUST_ROTATE_QUERY);
  const [fullscreenActive, setFullscreenActive] = useState(isFullscreen);
  // Nos menus, o jogador pode dispensar o aviso de girar (vale até recarregar).
  const [portraitAllowed, setPortraitAllowed] = useState(false);
  const canFullscreen = touchDevice && fullscreenSupported();

  const trackRef = useRef(null);
  const animationRef = useRef(0);
  const startAtRef = useRef(0);
  const playingRef = useRef(false);
  const notesRef = useRef(notes);
  const statsRef = useRef(stats);
  const endTimeRef = useRef(0);
  const pausedAtRef = useRef(0);
  const laneInputRef = useRef(createLaneInput()); // teclas e dedos segurando cada lane
  const startingRef = useRef(null); // "start" | "resume" enquanto carrega/conta antes de jogar
  const mustRotateRef = useRef(mustRotate);
  const screenRef = useRef(screen);
  const pausedRef = useRef(paused);
  const audioContextRef = useRef(null);
  const audioNodesRef = useRef([]);
  const midiPlayerRef = useRef(null);
  const chordInputRef = useRef(null);
  const midiBusyRef = useRef(false);
  const midiOperationRef = useRef(0);
  const midiPausedPositionRef = useRef(0);
  const startSequenceRef = useRef(0);
  const phaseSourceRef = useRef("demo");
  const playedHandModeRef = useRef("both");
  const finishTimerRef = useRef(0);
  const progressRef = useRef(-1);

  const fx = useGameEffects(settings, trackRef, { touch: touchDevice });
  const { onHit, onMiss, onStray, onHoldSpark, onHoldEnd, onMilestone, onFever, reset: resetEffects, warmup: warmupEffects, stageRef } = fx;
  const songAnalysis = useMemo(() => importedSong ? analyzeSong(importedSong) : null, [importedSong]);
  const holdingLanes = useMemo(() => new Set(notes.filter((note) => note.holdState === "holding").map((note) => note.key)), [notes]);
  const fireLanes = useMemo(() => (
    settings.holdFire ? new Set(notes.filter((note) => note.holdState === "holding" && isEpicHold(note)).map((note) => note.key)) : new Set()
  ), [notes, settings.holdFire]);

  useEffect(() => { screenRef.current = screen; }, [screen]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { mustRotateRef.current = mustRotate; }, [mustRotate]);
  useEffect(() => { saveSettings(safeStorage(), settings); }, [settings]);
  useEffect(() => { midiPlayerRef.current?.setMasterVolume(settings.masterVolume); }, [settings.masterVolume]);

  const commitStats = useCallback((next) => {
    statsRef.current = next;
    setStats(next);
  }, []);

  const commitNotes = useCallback((next) => {
    notesRef.current = next;
    setNotes(next);
  }, []);

  const gameTime = useCallback(() => (
    phaseSourceRef.current === "song" && midiPlayerRef.current?.playing
      ? midiPlayerRef.current.currentTime()
      : nowSeconds() - startAtRef.current
  ), []);

  // ── Áudio ───────────────────────────────────────────────────────────────
  const stopDemoSong = useCallback(() => {
    audioNodesRef.current.forEach((node) => {
      try { node.stop(); } catch { node.disconnect?.(); }
    });
    audioNodesRef.current = [];
  }, []);

  const stopMidiAudio = useCallback(() => {
    // Para o som na hora (inclusive notas já agendadas), mas mantém os
    // instrumentos carregados: pausar, retomar e reiniciar não recarregam o
    // SoundFont. O player só é descartado quando a música muda.
    midiOperationRef.current += 1;
    midiBusyRef.current = false;
    setMidiBusy(false);
    midiPlayerRef.current?.halt();
  }, []);

  const waitForCountdown = useCallback(async (sequence) => {
    const seconds = settings.leadInSeconds;
    if (seconds <= 0) return sequence === startSequenceRef.current;
    for (let remaining = seconds; remaining > 0; remaining -= 1) {
      if (sequence !== startSequenceRef.current) return false;
      setCountdown(remaining);
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
    }
    if (sequence !== startSequenceRef.current) return false;
    setCountdown("VAI!");
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    if (sequence !== startSequenceRef.current) return false;
    setCountdown(null);
    return true;
  }, [settings.leadInSeconds]);

  const playMidi = useCallback(async (position = 0, beforePlay, {
    song = importedSong, trackIds = audioTrackIds, mode = audioMode,
  } = {}) => {
    if (midiBusyRef.current) return false;
    if (song?.source?.format !== "MIDI") throw new Error("A reprodução integrada está disponível para MIDI.");
    const operation = ++midiOperationRef.current;
    midiBusyRef.current = true;
    setMidiBusy(true);
    if (!midiPlayerRef.current || midiPlayerRef.current.song !== song) {
      midiPlayerRef.current?.dispose();
      midiPlayerRef.current = new MidiPlayer(song, { onStatus: setMidiAudioStatus });
    }
    const player = midiPlayerRef.current;
    try {
      await player.prepare(trackIds, mode);
      if (operation !== midiOperationRef.current || player !== midiPlayerRef.current) return false;
      if (beforePlay && !await beforePlay()) return false;
      // Interrompido durante a contagem (pausa, giro, troca de app).
      if (operation !== midiOperationRef.current) return false;
      player.setMasterVolume(settings.masterVolume);
      player.setMix(mode);
      await player.play(position);
      if (operation !== midiOperationRef.current) {
        player.halt();
        return false;
      }
      return true;
    } finally {
      if (operation === midiOperationRef.current) {
        midiBusyRef.current = false;
        setMidiBusy(false);
      }
    }
  }, [audioMode, audioTrackIds, importedSong, settings.masterVolume]);

  /** Sintetizador da fase demo (e de MusicXML). Pode começar do meio (`from`). */
  const startDemoSong = useCallback((chart, from = 0) => {
    if (!audioContextRef.current) audioContextRef.current = new AudioContext();
    const context = audioContextRef.current;
    context.resume?.();
    stopDemoSong();
    const offset = 0.08;
    const start = context.currentTime + offset;
    const scale = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
    const volume = settings.masterVolume;
    startAtRef.current = nowSeconds() + offset - from;
    for (let beat = 0; beat < 36; beat += 1) {
      const at = beat * 0.5 - from;
      if (at < 0) continue;
      scheduleTone(context, audioNodesRef, start + at, 0.08, beat % 4 === 0 ? 98 : 130.81, "triangle", 0.08 * volume);
      if (beat % 2 === 1) scheduleNoise(context, audioNodesRef, start + at + 0.02, volume);
    }
    chart.forEach((note, index) => {
      if (note.time < from) return;
      const frequency = scale[note.key] * (index % 3 === 0 ? 0.5 : 1);
      scheduleTone(context, audioNodesRef, start + note.time - from, Math.max(0.11, note.duration ?? 0), frequency, "square", 0.045 * volume);
    });
  }, [settings.masterVolume, stopDemoSong]);

  /**
   * Cria/retoma o AudioContext do sintetizador ainda dentro do toque/clique.
   * No Safari (iOS) um contexto criado depois da contagem nasceria mudo.
   */
  const unlockDemoAudio = useCallback(() => {
    if (typeof AudioContext === "undefined") return;
    if (!audioContextRef.current) audioContextRef.current = new AudioContext();
    audioContextRef.current.resume?.().catch?.(() => {});
  }, []);

  // ── Motor do jogo ───────────────────────────────────────────────────────
  const buildNotes = useCallback((chart) => {
    const next = makePlayableNotes(adaptNotesForHands(chart, settings.handMode));
    endTimeRef.current = lastNoteEnd(next);
    commitNotes(next);
    return next;
  }, [commitNotes, settings.handMode]);

  /** Para tudo e volta ao estado inicial de uma partida. */
  const resetEngine = useCallback(() => {
    startSequenceRef.current += 1;
    startingRef.current = null;
    progressRef.current = -1;
    window.clearTimeout(finishTimerRef.current);
    cancelAnimationFrame(animationRef.current);
    stopDemoSong();
    stopMidiAudio();
    midiPausedPositionRef.current = 0;
    setMidiPreviewPlaying(false);
    setAwaitingStart(false);
    setCountdown(null);
    setPlaying(false);
    playingRef.current = false;
    setPaused(false);
    setFinished(false);
    commitStats(createStats());
    commitNotes([]);
    resetEffects();
  }, [commitNotes, commitStats, resetEffects, stopDemoSong, stopMidiAudio]);

  const finishGame = useCallback(() => {
    stopDemoSong();
    stopMidiAudio();
    setPlaying(false);
    playingRef.current = false;
    setFinished(true);
    finishTimerRef.current = window.setTimeout(() => setScreen("results"), RESULTS_DELAY);
  }, [stopDemoSong, stopMidiAudio]);

  const tick = useCallback(() => {
    if (!playingRef.current) return;
    const hitY = (trackRef.current?.clientHeight ?? 600) - HIT_LINE_OFFSET;
    const time = gameTime();
    const missedLanes = [];
    const holdResults = [];
    const holdingNow = [];

    // Calculado fora de um updater do React: efeitos colaterais (contagem de
    // erros) não podem rodar duas vezes no StrictMode.
    // Desempenho: só as notas perto da tela mudam a cada quadro. Notas que já
    // saíram de cena viram `gone` e deixam de ser desenhadas; notas ainda longe
    // mantêm o mesmo objeto (sem alocar nem re-renderizar nada).
    const bottomY = hitY + HIT_LINE_OFFSET + 40;
    const next = notesRef.current.map((note) => {
      if (note.gone) return note;
      const hold = isHold(note);
      if (note.time - time > FALL_DURATION + 0.3) return note.y === OFFSCREEN_Y ? note : { ...note, y: OFFSCREEN_Y, tailY: OFFSCREEN_Y };
      if (note.missed && !hold) return { ...note, gone: true };
      if (note.hit && !hold) return time - note.time > HIT_LINGER ? { ...note, gone: true } : note;
      if (note.holdState === "complete") return { ...note, gone: true };

      if (hold) {
        if (note.holdState === "holding" && time >= holdEnd(note)) {
          const result = resolveHold(note, time);
          holdResults.push({ lane: note.key, result, epic: isEpicHold(note) });
          return { ...note, y: hitY, tailY: hitY, holdState: result.holdState, heat: 0 };
        }
        const heat = holdHeat(note, time);
        if (note.holdState === "holding") holdingNow.push({ lane: note.key, heat, epic: isEpicHold(note) });
        const { headY, tailY } = holdPositions(note, time, { hitY, fallDuration: FALL_DURATION });
        // Hold perdido/solto continua caindo até a cauda sair por baixo.
        if ((note.missed || note.holdState === "dropped") && tailY > bottomY) return { ...note, gone: true };
        if (!note.hit && !note.missed && time - note.time > MISS_WINDOW) {
          missedLanes.push(note.key);
          return { ...note, y: headY, tailY, missed: true };
        }
        return { ...note, y: headY, tailY, heat };
      }

      const y = (1 - (note.time - time) / FALL_DURATION) * hitY;
      if (time - note.time > MISS_WINDOW) {
        missedLanes.push(note.key);
        return { ...note, y, missed: true };
      }
      return { ...note, y };
    });
    commitNotes(next);

    holdingNow.forEach(({ lane, heat, epic }) => onHoldSpark(lane, time, { heat, epic }));
    if (missedLanes.length) {
      const before = statsRef.current;
      commitStats(applyMiss(before, missedLanes.length));
      onMiss(missedLanes, before.combo);
    }
    if (holdResults.length) {
      const before = statsRef.current;
      commitStats(applyHoldResults(before, holdResults.map((item) => item.result)));
      holdResults.forEach(({ lane, result, epic }) => onHoldEnd(lane, result.holdState === "complete", before.combo, { epic, heldSeconds: result.heldSeconds }));
    }

    const end = endTimeRef.current;
    // Barra de progresso: transform direto nas barras, e só quando muda 0,1%.
    // (Uma variável CSS no contêiner do jogo recalculava o estilo de todos os
    // elementos da pista a cada quadro — o maior custo no celular.)
    const progress = end > 0 ? Math.round(Math.min(1, Math.max(0, time / end)) * 1000) / 1000 : 0;
    if (progress !== progressRef.current) {
      progressRef.current = progress;
      stageRef.current?.querySelectorAll(".js-progress").forEach((bar) => { bar.style.transform = `scaleX(${progress})`; });
    }

    if (next.length && next.every(isResolved) && time > end + 0.5) {
      finishGame();
      return;
    }
    animationRef.current = requestAnimationFrame(tick);
  }, [commitNotes, commitStats, finishGame, gameTime, onHoldEnd, onHoldSpark, onMiss, stageRef]);

  const startGame = useCallback(async (chart, source, { ranked = false, midi } = {}) => {
    if (midiBusyRef.current) return;
    resetEngine();
    warmupEffects();
    phaseSourceRef.current = source;
    playedHandModeRef.current = settings.handMode;
    const sequence = startSequenceRef.current;
    const nextNotes = buildNotes(chart);
    if (!nextNotes.length) {
      setSetupStatus("Esta fase não tem notas.");
      setScreen(ranked ? "ranking" : "setup");
      return;
    }
    startingRef.current = "start";

    // O AudioContext é criado/retomado antes do 1º await: ainda dentro do toque.
    if (source === "song" && (midi?.song ?? importedSong)?.source?.format === "MIDI") {
      try {
        const started = await playMidi(0, () => waitForCountdown(sequence), midi);
        if (!started) return;
      } catch (error) {
        // Cancelado de propósito (giro, troca de app): o carregamento falha, mas não é erro.
        if (sequence !== startSequenceRef.current) return;
        startingRef.current = null;
        setSetupStatus(error instanceof Error ? error.message : "Não foi possível carregar o SoundFont.");
        setScreen(ranked ? "ranking" : "setup");
        return;
      }
    } else {
      unlockDemoAudio();
      if (!await waitForCountdown(sequence)) return;
      startDemoSong(nextNotes, 0);
    }
    // Interrompida (giro, troca de app) entre a contagem e o play.
    if (sequence !== startSequenceRef.current) return;
    startingRef.current = null;
    setPlaying(true);
    playingRef.current = true;
    animationRef.current = requestAnimationFrame(tick);
  }, [buildNotes, importedSong, playMidi, resetEngine, settings.handMode, startDemoSong, tick, unlockDemoAudio, waitForCountdown, warmupEffects]);

  /** Resolve os holds sendo segurados (por soltar a tecla ou ao retomar a pausa). */
  const resolveHolding = useCallback((shouldRelease, time) => {
    const results = [];
    const next = notesRef.current.map((note) => {
      if (note.holdState !== "holding" || !shouldRelease(note.key)) return note;
      const result = resolveHold(note, time);
      results.push({ lane: note.key, result, epic: isEpicHold(note) });
      return { ...note, holdState: result.holdState, heat: 0 };
    });
    if (!results.length) return;
    commitNotes(next);
    const before = statsRef.current;
    commitStats(applyHoldResults(before, results.map((item) => item.result)));
    results.forEach(({ lane, result, epic }) => onHoldEnd(lane, result.holdState === "complete", before.combo, { epic, heldSeconds: result.heldSeconds }));
  }, [commitNotes, commitStats, onHoldEnd]);

  const pauseGame = useCallback(() => {
    if (!playingRef.current) return;
    pausedAtRef.current = gameTime();
    cancelAnimationFrame(animationRef.current);
    playingRef.current = false;
    setPlaying(false);
    setPaused(true);
    if (phaseSourceRef.current === "song" && midiPlayerRef.current) stopMidiAudio();
    else stopDemoSong();
  }, [gameTime, stopDemoSong, stopMidiAudio]);

  const resumeGame = useCallback(async () => {
    if (!pausedRef.current || midiBusyRef.current || mustRotateRef.current) return;
    const sequence = startSequenceRef.current;
    const at = pausedAtRef.current;
    setPaused(false);
    startingRef.current = "resume";
    // Hold cuja tecla/dedo foi solto durante a pausa conta como solto naquele instante.
    resolveHolding((lane) => !isLaneHeld(laneInputRef.current, lane), at);
    if (phaseSourceRef.current === "song" && importedSong?.source?.format === "MIDI") {
      try {
        const started = await playMidi(at, () => waitForCountdown(sequence));
        if (!started) return;
      } catch (error) {
        if (sequence !== startSequenceRef.current) return;
        startingRef.current = null;
        setSetupStatus(error instanceof Error ? error.message : "Não foi possível retomar o áudio.");
        setPaused(true);
        return;
      }
    } else {
      unlockDemoAudio();
      if (!await waitForCountdown(sequence)) return;
      startDemoSong(notesRef.current, at);
    }
    if (sequence !== startSequenceRef.current) return;
    startingRef.current = null;
    setPlaying(true);
    playingRef.current = true;
    animationRef.current = requestAnimationFrame(tick);
  }, [importedSong, playMidi, resolveHolding, startDemoSong, tick, unlockDemoAudio, waitForCountdown]);

  /**
   * Para o que estiver acontecendo de forma previsível: partida rodando vira
   * pausa; partida carregando/em contagem é cancelada (início volta para o botão
   * "Começar"; retomada volta para o menu de pausa, na mesma posição).
   */
  const interruptGame = useCallback(() => {
    if (playingRef.current) {
      pauseGame();
      return;
    }
    if (startingRef.current === "resume") {
      startingRef.current = null;
      startSequenceRef.current += 1; // cancela a contagem em andamento
      stopMidiAudio();
      stopDemoSong();
      setCountdown(null);
      setPaused(true);
    } else if (startingRef.current === "start") {
      resetEngine();
      setAwaitingStart(true);
    }
  }, [pauseGame, resetEngine, stopDemoSong, stopMidiAudio]);

  const pressLane = useCallback((lane) => {
    setPressedLanes((current) => current.includes(lane) ? current : [...current, lane]);
    window.setTimeout(() => setPressedLanes((current) => current.filter((item) => item !== lane)), 90);
    if (!playingRef.current) return;

    const time = gameTime();
    const candidates = notesRef.current
      .filter((note) => !note.hit && !note.missed && note.key === lane)
      .map((note) => ({ note, delta: time - note.time }))
      .filter((item) => Math.abs(item.delta) <= 0.18)
      .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));

    if (!candidates.length) {
      const before = statsRef.current;
      commitStats(applyMiss(before, 1));
      onStray(lane, before.combo);
      return;
    }

    const { note, delta: rawDelta } = candidates[0];
    const previousChordInput = chordInputRef.current;
    const isSameChord = previousChordInput
      && Math.abs(note.time - previousChordInput.noteTime) <= 0.04
      && performance.now() - previousChordInput.recordedAt <= 160;
    // Teclas físicas nunca chegam exatamente no mesmo milissegundo. Para notas
    // do mesmo acorde, o segundo toque recebe o mesmo julgamento do primeiro.
    const delta = isSameChord ? previousChordInput.delta : rawDelta;
    chordInputRef.current = { noteTime: note.time, delta, recordedAt: performance.now() };
    const result = judgeNote(delta);
    if (!result) return;

    const holding = isHold(note);
    commitNotes(notesRef.current.map((item) => item.id === note.id ? { ...item, hit: true, holdState: holding ? "holding" : null } : item));

    const before = statsRef.current;
    const next = applyHit(before, result);
    commitStats(next);
    onHit(lane, result.kind, next.combo);
    const milestone = crossedMilestone(before.combo, next.combo);
    if (milestone) onMilestone(milestone);
    if (!isFever(before.combo) && isFever(next.combo)) onFever();
  }, [commitNotes, commitStats, gameTime, onFever, onHit, onMilestone, onStray]);

  const releaseLane = useCallback((lane) => {
    if (!playingRef.current) return;
    resolveHolding((key) => lane === null || key === lane, gameTime());
  }, [gameTime, resolveHolding]);

  // Os listeners nativos leem as versões atuais por ref: re-registrar no meio de
  // um toque faria o dedo "sumir" sem soltar o hold.
  const pressLaneRef = useRef(pressLane);
  const releaseLaneRef = useRef(releaseLane);
  const interruptGameRef = useRef(interruptGame);
  useEffect(() => {
    pressLaneRef.current = pressLane;
    releaseLaneRef.current = releaseLane;
    interruptGameRef.current = interruptGame;
  }, [interruptGame, pressLane, releaseLane]);

  /** Larga todas as teclas/dedos e interrompe (pausa ou cancela a contagem). */
  const interruptAndRelease = useCallback(() => {
    releaseAll(laneInputRef.current);
    interruptGameRef.current();
  }, []);

  // ── Teclado ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      if (event.key === "Escape" && screenRef.current === "game") {
        event.preventDefault();
        if (playingRef.current) pauseGame();
        else if (pausedRef.current) resumeGame();
        return;
      }
      if (event.repeat) return;
      const lane = keyToLane(event);
      if (lane === -1) return;
      event.preventDefault();
      holdLane(laneInputRef.current, keySource(lane), lane);
      pressLaneRef.current(lane);
    };
    const onKeyUp = (event) => {
      const lane = keyToLane(event);
      if (lane === -1) return;
      const freed = releaseSource(laneInputRef.current, keySource(lane));
      if (freed !== -1) releaseLaneRef.current(freed);
    };
    // Perder o foco (trocar de aba/app, bloquear a tela, ligação) pausa a partida.
    const onBlur = () => { if (screenRef.current === "game") interruptAndRelease(); };
    const onVisibility = () => { if (document.hidden) onBlur(); };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("pagehide", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pagehide", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [interruptAndRelease, pauseGame, resumeGame]);

  // ── Toque e mouse na pista (pointer events, multitouch) ─────────────────
  useEffect(() => {
    if (screen !== "game") return undefined;
    const track = trackRef.current;
    if (!track) return undefined;
    const input = laneInputRef.current;

    // Geometria em cache (medir a cada toque forçaria layout no meio do jogo).
    // O tremor desloca a pista em poucos px, sem mudar a coluna tocada.
    let box = null;
    const laneAt = (event) => {
      if (!box) {
        const rect = track.getBoundingClientRect();
        box = { left: rect.left + track.clientLeft, width: track.clientWidth };
      }
      return laneFromX(event.clientX - box.left, box.width);
    };
    const invalidate = () => { box = null; };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(invalidate);
    observer?.observe(track);

    const release = (source) => {
      const freed = releaseSource(input, source);
      if (freed !== -1) releaseLaneRef.current(freed);
    };
    const onPointerDown = (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      // Botões dentro da pista ("Começar") recebem o toque normalmente.
      if (event.target instanceof Element && event.target.closest("[data-lane-input='off']")) return;
      const lane = laneAt(event);
      if (lane === -1) return;
      event.preventDefault(); // sem seleção de texto, foco ou eventos de mouse emulados
      try { track.setPointerCapture(event.pointerId); } catch { /* ponteiro já encerrado */ }
      const source = pointerSource(event.pointerId);
      const previous = holdLane(input, source, lane);
      if (previous !== -1) releaseLaneRef.current(previous);
      pressLaneRef.current(lane);
    };
    // Arrastar o dedo para outra coluna (ou para fora da pista) conta como soltar.
    // Não toca a coluna nova: deslizar pelas colunas não vale como acerto.
    const onPointerMove = (event) => {
      const source = pointerSource(event.pointerId);
      if (input.has(source) && laneAt(event) !== input.get(source)) release(source);
    };
    const onPointerEnd = (event) => release(pointerSource(event.pointerId));
    // Toque longo (hold) não deve abrir menu de contexto nem lupa.
    const onContextMenu = (event) => event.preventDefault();

    track.addEventListener("pointerdown", onPointerDown);
    track.addEventListener("pointermove", onPointerMove);
    track.addEventListener("pointerup", onPointerEnd);
    track.addEventListener("pointercancel", onPointerEnd);
    track.addEventListener("lostpointercapture", onPointerEnd);
    track.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("resize", invalidate);
    return () => {
      track.removeEventListener("pointerdown", onPointerDown);
      track.removeEventListener("pointermove", onPointerMove);
      track.removeEventListener("pointerup", onPointerEnd);
      track.removeEventListener("pointercancel", onPointerEnd);
      track.removeEventListener("lostpointercapture", onPointerEnd);
      track.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("resize", invalidate);
      observer?.disconnect();
      [...input.keys()].filter((source) => source.startsWith("pointer:")).forEach((source) => input.delete(source));
    };
  }, [screen]);

  // ── Orientação e tela cheia ─────────────────────────────────────────────
  // Girar para retrato ou sair da tela cheia no meio da partida pausa (ou
  // cancela a contagem). Só reage à mudança, não a cada render.
  useEffect(() => {
    if (mustRotate && screenRef.current === "game") interruptAndRelease();
  }, [interruptAndRelease, mustRotate]);

  useEffect(() => onFullscreenChange(() => {
    const active = isFullscreen();
    setFullscreenActive(active);
    if (!active && screenRef.current === "game") interruptAndRelease();
  }), [interruptAndRelease]);

  useEffect(() => () => {
    cancelAnimationFrame(animationRef.current);
    window.clearTimeout(finishTimerRef.current);
    stopDemoSong();
    midiPlayerRef.current?.dispose();
  }, [stopDemoSong]);

  // ── Preparação da fase ──────────────────────────────────────────────────
  const gameplaySelection = useMemo(() => (
    importedSong
      ? selectGameplayTracks(importedSong, { mode: gameplaySourceMode, customTrackIds: selectedTrackIds, analysis: songAnalysis })
      : { trackIds: [] }
  ), [gameplaySourceMode, importedSong, selectedTrackIds, songAnalysis]);
  const gameplayTrackIds = gameplaySelection.trackIds;

  const setupCharts = useMemo(() => rankedChart ? {} : Object.fromEntries(DIFFICULTIES.map(({ id }) => {
    // Música do catálogo nas opções padrão: usa a fase congelada (a mesma do
    // ranking), para a partida valer. Tracks escolhidas à mão geram na hora.
    const frozen = phaseSource === "song" && gameplaySourceMode === "essence" ? catalogFrozen?.[id] : null;
    if (frozen) return [id, { ...summarizeChart(frozen.notes), ranked: frozen }];
    const chart = phaseSource === "song" && importedSong
      ? (gameplaySelection.trackIds.length ? generateChart(importedSong, { trackIds: gameplaySelection.trackIds, segments: gameplaySelection.segments, difficulty: id }) : [])
      : createDemoChart(id);
    return [id, summarizeChart(chart)];
  })), [catalogFrozen, gameplaySelection, gameplaySourceMode, importedSong, phaseSource, rankedChart]);

  function setSongForPlay(song) {
    const playableTracks = song.tracks.filter((track) => track.notes.length);
    const pianoTracks = playableTracks.filter((track) => isPianoFamily(track.family));
    const trackIds = playableTracks.map((track) => track.id);
    setImportedSong(song);
    setSelectedTrackIds((pianoTracks.length ? pianoTracks : playableTracks).map((track) => track.id));
    setGameplaySourceMode("essence");
    setAudioTrackIds(trackIds);
    return trackIds;
  }

  /** `meta` (opcional): título/artista vindos do catálogo de músicas. */
  async function importSymbolicFile(file, meta) {
    stopMidiAudio();
    midiPausedPositionRef.current = 0;
    setSongLoading(true);
    setHomeStatus(`Lendo ${file.name}...`);
    try {
      const imported = await importSong(file);
      const song = meta ? { ...imported, title: meta.title, artist: meta.artist } : imported;
      const report = analyzeSong(song);
      setSongForPlay(song);
      setRankedChart(null);
      setCatalogRanked(null);
      setCatalogFrozen(null);
      catalogSlugRef.current = meta?.id ?? null;
      if (meta?.id) loadCatalogFrozen(meta.id);
      midiPlayerRef.current?.dispose();
      midiPlayerRef.current = null;
      const melodyIds = selectGameplayTracks(song, { mode: "essence", analysis: report }).trackIds;
      const melodyNames = melodyIds.map((id) => song.tracks.find((track) => track.id === id)?.name).filter(Boolean);
      setSetupStatus(melodyNames.length
        ? `Melodia: ${melodyNames.length > 1 ? `${melodyNames.length} instrumentos se revezam` : melodyNames[0]}`
        : "Nenhuma melodia segura encontrada; escolha as tracks em Avançado.");
      setHomeStatus("");
      setPhaseSource("song");
      setScreen("setup");
    } catch (error) {
      setHomeStatus(error instanceof Error ? error.message : "Não foi possível importar a música.");
    } finally {
      setSongLoading(false);
    }
  }

  /** Busca as fases congeladas da música do catálogo. Falhou? Joga a gerada (sem ranking). */
  async function loadCatalogFrozen(slug) {
    const results = await Promise.allSettled(DIFFICULTIES.map(({ id }) => loadRankedChart(slug, id)));
    const frozen = Object.fromEntries(results.flatMap((result, index) => (
      result.status === "fulfilled" ? [[DIFFICULTIES[index].id, result.value]] : []
    )));
    // Só aplica se o jogador ainda está nesta música.
    if (catalogSlugRef.current === slug && Object.keys(frozen).length) setCatalogFrozen({ slug, ...frozen });
  }

  async function loadSymbolicSong(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await importSymbolicFile(file);
  }

  async function loadCatalogSong(entry) {
    if (songLoading) return;
    setSongLoading(true);
    setHomeStatus(`Carregando ${entry.title}...`);
    try {
      const file = await loadCatalogFile(entry);
      await importSymbolicFile(file, entry);
    } catch (error) {
      setHomeStatus(error instanceof Error ? error.message : `Não foi possível carregar ${entry.title}.`);
      setSongLoading(false);
    }
  }

  function toggleSongTrack(id) {
    setSelectedTrackIds(() => {
      const base = gameplayTrackIds;
      return base.includes(id) ? base.filter((trackId) => trackId !== id) : [...base, id];
    });
    setGameplaySourceMode("custom");
  }

  function toggleAudioTrack(id) {
    setAudioTrackIds((current) => current.includes(id) ? current.filter((trackId) => trackId !== id) : [...current, id]);
  }

  async function previewMidi() {
    if (midiBusyRef.current) return;
    try {
      if (midiPlayerRef.current?.playing) {
        midiPausedPositionRef.current = midiPlayerRef.current.currentTime();
        stopMidiAudio();
        setMidiPreviewPlaying(false);
      } else {
        const started = await playMidi(midiPausedPositionRef.current);
        if (started) setMidiPreviewPlaying(true);
      }
    } catch (error) {
      setSetupStatus(error instanceof Error ? error.message : "Não foi possível tocar o MIDI.");
    }
  }

  function stopMidiPreview() {
    stopMidiAudio();
    midiPausedPositionRef.current = 0;
    setMidiPreviewPlaying(false);
  }

  // ── Navegação ───────────────────────────────────────────────────────────
  function goHome() {
    resetEngine();
    setRankedChart(null);
    setScreen("home");
  }

  function openSetup(source) {
    resetEngine();
    setPhaseSource(source);
    setScreen(rankedChart ? "ranking" : "setup");
  }

  function openRanking() {
    setSetupStatus("");
    setScreen("ranking");
  }

  function openAccount(beforeGoogle) {
    setAuthRequest({ beforeGoogle, setup: getSnapshot().status === "needsProfile" });
  }

  /**
   * Entra na tela de jogo. Precisa rodar dentro do toque/clique: tela cheia e o
   * áudio no celular só são liberados por um gesto do usuário. Em retrato, a
   * fase fica esperando o aparelho girar e um toque em "Começar".
   */
  async function beginGame(chart, source, { fullscreen = false, ranked = false, midi } = {}) {
    if (!chart.length) return;
    setPhaseNotes(chart);
    setScreen("game");
    if (fullscreen) {
      const entering = enterLandscapeFullscreen();
      // Só espera quando o bloqueio pode resolver o retrato (Chrome Android).
      // Esperar à toa tiraria o início do áudio de dentro do gesto (Safari).
      if (mustRotateRef.current && (await entering).locked) mustRotateRef.current = false;
    }
    if (mustRotateRef.current) {
      resetEngine();
      setAwaitingStart(true);
      return;
    }
    startGame(chart, source, { ranked, midi });
  }

  function playSelected({ fullscreen = false } = {}) {
    const selected = setupCharts[difficulty];
    setCatalogRanked(selected?.ranked ?? null);
    beginGame(selected?.chart ?? [], phaseSource, { fullscreen });
  }

  function restartGame() {
    // `ranked` aqui só escolhe a tela de volta em caso de erro (Ranking x Configuração).
    beginGame(phaseNotes, phaseSource, { ranked: Boolean(rankedChart) });
  }

  function playRanked(chart, song, options) {
    setSetupStatus("");
    setRankedChart(chart);
    setCatalogRanked(null);
    setDifficulty(chart.difficulty);
    setPhaseSource("song");
    const trackIds = setSongForPlay(song);
    // A primeira reprodução recebe os dados no gesto que libera o áudio no celular.
    beginGame(chart.notes, "song", { ...options, ranked: true, midi: { song, trackIds } });
  }

  const difficultyLabel = DIFFICULTIES.find((option) => option.id === difficulty)?.label ?? "";
  const title = phaseSource === "song" && importedSong ? importedSong.title : "Fase demo";
  const subtitle = phaseSource === "song" && importedSong ? importedSong.artist : "Uma fase curta para aquecer os dedos, com notas longas.";

  return (
    <main className={`app-shell screen-${screen} ${settings.reducedMotion ? "reduce-motion" : ""}`}>
      {screen === "home" && (
        <HomeScreen
          loading={songLoading}
          status={homeStatus}
          currentSong={importedSong?.title}
          onPlaySong={loadCatalogSong}
          onImportFile={loadSymbolicSong}
          onContinue={() => openSetup("song")}
          onRanking={openRanking}
          onSettings={() => setSettingsOpen(true)}
          scoreNotice={scoreNotice}
          onAccount={(slug) => slug ? setProfileSlug(slug) : openAccount()}
          onPrivacy={openPrivacy}
        />
      )}

      {screen === "ranking" && (
        <RankingScreen initialChart={rankedChart} initialDifficulty={difficulty} handMode={settings.handMode}
          onProfile={setProfileSlug} onPlay={playRanked}
          onBack={goHome} onSettings={() => setSettingsOpen(true)}
          canFullscreen={canFullscreen && !fullscreenActive} status={setupStatus} />
      )}

      {screen === "setup" && (
        <SetupScreen
          song={phaseSource === "song" ? importedSong : null}
          analysis={songAnalysis}
          title={title}
          subtitle={subtitle}
          difficulty={difficulty}
          onDifficulty={setDifficulty}
          charts={setupCharts}
          sourceMode={gameplaySourceMode}
          onSourceMode={setGameplaySourceMode}
          selectedTrackIds={selectedTrackIds}
          playedTrackIds={gameplayTrackIds}
          onToggleTrack={toggleSongTrack}
          audioTrackIds={audioTrackIds}
          onToggleAudio={toggleAudioTrack}
          audioMode={audioMode}
          onAudioMode={setAudioMode}
          previewPlaying={midiPreviewPlaying}
          midiBusy={midiBusy}
          audioStatus={midiAudioStatus}
          onPreview={previewMidi}
          onStopPreview={stopMidiPreview}
          onPlay={() => playSelected()}
          onPlayFullscreen={canFullscreen && !fullscreenActive ? () => playSelected({ fullscreen: true }) : null}
          mustRotate={mustRotate}
          onBack={goHome}
          onSettings={() => setSettingsOpen(true)}
          status={setupCharts[difficulty]?.count === 0 ? "Nenhuma nota com essa combinação. Tente outra fonte ou escolha tracks em Avançado." : phaseSource === "song" ? setupStatus : ""}
        />
      )}

      {screen === "game" && (
        <GameScreen
          title={title}
          difficultyLabel={difficultyLabel}
          notes={notes}
          holdingLanes={holdingLanes}
          fireLanes={fireLanes}
          pressedLanes={pressedLanes}
          stats={stats}
          handMode={settings.handMode}
          countdown={countdown}
          loading={midiBusy}
          loadingText={midiAudioStatus}
          paused={paused}
          finished={finished}
          awaitingStart={awaitingStart && !mustRotate}
          onStart={restartGame}
          touchDevice={touchDevice}
          settingsOpen={settingsOpen}
          onPause={pauseGame}
          onResume={resumeGame}
          onRestart={restartGame}
          onExit={() => openSetup(phaseSource)}
          onSettings={() => setSettingsOpen(true)}
          trackRef={trackRef}
          fx={fx}
        />
      )}

      {screen === "results" && (
        <ResultsScreen
          stats={stats}
          title={title}
          difficultyLabel={difficultyLabel}
          onReplay={restartGame}
          onSetup={() => openSetup(phaseSource)}
          onHome={goHome}
          rankedResult={(rankedChart || catalogRanked) && <RankedResult chart={rankedChart || catalogRanked} title={title} stats={stats}
            eligible={playedHandModeRef.current === "both" && settings.handMode === "both"}
            onAuth={openAccount} />}
        />
      )}

      {mustRotate && (screen === "game" || !portraitAllowed) && (
        <RotateOverlay
          inGame={screen === "game"}
          onRotate={canFullscreen ? enterLandscapeFullscreen : null}
          onExit={() => openSetup(phaseSource)}
          onDismiss={() => setPortraitAllowed(true)}
        />
      )}

      {settingsOpen && <SettingsPanel settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} />}
      <AccountFlow screen={screen} settingsOpen={settingsOpen} authRequest={authRequest} profileSlug={profileSlug}
        onCloseAuth={closeAuth} onCloseProfile={closeProfile} onScoreNotice={setScoreNotice}
        privacyOpen={privacyOpen} onOpenPrivacy={openPrivacy} onClosePrivacy={closePrivacy} />
    </main>
  );
}
