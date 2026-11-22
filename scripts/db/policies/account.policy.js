import assert from "node:assert/strict";

// Exclusão da própria conta (migração 005). Mesma simulação de papéis da
// suíte identity: claims do JWT em request.jwt.claims + SET LOCAL ROLE.
const DOMAIN = "contas.octobeat.luizoka.dev";
const raised = (message) => ({ code: "P0001", message });

export default async function accountPolicies({ client, check, suffix }) {
  const q = (sql, params) => client.query(sql, params);
  const one = async (sql, params) => (await q(sql, params)).rows[0];
  async function as(role, sub = null) {
    await q("RESET ROLE");
    await q("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify(sub ? { sub, role } : { role })]);
    // Simulação via request.jwt.claims: o pg_session_jwt às vezes não a enxerga se a
    // 1ª leitura acontece já sob o papel da API. Ler uma vez como dono estabiliza.
    // (Só nos testes: em produção a Data API entrega o JWT por outro caminho.)
    await q("SELECT auth.uid()");
    await q(`SET LOCAL ROLE ${role}`);
  }
  async function rejects(run, expected) {
    await q("SAVEPOINT expect_error");
    try {
      await assert.rejects(run(), expected);
    } finally {
      await q("ROLLBACK TO SAVEPOINT expect_error");
      await q("RELEASE SAVEPOINT expect_error");
    }
  }
  const exists = async (id) => {
    await q("RESET ROLE");
    const row = await one(`SELECT
      (SELECT count(*) FROM neon_auth."user" WHERE id = $1) AS u,
      (SELECT count(*) FROM public.profiles WHERE user_id = $1) AS p,
      (SELECT count(*) FROM public.scores WHERE user_id = $1) AS s`, [id]);
    return [Number(row.u), Number(row.p), Number(row.s)];
  };

  // Dados (como dono): Eva com perfil e score, Fábio com perfil, Gil sem perfil.
  const newUser = async (email) => (await one(
    `INSERT INTO neon_auth."user" (name, email, "emailVerified") VALUES ('t', $1, false) RETURNING id`, [email])).id;
  const eva = await newUser(`eva.${suffix}@${DOMAIN}`);
  const fabio = await newUser(`fabio.${suffix}@gmail.test`);
  const gil = await newUser(`gil.${suffix}@gmail.test`);
  const chartId = (await one(
    `INSERT INTO public.ranked_charts (song_slug, difficulty, chart_version, title, note_count, max_score)
     VALUES ($1, 'normal', 'a', 'Teste', 1, 1012) RETURNING id`, [`teste-${suffix}`])).id;
  await as("authenticated", eva);
  await q("SELECT public.create_my_profile($1)", [`Eva ${suffix}`]);
  await q("SELECT public.submit_score($1, 1012, 100, 1, 1, 0, 0, 0, 0, 'S')", [chartId]);
  await as("authenticated", fabio);
  await q("SELECT public.create_my_profile($1)", [`Fabio ${suffix}`]);

  await check("visitante não executa delete_my_account", async () => {
    await as("anonymous");
    await rejects(() => q("SELECT public.delete_my_account('x')"), { code: "42501" });
  });
  await check("confirmação errada ou vazia é recusada e nada é apagado", async () => {
    await as("authenticated", eva);
    await rejects(() => q("SELECT public.delete_my_account($1)", [`Fabio ${suffix}`]), raised(/Confirmação incorreta/));
    await rejects(() => q("SELECT public.delete_my_account(NULL)"), raised(/Confirmação incorreta/));
    await rejects(() => q("SELECT public.delete_my_account('excluir')"), raised(/nome de usuário/));
    assert.deepEqual(await exists(eva), [1, 1, 1]);
  });
  await check("cada um só apaga a própria conta", async () => {
    await as("authenticated", fabio);
    await q("SELECT public.delete_my_account($1)", [`fabio ${suffix}`]);
    assert.deepEqual(await exists(fabio), [0, 0, 0]);
    assert.deepEqual(await exists(eva), [1, 1, 1]);
  });
  await check("apaga conta, perfil e scores (confirmação ignora maiúsculas/espaços)", async () => {
    await as("authenticated", eva);
    const { r } = await one("SELECT public.delete_my_account($1) AS r", [`  EVA   ${suffix} `]);
    assert.deepEqual(r, { deleted: true });
    assert.deepEqual(await exists(eva), [0, 0, 0]);
    await as("anonymous");
    assert.equal((await q("SELECT * FROM public.get_leaderboard($1)", [chartId])).rowCount, 0);
  });
  await check("conta sem perfil confirma com \"excluir\"", async () => {
    await as("authenticated", gil);
    await rejects(() => q("SELECT public.delete_my_account('gil')"), raised(/"excluir"/));
    await q("SELECT public.delete_my_account('Excluir')");
    assert.deepEqual(await exists(gil), [0, 0, 0]);
  });
  await q("RESET ROLE");
}
