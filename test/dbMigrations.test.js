import assert from "node:assert/strict";
import test from "node:test";
import { checksum, listMigrations, planMigrations } from "../scripts/db/migrations.js";

const files = [
  { name: "002_profiles.sql", sql: "select 2;" },
  { name: "001_leaderboard.sql", sql: "select 1;" },
  { name: "010_identity.sql", sql: "select 10;" },
];

test("lista migrações em ordem numérica e valida nomes", () => {
  assert.deepEqual(listMigrations(files).map((m) => m.version), ["001", "002", "010"]);
  assert.throws(() => listMigrations([{ name: "1_x.sql", sql: "" }]), /inválido/);
  assert.throws(() => listMigrations([{ name: "004_Maiuscula.sql", sql: "" }]), /inválido/);
  assert.throws(() => listMigrations([{ name: "004_a.sql", sql: "" }, { name: "004_b.sql", sql: "" }]), /repetido/);
});

test("checksum ignora CRLF x LF", () => {
  assert.equal(checksum("a\r\nb\r\n"), checksum("a\nb\n"));
  assert.notEqual(checksum("a"), checksum("b"));
});

test("planeja só as pendentes e recusa migração aplicada que mudou", () => {
  const migrations = listMigrations(files);
  const applied = migrations.slice(0, 2).map(({ version, name, checksum }) => ({ version, name, checksum }));
  assert.deepEqual(planMigrations(migrations, applied), { pending: [migrations[2]], errors: [] });

  const edited = [{ ...applied[0], checksum: "outro" }, applied[1]];
  assert.match(planMigrations(migrations, edited).errors[0], /já foi aplicada e o arquivo mudou/);
});

test("recusa migração sumida do repositório e migração nova com número antigo", () => {
  const migrations = listMigrations(files);
  const ghost = [{ version: "099", name: "099_x.sql", checksum: "x" }];
  assert.match(planMigrations(migrations, ghost).errors.join(), /não existe no repositório/);

  const appliedOnly10 = [{ version: "010", name: "010_identity.sql", checksum: migrations[2].checksum }];
  const { errors } = planMigrations(migrations, appliedOnly10);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /anterior à última aplicada/);
});
