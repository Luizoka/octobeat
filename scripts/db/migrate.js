import { readdir, readFile } from "node:fs/promises";
import { connectDb } from "./connect.js";

const dir = new URL("../../db/", import.meta.url);
try {
  const files = (await readdir(dir)).filter((file) => file.endsWith(".sql")).sort();
  const client = await connectDb();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('octobeat:migrate', 0))");
    for (const file of files) {
      await client.query(await readFile(new URL(file, dir), "utf8"));
    }
    await client.query("COMMIT");
    for (const file of files) console.log(`✔ ${file}`);
    // O Neon não aceita `NOTIFY pgrst` (testado): a Data API só enxerga funções
    // novas/alteradas depois do botão no painel. Sem isso, o RPC devolve 404.
    console.log("\n⚠ No Neon: Data API → \"Refresh schema cache\" (senão as funções novas dão 404).");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
} catch (error) {
  console.error(`✘ Migração: ${error.message}`);
  process.exitCode = 1;
}
