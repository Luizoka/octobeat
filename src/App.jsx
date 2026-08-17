import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { importSong } from "./music/importSong.js";
import { generateChart } from "./chart/generateChart.js";
import { normalizeNotes } from "./game/normalizeNotes.js";
import { judgeNote } from "./game/judgeNote.js";
import { MidiPlayer } from "./music/midi/MidiPlayer.js";
import { isPianoFamily } from "./music/midi/classifyTrack.js";
import octoLogo from "./images/logo_semfundo.png";
import { analyzeSong } from "./music-analysis/analyzeSong.js";
import { selectGameplayTracks } from "./music-analysis/selectGameplayTracks.js";
import { calculateChartMetrics } from "./music-analysis/chartMetrics.js";

const KEYS = [
  { label: "A", values: ["a"], color: "#ff6860" },
  { label: "S", values: ["s"], color: "#ffd166" },
  { label: "D", values: ["d"], color: "#7fd45a" },
  { label: "F", values: ["f"], color: "#27d9c4" },
  { label: "J", values: ["j"], color: "#69a7ff" },
  { label: "K", values: ["k"], color: "#a978ff" },
  { label: "L", values: ["l"], color: "#ff8c42" },
  { label: "Ç", values: ["ç", ";"], color: "#f45dc8" },
];

const BASE_CHART = [
  { time: 1.0, key: 0 }, { time: 1.25, key: 1 }, { time: 1.5, key: 2 }, { time: 1.75, key: 3 },
  { time: 2.0, key: 4 }, { time: 2.25, key: 5 }, { time: 2.5, key: 6 }, { time: 2.75, key: 7 },
  { time: 3.2, key: 3 }, { time: 3.45, key: 4 }, { time: 3.7, key: 2 }, { time: 3.95, key: 5 },
  { time: 4.35, key: 1 }, { time: 4.6, key: 6 }, { time: 4.85, key: 0 }, { time: 5.1, key: 7 },
  { time: 5.55, key: 0 }, { time: 5.8, key: 2 }, { time: 6.05, key: 4 }, { time: 6.3, key: 6 },
  { time: 6.75, key: 1 }, { time: 7.0, key: 3 }, { time: 7.25, key: 5 }, { time: 7.5, key: 7 },
  { time: 8.0, key: 0 }, { time: 8.0, key: 4 }, { time: 8.5, key: 1 }, { time: 8.5, key: 5 },
  { time: 9.0, key: 2 }, { time: 9.0, key: 6 }, { time: 9.5, key: 3 }, { time: 9.5, key: 7 },
  { time: 10.05, key: 7 }, { time: 10.3, key: 6 }, { time: 10.55, key: 5 }, { time: 10.8, key: 4 },
  { time: 11.05, key: 3 }, { time: 11.3, key: 2 }, { time: 11.55, key: 1 }, { time: 11.8, key: 0 },
  { time: 12.35, key: 0 }, { time: 12.6, key: 3 }, { time: 12.85, key: 4 }, { time: 13.1, key: 7 },
  { time: 13.55, key: 2 }, { time: 13.8, key: 5 }, { time: 14.05, key: 1 }, { time: 14.3, key: 6 },
  { time: 14.85, key: 0 }, { time: 15.1, key: 2 }, { time: 15.35, key: 5 }, { time: 15.6, key: 7 },
  { time: 16.15, key: 3 }, { time: 16.4, key: 4 }, { time: 16.9, key: 0 }, { time: 16.9, key: 7 },
];

const DEMO_PHASE = {
  title: "Fase demo",
  artist: "OctoBeat",
  notes: BASE_CHART,
};

const blankStats = {
  score: 0,
  combo: 0,
  hits: 0,
  total: 0,
  judgement: "Pronto",
};

function nowSeconds() {
  return performance.now() / 1000;
}

function keyToLane(event) {
  const key = event.key.toLowerCase();
  return KEYS.findIndex((item) => item.values.includes(key));
}

function createChart(difficulty) {
  if (difficulty === "easy") {
    return BASE_CHART.filter((_, index) => index % 2 === 0).map((note) => ({ ...note }));
  }

  if (difficulty === "hard") {
    const extra = BASE_CHART
      .filter((note, index) => index % 4 === 1 && note.time > 2)
      .map((note) => ({ time: Number((note.time + 0.125).toFixed(3)), key: (note.key + 2) % 8 }));
    return [...BASE_CHART, ...extra].sort((a, b) => a.time - b.time).map((note) => ({ ...note }));
  }

  return BASE_CHART.map((note) => ({ ...note }));
}

function makePlayableNotes(chart) {
  return normalizeNotes(chart).map((note, id) => ({ ...note, id, y: -40, hit: false, missed: false }));
}

function parsePhaseJson(text) {
  const data = JSON.parse(text);
  const rawNotes = Array.isArray(data) ? data : data?.notes;
  const notes = normalizeNotes(rawNotes);

  if (!notes.length) {
    throw new Error("O JSON nao possui notas validas.");
  }

  return {
    title: typeof data?.title === "string" && data.title.trim() ? data.title.trim() : "Fase importada",
    artist: typeof data?.artist === "string" && data.artist.trim() ? data.artist.trim() : "Artista desconhecido",
    notes,
  };
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

function scheduleNoise(context, nodes, start) {
  const buffer = context.createBuffer(1, context.sampleRate * 0.05, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }

  const noise = context.createBufferSource();
  const gain = context.createGain();
  noise.buffer = buffer;
  gain.gain.setValueAtTime(0.11, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.045);
  noise.connect(gain).connect(context.destination);
  noise.start(start);
  nodes.current.push(noise);
}

export default function App() {
  const [view, setView] = useState("music");
  const [difficulty, setDifficulty] = useState("normal");
  const [playing, setPlaying] = useState(false);
  const [phase, setPhase] = useState(() => ({ ...DEMO_PHASE, notes: createChart("normal") }));
  const [phaseSource, setPhaseSource] = useState("demo");
  const [phaseStatus, setPhaseStatus] = useState("Fase demo carregada");
  const [gameAudioUrl, setGameAudioUrl] = useState("");
  const [gameAudioName, setGameAudioName] = useState("Musica demo sintetizada");
  const [notes, setNotes] = useState(() => makePlayableNotes(createChart("normal")));
  const [pressedLanes, setPressedLanes] = useState([]);
  const [stats, setStats] = useState(blankStats);
  const [editorTitle, setEditorTitle] = useState("");
  const [editorArtist, setEditorArtist] = useState("");
  const [editorAudioUrl, setEditorAudioUrl] = useState("");
  const [editorAudioName, setEditorAudioName] = useState("Nenhum audio carregado");
  const [editorRecording, setEditorRecording] = useState(false);
  const [editorChart, setEditorChart] = useState([]);
  const [flashingEditorLane, setFlashingEditorLane] = useState(null);
  const [importedSong, setImportedSong] = useState(null);
  const [selectedTrackIds, setSelectedTrackIds] = useState([]);
  const [songStatus, setSongStatus] = useState("Importe um MIDI ou MusicXML para gerar um chart.");
  const [songLoading, setSongLoading] = useState(false);
  const [audioTrackIds, setAudioTrackIds] = useState([]);
  const [audioMode, setAudioMode] = useState("piano-focus");
  const [midiAudioStatus, setMidiAudioStatus] = useState("Áudio MIDI será carregado automaticamente ao tocar.");
  const [midiPreviewPlaying, setMidiPreviewPlaying] = useState(false);
  const [gameplaySourceMode, setGameplaySourceMode] = useState("essence");

  const trackRef = useRef(null);
  const gameAudioRef = useRef(null);
  const editorAudioRef = useRef(null);
  const animationRef = useRef(0);
  const startAtRef = useRef(0);
  const playingRef = useRef(false);
  const notesRef = useRef(notes);
  const audioContextRef = useRef(null);
  const audioNodesRef = useRef([]);
  const editorRecordingRef = useRef(false);
  const midiPlayerRef = useRef(null);
  const chordInputRef = useRef(null);

  const accuracy = stats.total ? `${Math.round((stats.hits / stats.total) * 100)}%` : "0%";
  const editorPhase = useMemo(() => ({
    title: editorTitle.trim() || editorAudioName.replace(/\.[^/.]+$/, "") || "Fase OctoBeat",
    artist: editorArtist.trim() || "Artista desconhecido",
    notes: editorChart,
  }), [editorArtist, editorAudioName, editorTitle, editorChart]);
  const chartOutput = useMemo(() => JSON.stringify(editorPhase, null, 2), [editorPhase]);
  const songAnalysis = useMemo(() => importedSong ? analyzeSong(importedSong) : null, [importedSong]);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    editorRecordingRef.current = editorRecording;
  }, [editorRecording]);

  const stopDemoSong = useCallback(() => {
    audioNodesRef.current.forEach((node) => {
      try {
        node.stop();
      } catch {
        node.disconnect?.();
      }
    });
    audioNodesRef.current = [];
  }, []);

  const stopGameAudio = useCallback(() => {
    if (gameAudioRef.current) {
      gameAudioRef.current.pause();
      gameAudioRef.current.currentTime = 0;
    }
  }, []);

  const stopMidiAudio = useCallback(() => {
    // Notas do SoundFont são agendadas no futuro. Descartar o contexto é a forma
    // confiável de cancelar também esses eventos, antes de uma nova execução.
    midiPlayerRef.current?.dispose();
    midiPlayerRef.current = null;
  }, []);

  const playMidi = useCallback(async (position = 0) => {
    if (!importedSong || importedSong.source?.format !== "MIDI") throw new Error("A reprodução integrada está disponível para MIDI.");
    if (!midiPlayerRef.current || midiPlayerRef.current.song !== importedSong) {
      midiPlayerRef.current?.dispose();
      midiPlayerRef.current = new MidiPlayer(importedSong, { onStatus: setMidiAudioStatus });
    }
    await midiPlayerRef.current.prepare(audioTrackIds, audioMode);
    midiPlayerRef.current.setMix(audioMode);
    await midiPlayerRef.current.play(position);
  }, [audioMode, audioTrackIds, importedSong]);

  const buildNotes = useCallback((chart = phase.notes) => {
    const nextNotes = makePlayableNotes(chart);
    setNotes(nextNotes);
    notesRef.current = nextNotes;
    return nextNotes;
  }, [phase.notes]);

  const resetGame = useCallback((keepReady = true) => {
    cancelAnimationFrame(animationRef.current);
    stopDemoSong();
    stopGameAudio();
    stopMidiAudio();
    setMidiPreviewPlaying(false);
    setPlaying(false);
    playingRef.current = false;
    setStats(blankStats);
    if (keepReady) {
      buildNotes();
    } else {
      setNotes([]);
      notesRef.current = [];
    }
  }, [buildNotes, stopDemoSong, stopGameAudio, stopMidiAudio]);

  const startDemoSong = useCallback((chart) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    const context = audioContextRef.current;
    context.resume?.();
    stopDemoSong();

    const offset = 0.08;
    const start = context.currentTime + offset;
    const scale = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];

    startAtRef.current = nowSeconds() + offset;

    for (let beat = 0; beat < 36; beat += 1) {
      const time = start + beat * 0.5;
      scheduleTone(context, audioNodesRef, time, 0.08, beat % 4 === 0 ? 98 : 130.81, "triangle", 0.08);
      if (beat % 2 === 1) {
        scheduleNoise(context, audioNodesRef, time + 0.02);
      }
    }

    chart.forEach((note, index) => {
      const frequency = scale[note.key] * (index % 3 === 0 ? 0.5 : 1);
      scheduleTone(context, audioNodesRef, start + note.time, 0.11, frequency, "square", 0.045);
    });
  }, [stopDemoSong]);

  const tick = useCallback(() => {
    if (!playingRef.current) return;

    const trackHeight = trackRef.current?.clientHeight ?? 600;
    const hitY = trackHeight - 76;
    const fallDuration = 1.55;
    const time = phaseSource === "song" && midiPlayerRef.current?.playing ? midiPlayerRef.current.currentTime() : gameAudioUrl && gameAudioRef.current ? gameAudioRef.current.currentTime : nowSeconds() - startAtRef.current;
    let missedCount = 0;
    let finished = false;

    setNotes((current) => {
      const next = current.map((note) => {
        if (note.hit || note.missed) return note;

        const progress = 1 - (note.time - time) / fallDuration;
        const y = progress * hitY;

        if (time - note.time > 0.22) {
          missedCount += 1;
          return { ...note, y, missed: true };
        }

        return { ...note, y };
      });

      notesRef.current = next;
      finished = next.length > 0 && next.every((note) => note.hit || note.missed);
      return next;
    });

    if (missedCount) {
      setStats((current) => ({
        ...current,
        combo: 0,
        total: current.total + missedCount,
        judgement: "Erro",
      }));
    }

    const lastNote = notesRef.current.at(-1);
    if (finished && lastNote && time > lastNote.time + 0.5) {
      stopGameAudio();
      stopMidiAudio();
      setPlaying(false);
      playingRef.current = false;
      setStats((current) => ({ ...current, judgement: "Fim" }));
      return;
    }

    animationRef.current = requestAnimationFrame(tick);
  }, [gameAudioUrl, phaseSource, stopGameAudio, stopMidiAudio]);

  const startGame = useCallback(async () => {
    resetGame(false);
    const nextNotes = buildNotes(phase.notes);
    if (!nextNotes.length) {
      setStats((current) => ({ ...current, judgement: "Sem notas" }));
      setPhaseStatus("Carregue uma fase com notas validas.");
      return;
    }

    setStats(blankStats);
    stopGameAudio();
    stopDemoSong();
    stopMidiAudio();

    if (phaseSource === "song" && importedSong?.source?.format === "MIDI") {
      try {
        await playMidi(0);
        setMidiPreviewPlaying(false);
      } catch (error) {
        setPhaseStatus(error instanceof Error ? error.message : "Não foi possível carregar o SoundFont.");
        setStats((current) => ({ ...current, judgement: "Áudio indisponível" }));
        return;
      }
      setPlaying(true);
      playingRef.current = true;
      animationRef.current = requestAnimationFrame(tick);
      return;
    }

    if (gameAudioUrl && gameAudioRef.current) {
      gameAudioRef.current.currentTime = 0;
      try {
        await gameAudioRef.current.play();
      } catch {
        // O áudio externo é opcional. Uma falha de reprodução nunca deve impedir
        // que um chart MIDI/MusicXML seja jogado com o sintetizador interno.
        setPhaseStatus("O áudio local não iniciou; usando o sintetizador interno.");
        startDemoSong(nextNotes);
      }
      startAtRef.current = nowSeconds();
    } else {
      startDemoSong(nextNotes);
    }

    setPlaying(true);
    playingRef.current = true;
    animationRef.current = requestAnimationFrame(tick);
  }, [buildNotes, gameAudioUrl, importedSong, phase.notes, phaseSource, playMidi, resetGame, startDemoSong, stopDemoSong, stopGameAudio, stopMidiAudio, tick]);

  const recordEditorNote = useCallback((lane) => {
    const time = Number(editorAudioRef.current?.currentTime.toFixed(3));
    if (!Number.isFinite(time)) return;

    setEditorChart((current) => [...current, { time, key: lane }].sort((a, b) => a.time - b.time || a.key - b.key));
    setFlashingEditorLane(lane);
    window.setTimeout(() => setFlashingEditorLane(null), 110);
  }, []);

  const pressLane = useCallback((lane) => {
    setPressedLanes((current) => current.includes(lane) ? current : [...current, lane]);
    window.setTimeout(() => setPressedLanes((current) => current.filter((item) => item !== lane)), 90);

    if (view === "editor" && editorRecordingRef.current) {
      recordEditorNote(lane);
      return;
    }

    if (!playingRef.current) return;

    const time = phaseSource === "song" && midiPlayerRef.current?.playing ? midiPlayerRef.current.currentTime() : gameAudioUrl && gameAudioRef.current ? gameAudioRef.current.currentTime : nowSeconds() - startAtRef.current;
    const candidates = notesRef.current
      .filter((note) => !note.hit && !note.missed && note.key === lane)
      .map((note) => ({ note, delta: time - note.time }))
      .filter((item) => Math.abs(item.delta) <= 0.18)
      .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));

    if (!candidates.length) {
      setStats((current) => ({
        ...current,
        combo: 0,
        total: current.total + 1,
        judgement: "Erro",
      }));
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

    const nextNotes = notesRef.current.map((item) => item.id === note.id ? { ...item, hit: true } : item);
    notesRef.current = nextNotes;
    setNotes(nextNotes);

    setStats((current) => {
      const combo = current.combo + 1;
      return {
        score: current.score + result.score + combo * 12,
        combo,
        hits: current.hits + 1,
        total: current.total + 1,
        judgement: result.label,
      };
    });
  }, [gameAudioUrl, phaseSource, recordEditorNote, view]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.repeat || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) return;

      const lane = keyToLane(event);
      if (lane === -1) return;

      event.preventDefault();
      pressLane(lane);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pressLane]);

  useEffect(() => () => {
    cancelAnimationFrame(animationRef.current);
    stopDemoSong();
    stopGameAudio();
    midiPlayerRef.current?.dispose();
  }, [stopDemoSong, stopGameAudio]);

  useEffect(() => () => {
    if (gameAudioUrl) URL.revokeObjectURL(gameAudioUrl);
  }, [gameAudioUrl]);

  useEffect(() => () => {
    if (editorAudioUrl) URL.revokeObjectURL(editorAudioUrl);
  }, [editorAudioUrl]);

  function changeDifficulty(event) {
    const nextDifficulty = event.target.value;
    setDifficulty(nextDifficulty);
    if (importedSong) {
      const selection = selectGameplayTracks(importedSong, { mode: gameplaySourceMode, customTrackIds: selectedTrackIds, analysis: songAnalysis });
      const nextNotes = generateChart(importedSong, { trackIds: selection.trackIds, difficulty: nextDifficulty });
      const sourceNames = selection.trackIds.map((id) => importedSong.tracks.find((track) => track.id === id)?.name).filter(Boolean);
      const nextPhase = { title: importedSong.title, artist: importedSong.artist, difficulty: nextDifficulty, gameplayMode: gameplaySourceMode, gameplayTrackIds: selection.trackIds, chartMetrics: calculateChartMetrics(nextNotes, importedSong.duration, sourceNames), notes: nextNotes };
      setPhase(nextPhase);
      setPhaseSource("song");
      setPhaseStatus(`${nextNotes.length} notas · ${gameplaySourceMode === "essence" ? "Essência" : gameplaySourceMode === "piano" ? "Piano" : "Personalizado"} · ${sourceNames.join(", ")}`);
      cancelAnimationFrame(animationRef.current);
      stopDemoSong();
      stopGameAudio();
      setPlaying(false);
      playingRef.current = false;
      setStats(blankStats);
      buildNotes(nextNotes);
      return;
    }
    const nextPhase = { ...DEMO_PHASE, notes: createChart(nextDifficulty) };
    setPhase(nextPhase);
    setPhaseSource("demo");
    setPhaseStatus("Fase demo carregada");
    cancelAnimationFrame(animationRef.current);
    stopDemoSong();
    stopGameAudio();
    setPlaying(false);
    playingRef.current = false;
    setStats(blankStats);
    buildNotes(nextPhase.notes);
  }

  function loadGameAudio(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(file.name)) {
      setPhaseStatus("Áudio local aceita MP3, WAV, OGG, M4A, AAC ou FLAC. MIDI deve ser carregado na aba Música.");
      event.target.value = "";
      return;
    }

    if (gameAudioUrl) URL.revokeObjectURL(gameAudioUrl);
    setGameAudioUrl(URL.createObjectURL(file));
    setGameAudioName(file.name);
    setPhaseStatus("Audio local carregado");
    resetGame(true);
  }

  async function loadPhaseJson(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const nextPhase = parsePhaseJson(await file.text());
      cancelAnimationFrame(animationRef.current);
      stopDemoSong();
      stopGameAudio();
      setPlaying(false);
      playingRef.current = false;
      setPhase(nextPhase);
      setPhaseSource("json");
      setPhaseStatus(`${nextPhase.notes.length} notas importadas de ${file.name}`);
      setStats(blankStats);
      buildNotes(nextPhase.notes);
    } catch (error) {
      setPhaseStatus(error instanceof Error ? error.message : "Nao foi possivel importar o JSON.");
      setStats((current) => ({ ...current, judgement: "JSON invalido" }));
    }
  }

  async function loadSymbolicSong(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSongLoading(true);
    setSongStatus("Interpretando a música...");
    try {
      const song = await importSong(file);
      const report = analyzeSong(song);
      const pianoTracks = song.tracks.filter((track) => isPianoFamily(track.family) && track.notes.length);
      const ids = (pianoTracks.length ? pianoTracks : song.tracks.filter((track) => track.notes.length)).map((track) => track.id);
      setImportedSong(song);
      setSelectedTrackIds(ids);
      setGameplaySourceMode("essence");
      setAudioTrackIds(song.tracks.filter((track) => track.notes.length).map((track) => track.id));
      midiPlayerRef.current?.dispose();
      midiPlayerRef.current = null;
      if (gameAudioUrl) {
        URL.revokeObjectURL(gameAudioUrl);
        setGameAudioUrl("");
        setGameAudioName("Sem áudio local: usando sintetizador interno");
      }
      const essenceName = song.tracks.find((track) => track.id === report.selectedTrackId)?.name;
      setSongStatus(`${song.source.format} reconhecido. Essência sugerida: ${essenceName || "nenhuma track segura"}. ${pianoTracks.length} track(s) de piano encontrada(s).`);
    } catch (error) {
      setImportedSong(null);
      setSelectedTrackIds([]);
      setSongStatus(error instanceof Error ? error.message : "Não foi possível importar a música.");
    } finally {
      setSongLoading(false);
      event.target.value = "";
    }
  }

  function toggleSongTrack(id) {
    setSelectedTrackIds((current) => {
      const base = gameplaySourceMode === "custom" ? current : selectGameplayTracks(importedSong, { mode: gameplaySourceMode, customTrackIds: current, analysis: songAnalysis }).trackIds;
      return base.includes(id) ? base.filter((trackId) => trackId !== id) : [...base, id];
    });
    setGameplaySourceMode("custom");
  }

  function toggleAudioTrack(id) {
    setAudioTrackIds((current) => current.includes(id) ? current.filter((trackId) => trackId !== id) : [...current, id]);
  }

  async function previewMidi() {
    try {
      if (midiPlayerRef.current?.playing) {
        midiPlayerRef.current.pause();
        setMidiAudioStatus("MIDI pausado.");
        setMidiPreviewPlaying(false);
      } else {
        await playMidi(midiPlayerRef.current?.position ?? 0);
        setMidiPreviewPlaying(true);
      }
    } catch (error) {
      setMidiAudioStatus(error instanceof Error ? error.message : "Não foi possível tocar o MIDI.");
    }
  }

  function stopMidiPreview() {
    stopMidiAudio();
    setMidiPreviewPlaying(false);
    setMidiAudioStatus("MIDI parado.");
  }

  async function toggleMidiGamePause() {
    const player = midiPlayerRef.current;
    if (!player) return;
    if (playing) {
      player.pause();
      cancelAnimationFrame(animationRef.current);
      setPlaying(false);
      playingRef.current = false;
      setStats((current) => ({ ...current, judgement: "Pausado" }));
      return;
    }
    await playMidi(player.position);
    setPlaying(true);
    playingRef.current = true;
    animationRef.current = requestAnimationFrame(tick);
  }

  function generateImportedPhase() {
    if (!importedSong) return;
    const selection = selectGameplayTracks(importedSong, { mode: gameplaySourceMode, customTrackIds: selectedTrackIds, analysis: songAnalysis });
    const chart = generateChart(importedSong, { trackIds: selection.trackIds, difficulty });
    if (!chart.length) {
      setSongStatus(gameplaySourceMode === "piano" ? "Nenhuma track de piano válida foi encontrada." : "Selecione ao menos uma track válida para gerar o chart.");
      return;
    }
    const sourceNames = selection.trackIds.map((id) => importedSong.tracks.find((track) => track.id === id)?.name).filter(Boolean);
    const nextPhase = {
      title: importedSong.title,
      artist: importedSong.artist,
      difficulty,
      gameplayMode: gameplaySourceMode,
      gameplayTrackIds: selection.trackIds,
      analysisPreset: "default",
      chartMetrics: calculateChartMetrics(chart, importedSong.duration, sourceNames),
      notes: chart,
    };
    setPhase(nextPhase);
    setPhaseSource("song");
    setPhaseStatus(`${chart.length} notas · ${gameplaySourceMode === "essence" ? "Essência" : gameplaySourceMode === "piano" ? "Piano" : "Personalizado"} · ${sourceNames.join(", ")}`);
    cancelAnimationFrame(animationRef.current);
    stopDemoSong();
    stopGameAudio();
    stopMidiAudio();
    setMidiPreviewPlaying(false);
    setPlaying(false);
    playingRef.current = false;
    setStats(blankStats);
    buildNotes(chart);
    setView("game");
  }

  function loadEditorAudio(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (editorAudioUrl) URL.revokeObjectURL(editorAudioUrl);
    setEditorAudioUrl(URL.createObjectURL(file));
    setEditorAudioName(file.name);
    if (!editorTitle.trim()) {
      setEditorTitle(file.name.replace(/\.[^/.]+$/, ""));
    }
  }

  function startEditorRecording() {
    if (!editorAudioRef.current || !editorAudioUrl) return;

    setEditorRecording(true);
    editorRecordingRef.current = true;
    editorAudioRef.current.currentTime = 0;
    editorAudioRef.current.play();
  }

  function stopEditorRecording() {
    setEditorRecording(false);
    editorRecordingRef.current = false;
    editorAudioRef.current?.pause();
  }

  function exportEditorJson() {
    downloadPhase(editorPhase);
  }

  function downloadPhase(value) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${value.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "octobeat-fase"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const editorStatus = editorRecording ? "Gravando" : editorChart.length ? `${editorChart.length} notas gravadas` : editorAudioName;
  const phaseSubtitle = phaseSource === "demo" ? "Demo interna" : `${phase.artist} - ${phase.notes.length} notas`;
  const usingLocalAudio = Boolean(gameAudioUrl);

  return (
    <main className="app-shell">
      <section className="topbar" aria-label="Controles principais">
        <div className="brand">
          <img className="octo-mark" src={octoLogo} alt="Mascote OctoBeat" />
          <div>
            <h1>OctoBeat</h1>
            <p>8 tentaculos, 8 teclas, ritmo direto.</p>
          </div>
        </div>

        <div className="view-tabs" role="tablist" aria-label="Modo">
          <button className={`tab ${view === "music" ? "is-active" : ""}`} onClick={() => setView("music")} role="tab" aria-selected={view === "music"}>Música</button>
          <button className={`tab ${view === "game" ? "is-active" : ""}`} onClick={() => setView("game")} role="tab" aria-selected={view === "game"}>Jogo</button>
          <button className={`tab ${view === "editor" ? "is-active" : ""}`} onClick={() => setView("editor")} role="tab" aria-selected={view === "editor"}>Editor</button>
        </div>
      </section>

      <section className="screen-grid">
        <aside className="score-panel" aria-label="Pontuacao">
          <Metric label="Pontos" value={stats.score} />
          <Metric label="Combo" value={stats.combo} />
          <Metric label="Precisao" value={accuracy} />
          <Metric label="Estado" value={stats.judgement} />
        </aside>

        <section className={`music-wrap ${view === "music" ? "is-visible" : ""}`} aria-label="Importar música">
          <div className="music-hero">
            <span className="eyebrow">COMECE POR AQUI</span>
            <h2>Transforme um MIDI ou MusicXML em uma fase.</h2>
            <p>O OctoBeat procura tracks de piano primeiro. Você pode manter somente a mão/melodia desejada antes de gerar as 8 teclas.</p>
            <label className="primary-action music-file-button">
              {songLoading ? "Lendo a música..." : "Escolher MIDI / MusicXML"}
              <input type="file" accept=".mid,.midi,.musicxml,.xml,application/xml" onChange={loadSymbolicSong} disabled={songLoading} />
            </label>
            <small>Formatos aceitos: .mid, .midi, .musicxml e .xml (MusicXML).</small>
          </div>
          {importedSong && <SongInspector song={importedSong} analysis={songAnalysis} gameplaySourceMode={gameplaySourceMode} onGameplaySourceMode={setGameplaySourceMode} selectedTrackIds={selectedTrackIds} audioTrackIds={audioTrackIds} audioMode={audioMode} audioStatus={midiAudioStatus} previewPlaying={midiPreviewPlaying} onToggle={toggleSongTrack} onToggleAudio={toggleAudioTrack} onMode={setAudioMode} onPreview={previewMidi} onStopPreview={stopMidiPreview} onGenerate={generateImportedPhase} />}
          {!importedSong && <p className="import-status">{songStatus}</p>}
        </section>

        <section className={`stage-wrap ${view === "game" ? "is-visible" : ""}`} aria-label="Jogo">
          <div className="stage-toolbar">
            <div className="playback-controls">
              <button className="primary-action" onClick={startGame}>{playing ? "↻ Reiniciar" : "▶ Iniciar"}</button>
              <button className="ghost-action" onClick={() => resetGame(true)}>↻ Reiniciar</button>
            {phaseSource === "song" && importedSong?.source?.format === "MIDI" && <>
                <button className="ghost-action" onClick={toggleMidiGamePause}>{playing ? "⏸ Pausar" : "▶ Continuar"}</button>
                <button className="ghost-action stop-action" onClick={() => resetGame(true)}>■ Parar</button>
            </>}
            </div>
            <label className="select-label">
              Dificuldade
              <select value={difficulty} onChange={changeDifficulty}>
                <option value="easy">Leve</option>
                <option value="normal">Normal</option>
                <option value="hard">Rapida</option>
              </select>
            </label>
          </div>

          <div className="phase-panel">
            <div className="phase-copy">
              <strong>{phase.title}</strong>
              <span className="song-summary">{phase.notes.length} notas <i>•</i> {phaseSource === "song" ? `${selectedTrackIds.length} tracks` : phaseSubtitle} <i>•</i> {difficulty === "easy" ? "Leve" : difficulty === "hard" ? "Rápida" : "Normal"}</span>
              <span className="song-status">{phaseStatus}</span>
              {phase.chartMetrics && <span className="chart-metrics">{phase.chartMetrics.averageNps.toFixed(2)} NPS média · pico {phase.chartMetrics.peakNps}/s · {phase.chartMetrics.chordCount} acordes · maior acorde {phase.chartMetrics.largestChord}</span>}
              <span className="audio-status">{usingLocalAudio ? gameAudioName : phaseSource === "song" ? "Áudio MIDI integrado" : "Sintetizador interno"}</span>
            </div>
            <div className="phase-actions">
              <label className="file-button">
                Fase JSON
                <input type="file" accept="application/json,.json" onChange={loadPhaseJson} />
              </label>
              <label className="file-button">
                Audio local
                <input type="file" accept="audio/*" onChange={loadGameAudio} />
              </label>
              {phaseSource === "song" && <button className="ghost-action" onClick={() => downloadPhase(phase)}>Exportar JSON</button>}
            </div>
            <audio className="game-audio" ref={gameAudioRef} src={gameAudioUrl} controls={usingLocalAudio} onEnded={() => {
              if (playingRef.current) {
                setPlaying(false);
                playingRef.current = false;
                setStats((current) => ({ ...current, judgement: "Fim" }));
              }
            }}></audio>
          </div>

          <div className="track" ref={trackRef} aria-label="Pista de notas">
            <div className="hand-label hand-label-left">Mão esquerda</div>
            <div className="hand-label hand-label-right">Mão direita</div>
            {KEYS.map((key, lane) => (
              <div className={`lane lane-${lane} ${pressedLanes.includes(lane) ? "is-pressed" : ""}`} key={key.label}>
                <span>{key.label}</span>
              </div>
            ))}
            <div className="hit-line" aria-hidden="true"></div>
            {notes.filter((note) => !note.missed).map((note) => (
              <div
                className={`note ${note.hit ? "is-hit" : ""}`}
                key={note.id}
                style={{
                  "--lane": note.key,
                  "--hand-offset": note.key >= 4 ? "30px" : "0px",
                  "--note-color": KEYS[note.key].color,
                  top: `${note.y}px`,
                }}
              />
            ))}
          </div>
        </section>

        <section className={`editor-wrap ${view === "editor" ? "is-visible" : ""}`} aria-label="Editor de fases">
          <div className="editor-header">
            <div>
              <h2>Importador e editor</h2>
              <p>{importedSong ? songStatus : editorStatus}</p>
            </div>
            <label className="file-button">
              Audio
              <input type="file" accept="audio/*" onChange={loadEditorAudio} />
            </label>
          </div>

          <div className="editor-meta">
            <label>
              Nome da fase
              <input value={editorTitle} onChange={(event) => setEditorTitle(event.target.value)} placeholder="Fase OctoBeat" />
            </label>
            <label>
              Artista
              <input value={editorArtist} onChange={(event) => setEditorArtist(event.target.value)} placeholder="Artista desconhecido" />
            </label>
          </div>

          <audio ref={editorAudioRef} src={editorAudioUrl} controls onEnded={stopEditorRecording}></audio>

          <div className="editor-actions">
            <button className="primary-action" onClick={startEditorRecording} disabled={!editorAudioUrl || editorRecording}>Gravar</button>
            <button className="ghost-action" onClick={stopEditorRecording} disabled={!editorRecording}>Parar</button>
            <button className="ghost-action" onClick={() => setEditorChart([])} disabled={!editorChart.length}>Limpar</button>
            <button className="ghost-action" onClick={exportEditorJson} disabled={!editorChart.length}>Exportar JSON</button>
          </div>

          <div className="record-lanes" aria-label="Teclas gravadas">
            {KEYS.map((key, lane) => (
              <button
                className={flashingEditorLane === lane ? "is-flash" : ""}
                disabled={!editorRecording}
                key={key.label}
                onClick={() => recordEditorNote(lane)}
              >
                {key.label}
              </button>
            ))}
          </div>

          <textarea value={chartOutput} readOnly spellCheck="false" aria-label="JSON da fase"></textarea>
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value }) {
  const icons = { Pontos: "★", Combo: "⚡", Precisao: "◎", Estado: "●" };
  return (
    <div className="metric">
      <span><b>{icons[label]}</b>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SongInspector({ song, analysis, gameplaySourceMode, onGameplaySourceMode, selectedTrackIds, audioTrackIds, audioMode, audioStatus, previewPlaying, onToggle, onToggleAudio, onMode, onPreview, onStopPreview, onGenerate }) {
  const notes = song.tracks.flatMap((track) => track.notes);
  const pitches = notes.map((note) => note.pitch);
  const firstBpm = song.tempoChanges[0]?.bpm ?? 120;
  const analysisById = new Map(analysis?.tracks.map((track) => [track.id, track]) ?? []);
  const musicalTracks = song.tracks.filter((track) => track.notes.length);
  const emptyTracks = song.tracks.filter((track) => !track.notes.length);
  const pianoIds = new Set((analysis?.tracks ?? []).filter((track) => track.noteCount && !track.suspicious && isPianoFamily(track.instrumentFamily)).map((track) => track.id));
  const essenceId = analysis?.selectedTrackId;
  const isCheckedForGameplay = (track) => gameplaySourceMode === "essence" ? track.id === essenceId : gameplaySourceMode === "piano" ? pianoIds.has(track.id) : selectedTrackIds.includes(track.id);
  return (
    <div className="song-inspector">
      <div className="song-metrics">
        <span><b>Formato</b>{song.source?.format}</span>
        <span><b>Duração</b>{song.duration.toFixed(1)}s</span>
        <span><b>BPM</b>{Math.round(firstBpm)}{song.tempoChanges.length > 1 ? ` (+${song.tempoChanges.length - 1})` : ""}</span>
        <span><b>Pitch</b>{Math.min(...pitches)}–{Math.max(...pitches)}</span>
      </div>
      {song.source?.format === "MIDI" && <div className="midi-controls">
        <button className="ghost-action" onClick={onPreview}>{previewPlaying ? "⏸ Pausar MIDI" : "▶ Ouvir MIDI"}</button>
        <button className="ghost-action" onClick={onStopPreview}>■ Parar MIDI</button>
        <label>Modo de áudio <select value={audioMode} onChange={(event) => onMode(event.target.value)}><option value="piano-focus">Destacar piano</option><option value="full">Música completa</option><option value="piano-only">Apenas piano</option></select></label>
        <small>{audioStatus}</small>
      </div>}
      <div className="gameplay-source">
        <strong>Fonte do gameplay</strong>
        <label><input type="radio" name="gameplay-source" value="piano" checked={gameplaySourceMode === "piano"} onChange={(event) => onGameplaySourceMode(event.target.value)} /> Piano</label>
        <label><input type="radio" name="gameplay-source" value="essence" checked={gameplaySourceMode === "essence"} onChange={(event) => onGameplaySourceMode(event.target.value)} /> Essência da música <small>recomendado</small></label>
        <label><input type="radio" name="gameplay-source" value="custom" checked={gameplaySourceMode === "custom"} onChange={(event) => onGameplaySourceMode(event.target.value)} /> Personalizado</label>
      </div>
      <div className="track-list track-list-detailed">
        {musicalTracks.map((track) => {
          const trackAnalysis = analysisById.get(track.id);
          return <label className={`song-track ${trackAnalysis?.suspicious ? "is-suspicious" : ""} ${track.id === essenceId ? "is-essence" : ""}`} key={track.id}>
            <input type="checkbox" checked={audioTrackIds.includes(track.id)} onChange={() => onToggleAudio(track.id)} disabled={!track.notes.length} title="Ouvir" />
            <input type="checkbox" checked={isCheckedForGameplay(track)} onChange={() => onToggle(track.id)} disabled={trackAnalysis?.suspicious} title={trackAnalysis?.suspicious ? "Track suspeita: bloqueada na seleção automática" : "Jogar"} />
            <span><b>{track.name}{track.id === essenceId && <em> Essência</em>}{trackAnalysis?.suspicious && <em className="warning"> Suspeita</em>}</b><small>{track.family} · {track.instrument} · {track.notes.length} notas · {(trackAnalysis?.notesPerSecond ?? 0).toFixed(1)} NPS</small></span>
          </label>;
        })}
      </div>
      <div className="track-legend"><span>1º checkbox: Ouvir</span><span>2º checkbox: Jogar</span></div>
      <button className="primary-action" onClick={onGenerate}>Gerar chart e abrir o jogo</button>
      <details className="analysis-panel">
        <summary>Mostrar análise avançada ({analysis?.candidates.length ?? 0} candidatas)</summary>
        <div className="analysis-ranking">
          {(analysis?.tracks ?? []).filter((track) => track.noteCount).sort((a, b) => b.melodyScore - a.melodyScore).map((track, index) => (
            <article key={track.id} className={track.suspicious ? "is-suspicious" : ""}>
              <header><strong>#{index + 1} {track.name}</strong><b>{Number.isFinite(track.melodyScore) ? track.melodyScore.toFixed(1) : "—"}</b></header>
              <p>{track.instrumentFamily} · {track.noteCount} notas · {track.notesPerSecond.toFixed(2)} NPS · mono {(track.monophonyRatio * 100).toFixed(0)}%</p>
              <p>pitch {track.averagePitch?.toFixed(1)} · velocity {track.averageVelocity?.toFixed(2)} · duração {track.averageNoteDuration?.toFixed(3)}s</p>
              <code>{track.scoreReasons.join(" · ")}</code>
            </article>
          ))}
        </div>
        {emptyTracks.length > 0 && <p className="empty-track-note">{emptyTracks.length} track(s) com zero notas foram ignoradas: {emptyTracks.map((track) => track.name).join(", ")}</p>}
      </details>
      <details><summary>Primeiras notas interpretadas</summary><code>{JSON.stringify(notes.slice(0, 12), null, 2)}</code></details>
    </div>
  );
}
