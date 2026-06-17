import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

function judge(delta) {
  const absolute = Math.abs(delta);
  if (absolute <= 0.055) return { label: "Perfeito", score: 1000 };
  if (absolute <= 0.115) return { label: "Bom", score: 650 };
  if (absolute <= 0.18) return { label: delta > 0 ? "Atrasado" : "Cedo", score: 300 };
  return null;
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
  const [view, setView] = useState("game");
  const [difficulty, setDifficulty] = useState("normal");
  const [playing, setPlaying] = useState(false);
  const [notes, setNotes] = useState(() => createChart("normal").map((note, id) => ({ ...note, id, y: -40, hit: false, missed: false })));
  const [pressedLane, setPressedLane] = useState(null);
  const [stats, setStats] = useState(blankStats);
  const [editorAudioUrl, setEditorAudioUrl] = useState("");
  const [editorAudioName, setEditorAudioName] = useState("Nenhum audio carregado");
  const [editorRecording, setEditorRecording] = useState(false);
  const [editorChart, setEditorChart] = useState([]);
  const [flashingEditorLane, setFlashingEditorLane] = useState(null);

  const trackRef = useRef(null);
  const editorAudioRef = useRef(null);
  const animationRef = useRef(0);
  const startAtRef = useRef(0);
  const playingRef = useRef(false);
  const notesRef = useRef(notes);
  const audioContextRef = useRef(null);
  const audioNodesRef = useRef([]);
  const editorRecordingRef = useRef(false);

  const accuracy = stats.total ? `${Math.round((stats.hits / stats.total) * 100)}%` : "0%";
  const chartOutput = useMemo(() => JSON.stringify(editorChart, null, 2), [editorChart]);

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

  const buildNotes = useCallback((mode = difficulty) => {
    const chart = createChart(mode);
    const nextNotes = chart.map((note, id) => ({ ...note, id, y: -40, hit: false, missed: false }));
    setNotes(nextNotes);
    notesRef.current = nextNotes;
    return nextNotes;
  }, [difficulty]);

  const resetGame = useCallback((keepReady = true) => {
    cancelAnimationFrame(animationRef.current);
    stopDemoSong();
    setPlaying(false);
    playingRef.current = false;
    setStats(blankStats);
    if (keepReady) {
      buildNotes();
    } else {
      setNotes([]);
      notesRef.current = [];
    }
  }, [buildNotes, stopDemoSong]);

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
    const time = nowSeconds() - startAtRef.current;
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
      setPlaying(false);
      playingRef.current = false;
      setStats((current) => ({ ...current, judgement: "Fim" }));
      return;
    }

    animationRef.current = requestAnimationFrame(tick);
  }, []);

  const startGame = useCallback(() => {
    resetGame(false);
    const nextNotes = buildNotes();
    setStats(blankStats);
    setPlaying(true);
    playingRef.current = true;
    startDemoSong(nextNotes);
    animationRef.current = requestAnimationFrame(tick);
  }, [buildNotes, resetGame, startDemoSong, tick]);

  const recordEditorNote = useCallback((lane) => {
    const time = Number(editorAudioRef.current?.currentTime.toFixed(3));
    if (!Number.isFinite(time)) return;

    setEditorChart((current) => [...current, { time, key: lane }].sort((a, b) => a.time - b.time || a.key - b.key));
    setFlashingEditorLane(lane);
    window.setTimeout(() => setFlashingEditorLane(null), 110);
  }, []);

  const pressLane = useCallback((lane) => {
    setPressedLane(lane);
    window.setTimeout(() => setPressedLane(null), 90);

    if (view === "editor" && editorRecordingRef.current) {
      recordEditorNote(lane);
      return;
    }

    if (!playingRef.current) return;

    const time = nowSeconds() - startAtRef.current;
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

    const { note, delta } = candidates[0];
    const result = judge(delta);
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
  }, [recordEditorNote, view]);

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

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animationRef.current);
      stopDemoSong();
      if (editorAudioUrl) URL.revokeObjectURL(editorAudioUrl);
    };
  }, [editorAudioUrl, stopDemoSong]);

  function changeDifficulty(event) {
    const nextDifficulty = event.target.value;
    setDifficulty(nextDifficulty);
    cancelAnimationFrame(animationRef.current);
    stopDemoSong();
    setPlaying(false);
    playingRef.current = false;
    setStats(blankStats);
    buildNotes(nextDifficulty);
  }

  function loadEditorAudio(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (editorAudioUrl) URL.revokeObjectURL(editorAudioUrl);
    setEditorAudioUrl(URL.createObjectURL(file));
    setEditorAudioName(file.name);
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
    const blob = new Blob([JSON.stringify(editorChart, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "octobeat-fase.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const editorStatus = editorRecording ? "Gravando" : editorChart.length ? `${editorChart.length} notas gravadas` : editorAudioName;

  return (
    <main className="app-shell">
      <section className="topbar" aria-label="Controles principais">
        <div className="brand">
          <div className="octo-mark" aria-hidden="true">
            {Array.from({ length: 8 }).map((_, index) => <span key={index}></span>)}
          </div>
          <div>
            <h1>OctoBeat</h1>
            <p>8 tentaculos, 8 teclas, ritmo direto.</p>
          </div>
        </div>

        <div className="view-tabs" role="tablist" aria-label="Modo">
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

        <section className={`stage-wrap ${view === "game" ? "is-visible" : ""}`} aria-label="Jogo">
          <div className="stage-toolbar">
            <button className="primary-action" onClick={startGame}>{playing ? "Reiniciar" : "Iniciar"}</button>
            <button className="ghost-action" onClick={() => resetGame(true)}>Reiniciar</button>
            <label className="select-label">
              Dificuldade
              <select value={difficulty} onChange={changeDifficulty}>
                <option value="easy">Leve</option>
                <option value="normal">Normal</option>
                <option value="hard">Rapida</option>
              </select>
            </label>
          </div>

          <div className="track" ref={trackRef} aria-label="Pista de notas">
            {KEYS.map((key, lane) => (
              <div className={`lane ${pressedLane === lane ? "is-pressed" : ""}`} key={key.label}>
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
              <h2>Editor</h2>
              <p>{editorStatus}</p>
            </div>
            <label className="file-button">
              Audio
              <input type="file" accept="audio/*" onChange={loadEditorAudio} />
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
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
