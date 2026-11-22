import assert from "node:assert/strict";

// Identidade (#6) + ranking por user_id. Simula visitante e jogadores logados
// definindo as claims do JWT na sessão (`request.jwt.claims`, lido por
// auth.uid()) e trocando de papel com SET LOCAL ROLE.
const DOMAIN = "contas.octobeat.luizoka.dev";
const DENIED = { code: "42501" };
const raised = (message) => ({ code: "P0001", message });

export default async function identityPolicies({ client, check, suffix }) {
  const q = (sql, params) => client.query(sql, params);
  const one = async (sql, params) => (await q(sql, params)).rows[0];

  async function as(role, sub = null) {
    await q("RESET ROLE");
    await q("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify(sub ? { sub, role } : { role })]);
    await q(`SET LOCAL ROLE ${role}`);
  }
  const asOwner = () => q("RESET ROLE");
  // Erro esperado aborta a transação: cada um ganha seu SAVEPOINT.
  async function rejects(run, expected) {
    await q("SAVEPOINT expect_error");
    try {
      await assert.rejects(run(), expected);
    } finally {
      await q("ROLLBACK TO SAVEPOINT expect_error");
      await q("RELEASE SAVEPOINT expect_error");
    }
  }

  // ── Dados de teste (como dono) ────────────────────────────────────────
  const users = {};
  for (const [key, email] of [
    ["ana", `ana.${suffix}@${DOMAIN}`],      // conta usuário+senha "Ana <suffix>"
    ["bia", `bia.${suffix}@gmail.test`],     // conta Google
    ["caio", `caio${suffix}@${DOMAIN}`],     // conta usuário+senha ainda sem perfil
    ["duda", `duda.${suffix}@gmail.test`],   // banida no provedor
  ]) {
    users[key] = (await one(
      `INSERT INTO neon_auth."user" (name, email, "emailVerified") VALUES ($1, $2, false) RETURNING id`,
      [key, email])).id;
  }
  await q(`UPDATE neon_auth."user" SET banned = true WHERE id = $1`, [users.duda]);
  const anaName = `Ana ${suffix}`;
  const anaSlug = `ana-${suffix}`;
  const chart = async (difficulty, version, active = true) => (await one(
    `INSERT INTO public.ranked_charts (song_slug, difficulty, chart_version, title, note_count, max_score, active)
     VALUES ($1, $2, $3, 'Teste', 1, 1012, $4) RETURNING id`, [`teste-${suffix}`, difficulty, version, active])).id;
  const chartId = await chart("normal", "a");
  const easyId = await chart("easy", "a");
  const inactiveId = await chart("normal", "inativo", false);

  const submit = (score = 1012, chartRef = chartId, platform = "pc") => q(
    "SELECT public.submit_score($1, $2, 100, 1, 1, 0, 0, 0, 0, 'S', $3) AS r", [chartRef, score, platform]);
  const profileOf = async (slug) => (await q("SELECT public.get_player_profile($1) AS p", [slug])).rows[0].p;

  // ── Visitante ─────────────────────────────────────────────────────────
  for (const table of ["profiles", "scores"]) {
    for (const [verb, sql] of [
      ["SELECT", `SELECT * FROM public.${table}`],
      ["INSERT", `INSERT INTO public.${table} DEFAULT VALUES`],
      ["UPDATE", `UPDATE public.${table} SET created_at = now() WHERE false`],
      ["DELETE", `DELETE FROM public.${table} WHERE false`],
    ]) {
      await check(`visitante: ${verb} direto em ${table} é bloqueado`, async () => {
        await as("anonymous");
        await rejects(() => q(sql), DENIED);
      });
    }
  }
  for (const fn of ["get_my_profile()", "create_my_profile('x')", "update_my_profile('x')",
    `submit_score(${chartId}, 1, 1, 1, 1, 0, 0, 0, 0, 'S')`]) {
    await check(`visitante não executa ${fn.split("(")[0]}`, async () => {
      await as("anonymous");
      await rejects(() => q(`SELECT public.${fn}`), DENIED);
    });
  }
  await check("visitante lê só charts ativos", async () => {
    await as("anonymous");
    const { rows } = await q("SELECT id FROM public.ranked_charts WHERE id IN ($1, $2)", [chartId, inactiveId]);
    assert.deepEqual(rows.map((r) => Number(r.id)), [Number(chartId)]);
  });
  await check("username_available valida formato e mostra o e-mail interno", async () => {
    await as("anonymous");
    assert.equal((await one("SELECT public.username_available('nome!') AS r")).r.available, false);
    const free = (await one("SELECT public.username_available($1) AS r", [`  Novo   ${suffix} `])).r;
    assert.deepEqual(free, { available: true, username: `Novo ${suffix}`, login_email: `novo.${suffix}@${DOMAIN}` });
  });
  await check("username_available considera conta usuário+senha sem perfil", async () => {
    await as("anonymous");
    assert.equal((await one("SELECT public.username_available($1) AS r", [`caio${suffix}`])).r.available, false);
  });

  // ── Jogadora "Ana" (usuário + senha) ──────────────────────────────────
  await check("JWT sem sub não passa por jogador", async () => {
    await as("authenticated");
    await rejects(() => q("SELECT public.get_my_profile()"), raised(/Entre na sua conta/));
  });
  await check("logado: tabelas continuam fechadas", async () => {
    await as("authenticated", users.ana);
    await rejects(() => q("SELECT * FROM public.profiles"), DENIED);
    await rejects(() => q("UPDATE public.scores SET score = 0 WHERE true"), DENIED);
  });
  await check("conta nova ainda sem perfil: get_my_profile é null", async () => {
    await as("authenticated", users.ana);
    assert.equal((await one("SELECT public.get_my_profile() AS p")).p, null);
  });
  await check("conta usuário+senha não escolhe @usuário diferente do login", async () => {
    await as("authenticated", users.ana);
    await rejects(() => q("SELECT public.create_my_profile('Outro Nome')"), raised(/mesmo usado para entrar/));
  });
  await check("cria o perfil (espaços normalizados)", async () => {
    await as("authenticated", users.ana);
    const p = (await one("SELECT public.create_my_profile($1) AS p", [`  ana   ${suffix} `])).p;
    assert.equal(p.username_slug, anaSlug);
    assert.equal(p.display_name, `ana ${suffix}`);
  }, { keep: true });
  await check("não cria perfil duas vezes", async () => {
    await as("authenticated", users.ana);
    await rejects(() => q("SELECT public.create_my_profile($1)", [anaName]), raised(/já tem um perfil/));
  });
  await check("edita o próprio perfil e recusa valores inválidos", async () => {
    await as("authenticated", users.ana);
    const p = (await one("SELECT public.update_my_profile($1, 'oi', NULL, 'coral') AS p", [anaName])).p;
    assert.equal(p.display_name, anaName);
    assert.equal(p.avatar_config.color, "coral");
    await rejects(() => q("SELECT public.update_my_profile(NULL, NULL, NULL, 'arco-íris')"), raised(/Cor de avatar/));
    await rejects(() => q("SELECT public.update_my_profile(NULL, NULL, 'todos')"), raised(/Visibilidade/));
    await rejects(() => q("SELECT public.update_my_profile('   ')"), raised(/Nome de exibição/));
    await rejects(() => q("SELECT public.update_my_profile(NULL, repeat('a', 281))"), raised(/280/));
  }, { keep: true });
  await check("score: chart inativo e acima do máximo são recusados", async () => {
    await as("authenticated", users.ana);
    await rejects(() => submit(1012, inactiveId), raised(/indisponível/));
    await rejects(() => submit(1013), raised(/fora do limite/));
    await rejects(() => submit(1012, chartId, "console"), raised(/Plataforma/));
  });
  await check("score válido entra com posição", async () => {
    await as("authenticated", users.ana);
    assert.deepEqual((await submit()).rows[0].r, { position: 1, best_score: 1012 });
    await submit(500, easyId);
  }, { keep: true });
  await check("freio de spam: 2º envio em menos de 30 s", async () => {
    await as("authenticated", users.ana);
    await rejects(() => submit(), raised(/30 segundos/));
  });
  await check("ranking mostra nome, link e plataforma, sem dados privados", async () => {
    await as("anonymous");
    const [row] = (await q("SELECT * FROM public.get_leaderboard($1)", [chartId])).rows;
    assert.deepEqual([row.display_name, row.username_slug, row.platform], [anaName, anaSlug, "pc"]);
    assert.ok(!("user_id" in row) && !("email" in row));
  });
  await check("ranking geral filtra dificuldade e recusa valor inválido", async () => {
    await as("anonymous");
    const easy = (await q("SELECT * FROM public.get_global_leaderboard('easy')")).rows.find((r) => r.username_slug === anaSlug);
    assert.equal(Number(easy.total_score), 500);
    await rejects(() => q("SELECT * FROM public.get_global_leaderboard('extremo')"), raised(/Dificuldade/));
  });
  await check("perfil público não expõe e-mail, user_id nem campos privados", async () => {
    await as("anonymous");
    const p = await profileOf(anaSlug.toUpperCase());
    for (const key of ["email", "user_id", "visibility", "moderation_status"]) assert.ok(!(key in p), key);
    assert.deepEqual([p.own, p.charts_played, p.level, p.achievements, p.published_charts], [false, 2, null, [], []]);
  });

  // ── Jogadora "Bia" (Google) ───────────────────────────────────────────
  await check("Google não pega @usuário em uso nem login de outra conta", async () => {
    await as("authenticated", users.bia);
    await rejects(() => q("SELECT public.create_my_profile($1)", [anaName.toUpperCase()]), raised(/em uso/));
    await rejects(() => q("SELECT public.create_my_profile($1)", [`caio${suffix}`]), raised(/em uso/));
  });
  await check("sem perfil não edita nem envia score", async () => {
    await as("authenticated", users.bia);
    await rejects(() => q("SELECT public.update_my_profile('x')"), raised(/Crie seu perfil/));
    await rejects(() => submit(), raised(/Crie seu perfil/));
  });
  await check("Bia cria perfil privado e não altera o da Ana", async () => {
    await as("authenticated", users.bia);
    await q("SELECT public.create_my_profile($1, 'Bia')", [`bia ${suffix}`]);
    await q("SELECT public.update_my_profile('Mudei', NULL, 'private', 'gold')");
    await asOwner();
    const ana = await one("SELECT display_name, avatar_config FROM public.profiles WHERE user_id = $1", [users.ana]);
    assert.deepEqual([ana.display_name, ana.avatar_config.color], [anaName, "coral"]);
  }, { keep: true });
  await check("perfil privado: visitante vê só nome/avatar; a dona vê tudo", async () => {
    await as("anonymous");
    const outside = await profileOf(`bia-${suffix}`);
    assert.deepEqual(Object.keys(outside).sort(), ["avatar_config", "display_name", "private", "username_slug"]);
    await as("authenticated", users.bia);
    const inside = await profileOf(`bia-${suffix}`);
    assert.deepEqual([inside.private, inside.own, inside.visibility], [false, true, "private"]);
  });

  // ── Moderação e provedor ──────────────────────────────────────────────
  await check("oculta (hidden): some do ranking e do perfil público", async () => {
    await asOwner();
    await q("UPDATE public.profiles SET moderation_status = 'hidden' WHERE user_id = $1", [users.ana]);
    await as("anonymous");
    assert.equal((await q("SELECT * FROM public.get_leaderboard($1)", [chartId])).rowCount, 0);
    await rejects(() => profileOf(anaSlug), raised(/não encontrado/));
    await as("authenticated", users.ana);
    assert.equal((await profileOf(anaSlug)).own, true);
  });
  await check("suspensa não envia score", async () => {
    await asOwner();
    await q("UPDATE public.profiles SET moderation_status = 'suspended' WHERE user_id = $1", [users.ana]);
    await as("authenticated", users.ana);
    await rejects(() => submit(1012, easyId), raised(/não pode enviar/));
  });
  await check("banida no Neon Auth não envia score", async () => {
    await as("authenticated", users.duda);
    await q("SELECT public.create_my_profile($1)", [`duda ${suffix}`]);
    await rejects(() => submit(), raised(/não pode enviar/));
  });
  await check("is_admin vem do provedor e é inacessível pela API", async () => {
    await asOwner();
    assert.equal((await one("SELECT internal.is_admin($1) AS a", [users.bia])).a, false);
    await q(`UPDATE neon_auth."user" SET role = 'admin' WHERE id = $1`, [users.bia]);
    assert.equal((await one("SELECT internal.is_admin($1) AS a", [users.bia])).a, true);
    await as("authenticated", users.bia);
    await rejects(() => q("SELECT internal.is_admin($1)", [users.bia]), DENIED);
  });
  await check("apagar a conta no provedor apaga perfil e scores", async () => {
    await asOwner();
    await q(`DELETE FROM neon_auth."user" WHERE id = $1`, [users.ana]);
    const left = await one("SELECT (SELECT count(*) FROM public.profiles WHERE user_id = $1) p, (SELECT count(*) FROM public.scores WHERE user_id = $1) s", [users.ana]);
    assert.deepEqual([Number(left.p), Number(left.s)], [0, 0]);
  });
  await asOwner();
}
