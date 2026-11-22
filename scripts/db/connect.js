import { readFile } from "node:fs/promises";
import pg from "pg";

export async function connectDb() {
  let connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    const env = await readFile(new URL("../../.env", import.meta.url), "utf8").catch((error) => {
      if (error.code === "ENOENT") return "";
      throw error;
    });
    const value = env.match(/^\s*DATABASE_URL[ \t]*=[ \t]*([^\r\n]*)/m)?.[1].trim();
    connectionString = value?.replace(/^(["'])(.*)\1$/, "$2");
  }
  if (!connectionString) throw new Error("Configure DATABASE_URL no arquivo .env.");
  // Scripts usam a conexão DIRETA, não o pooler do Neon (PgBouncer em modo
  // transação): o db:migrate segura uma trava de sessão (pg_advisory_lock) e os
  // testes de políticas trocam de papel; no pooler cada transação pode cair em
  // outro processo do servidor. Mesmo usuário/senha, só sem "-pooler" no host.
  connectionString = connectionString.replace(/(@[^/@]*?)-pooler\./, "$1.");
  const client = new pg.Client({ connectionString });
  await client.connect();
  return client;
}
