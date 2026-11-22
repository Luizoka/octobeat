// Planejamento de migrações — puro, sem banco (testado em test/dbMigrations.test.js).
//
// Regras:
// - Arquivos em db/migrations/ chamados `NNN_descricao.sql` (NNN = 3+ dígitos).
//   Rodam UMA vez, em ordem, e ficam registrados em ops.schema_migrations.
// - Migração já aplicada é imutável: se o conteúdo mudar (checksum), o plano
//   falha. Para alterar algo, crie uma migração nova.
// - db/seeds/*.sql são repetíveis (idempotentes) e rodam em todo `db:migrate`.

import { createHash } from "node:crypto";

const MIGRATION_NAME = /^(\d{3,})_[a-z0-9_]+\.sql$/;

/** Checksum estável: ignora diferença de quebra de linha (CRLF x LF). */
export function checksum(sql) {
  return createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex").slice(0, 16);
}

/** Valida nomes e ordena por número. `files`: [{ name, sql }]. */
export function listMigrations(files) {
  const migrations = files.map(({ name, sql }) => {
    const match = MIGRATION_NAME.exec(name);
    if (!match) throw new Error(`Nome de migração inválido: ${name} (use NNN_descricao.sql, minúsculas)`);
    return { version: match[1], name, sql, checksum: checksum(sql) };
  });
  migrations.sort((a, b) => Number(a.version) - Number(b.version));
  for (let i = 1; i < migrations.length; i++) {
    if (migrations[i].version === migrations[i - 1].version) {
      throw new Error(`Número de migração repetido: ${migrations[i - 1].name} e ${migrations[i].name}`);
    }
  }
  return migrations;
}

/**
 * Decide o que rodar. `applied`: [{ version, name, checksum }] do banco.
 * Devolve { pending, errors }. Com erros, nada deve ser aplicado.
 */
export function planMigrations(migrations, applied) {
  const errors = [];
  const byVersion = new Map(migrations.map((migration) => [migration.version, migration]));
  for (const row of applied) {
    const local = byVersion.get(row.version);
    if (!local) errors.push(`Migração ${row.name} está aplicada no banco mas não existe no repositório.`);
    else if (local.checksum !== row.checksum) {
      errors.push(`Migração ${local.name} já foi aplicada e o arquivo mudou. Crie uma migração nova em vez de editar.`);
    }
  }
  const appliedVersions = new Set(applied.map((row) => row.version));
  const pending = migrations.filter((migration) => !appliedVersions.has(migration.version));
  const lastApplied = Math.max(-1, ...applied.map((row) => Number(row.version)));
  for (const migration of pending) {
    if (Number(migration.version) < lastApplied) {
      errors.push(`Migração ${migration.name} é anterior à última aplicada (${String(lastApplied).padStart(3, "0")}). Renumere-a.`);
    }
  }
  return { pending, errors };
}
