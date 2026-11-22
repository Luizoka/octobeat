import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { generateChart } from "../src/chart/generateChart.js";
import { adaptNotesForHands } from "../src/game/adaptNotesForHands.js";
import { normalizeNotes } from "../src/game/normalizeNotes.js";
import { maxScore } from "../src/game/scoring.js";
import { importMidi } from "../src/music/midi/importMidi.js";
import { analyzeSong } from "../src/music-analysis/analyzeSong.js";
import { selectGameplayTracks } from "../src/music-analysis/selectGameplayTracks.js";
import { SONG_CATALOG } from "../src/songs/catalog.js";

const rankedDir = new URL("../public/ranked/", import.meta.url);
const dbDir = new URL("../db/", import.meta.url);
const difficulties = ["easy", "normal", "hard"];
const index = [];
const seed = [];
const sqlText = (value) => "'" + value.replaceAll("'", "''") + "'";

for (const { id: slug, url, file, title, artist } of SONG_CATALOG) {
  const bytes = await readFile(new URL(url));
  const imported = await importMidi({
    name: file,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  });
  const song = { ...imported, title, artist };
  const { trackIds, segments } = selectGameplayTracks(song, { mode: "essence", analysis: analyzeSong(song) });
  if (!trackIds.length) throw new Error(`Nenhuma track jogável em ${title}.`);
  const songDir = new URL(`${slug}/`, rankedDir);
  await mkdir(songDir, { recursive: true });

  for (const difficulty of difficulties) {
    const chart = generateChart(song, { trackIds, segments, difficulty });
    const notes = normalizeNotes(adaptNotesForHands(chart, "both"));
    if (!notes.length) throw new Error(`Nenhuma nota em ${title} (${difficulty}).`);
    const chartVersion = createHash("sha256").update(JSON.stringify(notes)).digest("hex").slice(0, 12);
    const metadata = { slug, difficulty, chartVersion, noteCount: notes.length, maxScore: maxScore(notes) };
    await writeFile(new URL(`${difficulty}.json`, songDir), JSON.stringify({ ...metadata, notes }) + "\n");
    index.push({ ...metadata, title });
    const row = [slug, difficulty, chartVersion, title].map(sqlText).concat(metadata.noteCount, metadata.maxScore);
    seed.push(`  (${row.join(", ")})`);
  }
}

await writeFile(new URL("index.json", rankedDir), JSON.stringify(index, null, 2) + "\n");
await mkdir(dbDir, { recursive: true });
await writeFile(new URL("seed_ranked_charts.sql", dbDir), [
  "-- Gerado por npm run ranked:freeze.",
  "INSERT INTO public.ranked_charts (song_slug, difficulty, chart_version, title, note_count, max_score)",
  "VALUES",
  seed.join(",\n"),
  "ON CONFLICT (song_slug, difficulty, chart_version) DO NOTHING;",
  "",
].join("\n"));
console.log(`${index.length} charts congelados em public/ranked.`);
