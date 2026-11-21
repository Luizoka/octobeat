// Roda o pipeline de geração de charts sobre o corpus de teste e imprime métricas.
//
//   node scripts/evaluateCharts.js                 # avalia e compara com o baseline, se existir
//   node scripts/evaluateCharts.js --save          # grava o resultado como novo baseline
//   node scripts/evaluateCharts.js --baseline x.json
//   node scripts/evaluateCharts.js --json          # imprime o resultado bruto em JSON
//
// Corpus: todos os .mid/.midi de test-songs/ + as músicas do jogo em songs/.
// MusicXML é ignorado aqui porque o importador depende de DOMParser (só existe no navegador).

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { importMidi } from "../src/music/midi/importMidi.js";
import { selectGameplayTracks } from "../src/music-analysis/selectGameplayTracks.js";
import { generateChart } from "../src/chart/generateChart.js";
import { evaluateChart } from "../src/chart/chartQuality.js";

const ROOT = process.cwd();
const SONG_DIR = join(ROOT, "test-songs");
const GAME_SONG_DIR = join(ROOT, "songs");
const DEFAULT_BASELINE = join(SONG_DIR, "baseline.json");
const MODES = ["essence", "piano"];
const DIFFICULTIES = ["easy", "normal", "hard"];

// Métricas exibidas: [chave, cabeçalho, formatação, "maior é melhor?" (null = neutro)]
const count = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const COLUMNS = [
  ["noteCount", "Notas", count, null],
  ["averageNps", "NPS", (v) => v.toFixed(1), null],
  ["peakNps", "Pico", (v) => v.toFixed(0), null],
  ["onBeatRatio", "Beat%", (v) => (v * 100).toFixed(0), true],
  ["beatRecall", "Cob%", (v) => (v * 100).toFixed(0), true],
  ["laneEntropy", "Entr", (v) => v.toFixed(2), true],
  ["sameLaneRepeatRatio", "Rep%", (v) => (v * 100).toFixed(0), false],
  ["jacks", "Jacks", count, false],
  ["sameHandTriples", "Mão3", count, false],
  ["unplayable", "Injog", count, false],
  ["holdRatio", "Hold%", (v) => (v * 100).toFixed(0), null],
  ["holdConflicts", "HConf", count, false],
];

function parseArgs(argv) {
  const args = { save: false, json: false, baseline: DEFAULT_BASELINE };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--save") args.save = true;
    else if (argv[index] === "--json") args.json = true;
    else if (argv[index] === "--baseline") args.baseline = join(ROOT, argv[++index]);
  }
  return args;
}

function listMidis(dir) {
  return existsSync(dir)
    ? readdirSync(dir).filter((file) => /\.(mid|midi)$/i.test(file)).sort().map((file) => join(dir, file))
    : [];
}

function listSongs() {
  return [...listMidis(SONG_DIR), ...listMidis(GAME_SONG_DIR)];
}

async function loadMidi(path) {
  const bytes = readFileSync(path);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return importMidi({ name: basename(path), arrayBuffer: async () => buffer });
}

async function evaluateCorpus() {
  const rows = [];
  for (const path of listSongs()) {
    const song = await loadMidi(path);
    for (const mode of MODES) {
      const { trackIds, segments } = selectGameplayTracks(song, { mode });
      const tracks = song.tracks.filter((track) => trackIds.includes(track.id));
      // Cobertura é medida contra a música inteira (bateria inclusa), não só contra
      // as tracks escolhidas: a pergunta é "o chart acompanha os beats que soam?".
      const sourceNotes = song.tracks.flatMap((track) => track.notes);
      for (const difficulty of DIFFICULTIES) {
        const chart = trackIds.length ? generateChart(song, { trackIds, segments, difficulty }) : [];
        const metrics = evaluateChart(chart, { tempoChanges: song.tempoChanges, sourceNotes });
        rows.push({ song: song.title, mode, difficulty, tracks: tracks.map((track) => track.name), metrics });
      }
    }
  }
  return rows;
}

const rowKey = (row) => `${row.song}|${row.mode}|${row.difficulty}`;

function formatCell([key, , format, higherIsBetter], metrics, baseline) {
  const value = format(metrics[key]);
  // Métricas novas não existem em baselines antigos.
  if (!baseline || baseline[key] == null) return value;
  const before = format(baseline[key]);
  if (before === value) return value;
  const delta = metrics[key] - baseline[key];
  const better = higherIsBetter == null ? "" : (delta > 0) === higherIsBetter ? "▲" : "▼";
  return `${before}→${value}${better}`;
}

function printTable(headers, lines) {
  const widths = headers.map((header, column) => Math.max(header.length, ...lines.map((line) => line[column].length)));
  const render = (cells) => cells.map((cell, column) => (column < 3 ? cell.padEnd(widths[column]) : cell.padStart(widths[column]))).join("  ");
  console.log(render(headers));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  lines.forEach((line) => console.log(render(line)));
}

function average(rows, key) {
  const values = rows.map((row) => row.metrics[key]).filter((value) => value != null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
}

function summarize(rows) {
  const groups = [];
  for (const mode of MODES) {
    for (const difficulty of DIFFICULTIES) {
      const selected = rows.filter((row) => row.mode === mode && row.difficulty === difficulty && row.metrics.noteCount > 0);
      if (!selected.length) continue;
      const metrics = Object.fromEntries(COLUMNS.map(([key]) => [key, average(selected, key)]));
      groups.push({ song: `MÉDIA (${selected.length})`, mode, difficulty, metrics });
    }
  }
  return groups;
}

const args = parseArgs(process.argv.slice(2));
const rows = await evaluateCorpus();

if (args.json) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const baselineRows = !args.save && existsSync(args.baseline) ? JSON.parse(readFileSync(args.baseline, "utf8")) : null;
  const baselineByKey = new Map((baselineRows ?? []).map((row) => [rowKey(row), row.metrics]));
  const baselineSummary = new Map(baselineRows ? summarize(baselineRows).map((row) => [rowKey(row), row.metrics]) : []);
  const headers = ["Música", "Modo", "Dif", ...COLUMNS.map(([, header]) => header)];
  const toLine = (row, baseline) => [row.song.slice(0, 28), row.mode, row.difficulty, ...COLUMNS.map((column) => formatCell(column, row.metrics, baseline))];

  if (baselineRows) console.log(`Comparando com ${basename(args.baseline)} (antes→depois, ▲ melhor, ▼ pior)\n`);
  printTable(headers, rows.map((row) => toLine(row, baselineByKey.get(rowKey(row)))));
  console.log("");
  printTable(headers, summarize(rows).map((row) => toLine(row, baselineSummary.get(rowKey(row)))));

  console.log("\nTracks usadas:");
  rows.filter((row) => row.difficulty === "normal").forEach((row) => {
    console.log(`  ${row.song.slice(0, 28).padEnd(28)}  ${row.mode.padEnd(7)}  ${row.tracks.join(", ") || "(nenhuma)"}`);
  });
  console.log("\nLegenda: Beat% notas no tempo · Cob% beats com onset (qualquer track) cobertos pelo chart · Entr entropia das lanes (0–1)");
  console.log("         Rep% notas seguidas na mesma lane · Jacks mesma lane < 0,25 s · Mão3 acordes 3+ numa mão · Injog Mão3 em alta velocidade");
}

if (args.save) {
  writeFileSync(args.baseline, `${JSON.stringify(rows, null, 2)}\n`);
  console.log(`\nBaseline salvo em ${basename(args.baseline)}`);
}
