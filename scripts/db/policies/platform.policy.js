import assert from "node:assert/strict";

// Guardas gerais: valem para qualquer módulo novo. Se uma destas falhar depois
// de uma migração, ou a migração esqueceu RLS/REVOKE, ou a função nova precisa
// entrar conscientemente na lista abaixo (e em docs/architecture.md).

/** Funções que o navegador pode chamar, por papel da Data API. */
export const PUBLIC_RPC = {
  anonymous: [
    "get_global_leaderboard", "get_leaderboard", "get_player_profile",
    "login", "logout", "register", "submit_score",
  ],
  authenticated: [],
};

export default async function platformPolicies({ client, check }) {
  await check("toda tabela de public tem RLS ligado", async () => {
    const { rows } = await client.query(`
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
      ORDER BY 1`);
    assert.deepEqual(rows.map((row) => row.relname), [], "tabelas sem RLS");
  });

  for (const [role, allowed] of Object.entries(PUBLIC_RPC)) {
    await check(`${role} só executa as funções públicas permitidas`, async () => {
      const exists = (await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role])).rowCount;
      if (!exists) return;
      // Só funções do projeto (extensões como pgcrypto ficam de fora).
      const { rows } = await client.query(`
        SELECT DISTINCT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
          AND has_function_privilege($1, p.oid, 'EXECUTE')
        ORDER BY 1`, [role]);
      assert.deepEqual(rows.map((row) => row.proname), [...allowed].sort());
    });
  }

  await check("schema ops (controle de migrações) é inacessível pela API", async () => {
    for (const role of ["anonymous", "authenticated"]) {
      const { rows: [{ usage }] } = await client.query("SELECT has_schema_privilege($1, 'ops', 'USAGE') AS usage", [role]);
      assert.equal(usage, false, `${role} tem USAGE em ops`);
    }
  });
}
