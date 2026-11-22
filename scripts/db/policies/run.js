// npm run db:test-policies            → roda todas as suítes *.policy.js
// npm run db:test-policies -- ranking → só as suítes cujo nome contém "ranking"
//
// Cada suíte exporta `default async ({ client, check, suffix })` e roda dentro
// de UMA transação que sempre é revertida no fim (nada fica no banco).
// `check(rótulo, fn, { keep })`: cada verificação roda num SAVEPOINT; com
// `keep: true` os dados criados ficam disponíveis para as próximas.
// Para testar como visitante/jogador, a suíte faz `SET LOCAL ROLE ...` (e, para
// jogador logado, define as claims do JWT — ver docs/architecture.md).
import { randomBytes } from "node:crypto";
import { readdir } from "node:fs/promises";
import { connectDb } from "../connect.js";

const dir = new URL("./", import.meta.url);
const filter = process.argv[2] ?? "";

async function runSuite(client, name, suite) {
  let failed = 0;
  async function check(label, run, { keep = false } = {}) {
    await client.query("SAVEPOINT policy_check");
    try {
      const result = await run();
      if (!keep) await client.query("ROLLBACK TO SAVEPOINT policy_check");
      console.log(`  ✔ ${label}`);
      return result;
    } catch (error) {
      await client.query("ROLLBACK TO SAVEPOINT policy_check");
      console.error(`  ✘ ${label}: ${error.message}`);
      failed++;
    } finally {
      await client.query("RELEASE SAVEPOINT policy_check");
    }
  }
  console.log(`\n${name}`);
  await client.query("BEGIN");
  try {
    await suite({ client, check, suffix: randomBytes(6).toString("hex") });
  } catch (error) {
    console.error(`  ✘ suíte interrompida: ${error.message}`);
    failed++;
  } finally {
    await client.query("ROLLBACK");
  }
  return failed;
}

try {
  const files = (await readdir(dir)).filter((file) => file.endsWith(".policy.js") && file.includes(filter)).sort();
  if (!files.length) throw new Error(`nenhuma suíte encontrada${filter ? ` com "${filter}"` : ""}`);
  const client = await connectDb();
  let failed = 0;
  try {
    for (const file of files) {
      const { default: suite } = await import(new URL(file, dir));
      failed += await runSuite(client, file.replace(".policy.js", ""), suite);
    }
  } finally {
    await client.end();
  }
  console.log(failed ? `\n✘ ${failed} verificação(ões) falharam` : "\n✔ Todas as políticas ok");
  if (failed) process.exitCode = 1;
} catch (error) {
  console.error(`✘ Teste de políticas: ${error.message}`);
  process.exitCode = 1;
}
