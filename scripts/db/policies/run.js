// npm run db:test-policies            → roda todas as suítes *.policy.js
// npm run db:test-policies -- ranking → só as suítes cujo nome contém "ranking"
//
// Cada suíte exporta `default async ({ client, check, suffix })` e roda isolada:
// numa transação revertida (uso normal) ou num SAVEPOINT revertido (quando já
// existe uma transação aberta, como no `db:migrate -- --dry-run`). Nada fica no banco.
// `check(rótulo, fn, { keep })`: cada verificação roda num SAVEPOINT; com
// `keep: true` os dados criados ficam disponíveis para as próximas.
// Para simular visitante/jogador: SET LOCAL ROLE + claims do JWT em
// `request.jwt.claims` (ver identity.policy.js).
import { randomBytes } from "node:crypto";
import { readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { connectDb } from "../connect.js";

const dir = new URL("./", import.meta.url);

async function runSuite(client, name, suite, { inTransaction }) {
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
  await client.query(inTransaction ? "SAVEPOINT policy_suite" : "BEGIN");
  try {
    await suite({ client, check, suffix: randomBytes(6).toString("hex") });
  } catch (error) {
    console.error(`  ✘ suíte interrompida: ${error.message}`);
    failed++;
  } finally {
    await client.query(inTransaction ? "ROLLBACK TO SAVEPOINT policy_suite" : "ROLLBACK");
    await client.query("RESET ROLE");
  }
  return failed;
}

/** Roda as suítes no `client`. Devolve o número de verificações que falharam. */
export async function runPolicySuites(client, { filter = "", inTransaction = false } = {}) {
  const files = (await readdir(dir)).filter((file) => file.endsWith(".policy.js") && file.includes(filter)).sort();
  if (!files.length) throw new Error(`nenhuma suíte encontrada${filter ? ` com "${filter}"` : ""}`);
  let failed = 0;
  for (const file of files) {
    const { default: suite } = await import(new URL(file, dir));
    failed += await runSuite(client, file.replace(".policy.js", ""), suite, { inTransaction });
  }
  console.log(failed ? `\n✘ ${failed} verificação(ões) falharam` : "\n✔ Todas as políticas ok");
  return failed;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const client = await connectDb();
    try {
      if (await runPolicySuites(client, { filter: process.argv[2] ?? "" })) process.exitCode = 1;
    } finally {
      await client.end();
    }
  } catch (error) {
    console.error(`✘ Teste de políticas: ${error.message}`);
    process.exitCode = 1;
  }
}
