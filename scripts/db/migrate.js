// npm run db:migrate            → aplica migrações pendentes + seeds
// npm run db:migrate -- --status → só mostra o que está aplicado/pendente
//
// Regras em scripts/db/migrations.js e docs/architecture.md (seção Banco).
import { readdir, readFile } from "node:fs/promises";
import { connectDb } from "./connect.js";
import { listMigrations, planMigrations } from "./migrations.js";

const root = new URL("../../db/", import.meta.url);
const statusOnly = process.argv.includes("--status");

async function readSqlDir(sub) {
  const dir = new URL(`${sub}/`, root);
  const names = (await readdir(dir).catch(() => [])).filter((name) => name.endsWith(".sql")).sort();
  return Promise.all(names.map(async (name) => ({ name, sql: await readFile(new URL(name, dir), "utf8") })));
}

// Schema `ops` não é exposto pela Data API (só `public` é) e não tem grants.
const SETUP = `
  CREATE SCHEMA IF NOT EXISTS ops;
  REVOKE ALL ON SCHEMA ops FROM PUBLIC;
  CREATE TABLE IF NOT EXISTS ops.schema_migrations (
    version text PRIMARY KEY,
    name text NOT NULL,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  );`;

// Bancos criados antes deste executor (001–003 aplicadas pelo script antigo,
// que reaplicava tudo): registra essas como já aplicadas, sem rodar de novo.
const LEGACY_BASELINE = ["001", "002", "003"];

async function main() {
  const migrations = listMigrations(await readSqlDir("migrations"));
  const seeds = await readSqlDir("seeds");
  const client = await connectDb();
  try {
    await client.query("SELECT pg_advisory_lock(hashtextextended('octobeat:migrate', 0))");
    await client.query(SETUP);

    let { rows: applied } = await client.query("SELECT version, name, checksum FROM ops.schema_migrations ORDER BY version");
    if (!applied.length) {
      const { rows: [{ legacy }] } = await client.query("SELECT to_regclass('public.ranked_charts') IS NOT NULL AS legacy");
      if (legacy) {
        const baseline = migrations.filter((migration) => LEGACY_BASELINE.includes(migration.version));
        for (const { version, name, checksum } of statusOnly ? [] : baseline) {
          await client.query("INSERT INTO ops.schema_migrations (version, name, checksum) VALUES ($1, $2, $3)", [version, name, checksum]);
        }
        console.log(`• Banco antigo detectado: ${baseline.map((m) => m.name).join(", ")} registradas como aplicadas.`);
        applied = baseline.map(({ version, name, checksum }) => ({ version, name, checksum }));
      }
    }

    const { pending, errors } = planMigrations(migrations, applied);
    for (const row of applied) console.log(`✔ ${row.name} (aplicada)`);
    for (const migration of pending) console.log(`${statusOnly ? "…" : "→"} ${migration.name} (pendente)`);
    if (errors.length) throw new Error(errors.join("\n  "));
    if (statusOnly) return;

    for (const migration of pending) {
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query("INSERT INTO ops.schema_migrations (version, name, checksum) VALUES ($1, $2, $3)",
          [migration.version, migration.name, migration.checksum]);
        await client.query("COMMIT");
        console.log(`✔ ${migration.name} aplicada`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`${migration.name}: ${error.message}`);
      }
    }

    await client.query("BEGIN");
    try {
      for (const seed of seeds) await client.query(seed.sql);
      await client.query("COMMIT");
      for (const seed of seeds) console.log(`✔ seed ${seed.name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`seeds: ${error.message}`);
    }

    // O Neon não aceita `NOTIFY pgrst` (testado): a Data API só enxerga funções
    // novas/alteradas depois do botão no painel. Sem isso, o RPC devolve 404.
    if (pending.length) console.log("\n⚠ No Neon: Data API → \"Refresh schema cache\" (senão as funções novas dão 404).");
    else console.log("\nNada pendente.");
  } finally {
    await client.end();
  }
}

try {
  await main();
} catch (error) {
  console.error(`✘ Migração: ${error.message}`);
  process.exitCode = 1;
}
