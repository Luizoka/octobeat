import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

// Ranking (#5): papel `anonymous` — tabelas fechadas, só RPCs.
export default async function leaderboardPolicies({ client, check }) {
  const suffix = randomBytes(6).toString("hex");
  const username = `Teste${suffix}`;
  const password = randomBytes(12).toString("hex");
  const { rows: [{ id: chartId }] } = await client.query(
    `INSERT INTO public.ranked_charts (song_slug, difficulty, chart_version, title, note_count, max_score)
     VALUES ($1, 'normal', 'teste', 'Teste de políticas', 1, 1012) RETURNING id`,
    [`teste-${suffix}`],
  );
  const { rows: [{ id: inactiveId }] } = await client.query(
    `INSERT INTO public.ranked_charts (song_slug, difficulty, chart_version, title, note_count, max_score, active)
     VALUES ($1, 'normal', 'inativo', 'Chart inativo', 1, 1012, false) RETURNING id`,
    [`teste-${suffix}`],
  );
  const { rows: [{ id: easyId }] } = await client.query(
    `INSERT INTO public.ranked_charts (song_slug, difficulty, chart_version, title, note_count, max_score)
     VALUES ($1, 'easy', 'teste', 'Teste fácil', 1, 1012) RETURNING id`,
    [`teste-${suffix}`],
  );
  await client.query("SET LOCAL ROLE anonymous");

  const register = (name) => client.query("SELECT public.register($1, $2) AS session", [name, password]);
  const login = (name) => client.query("SELECT public.login($1, $2) AS session", [name, password]);
  const submit = (token, score = 1012, chart = chartId, platform = "mobile") => client.query(
    "SELECT public.submit_score($1, $2, $3, 100, 1, 1, 0, 0, 0, 0, 'S', $4) AS result",
    [token, chart, score, platform],
  );
  const leaderboard = () => client.query("SELECT * FROM public.get_leaderboard($1)", [chartId]);

  const columns = { scores: "score", players: "username", sessions: "token_hash", ranked_charts: "title" };
  for (const [table, column] of Object.entries(columns)) {
    const operations = {
      ...(table === "ranked_charts" ? {} : { SELECT: `SELECT * FROM public.${table}` }),
      INSERT: `INSERT INTO public.${table} DEFAULT VALUES`,
      UPDATE: `UPDATE public.${table} SET ${column} = DEFAULT WHERE false`,
      DELETE: `DELETE FROM public.${table} WHERE false`,
    };
    for (const [verb, sql] of Object.entries(operations)) {
      await check(`${verb} direto em ${table} é bloqueado`, () => assert.rejects(client.query(sql), { code: "42501" }));
    }
  }
  await check("SELECT em ranked_charts lê só o chart ativo", async () => {
    const { rows } = await client.query("SELECT id FROM public.ranked_charts WHERE id IN ($1, $2)", [chartId, inactiveId]);
    assert.deepEqual(rows, [{ id: chartId }]);
  });
  await check("register rejeita nome inválido", () =>
    assert.rejects(register("nome inválido!"), { code: "P0001", message: /letras, números e espaços/ }));
  await check("submit_score rejeita token inválido", () =>
    assert.rejects(submit("token-inválido"), { code: "P0001", message: /Sessão inválida/ }));

  // Mantém os dados válidos entre verificações. A transação externa sempre é revertida.
  const registered = await check("register cria conta e sessão", async () => {
    const { rows: [{ session }] } = await register(` ${username} `);
    assert.equal(session.username, username);
    assert.match(session.token, /^[0-9a-f]{64}$/);
    return session;
  }, { keep: true });
  await check("register rejeita nome em uso sem distinguir maiúsculas", () =>
    assert.rejects(register(username.toLowerCase()), { code: "P0001", message: /já está em uso/ }));
  const loggedIn = await check("login ignora caixa e cria nova sessão", async () => {
    const { rows: [{ session }] } = await login(username.toLowerCase());
    assert.equal(session.username, username);
    assert.match(session.token, /^[0-9a-f]{64}$/);
    assert.notEqual(session.token, registered?.token);
    return session;
  }, { keep: true });
  const token = loggedIn?.token;
  await check("get_player_profile retorna perfil sem pontuações", async () => {
    const { rows: [{ profile }] } = await client.query("SELECT public.get_player_profile($1) AS profile", [username]);
    assert.deepEqual(
      [profile.submissions, profile.charts_played, profile.s_ranks, profile.total_score, profile.global_position, profile.best],
      [0, 0, 0, 0, null, []],
    );
  });
  await check("submit_score rejeita chart inativo", () =>
    assert.rejects(submit(token, 1012, inactiveId), { code: "P0001", message: /Ranking indisponível/ }));
  await check("submit_score rejeita pontuação acima do máximo", () =>
    assert.rejects(submit(token, 1013), { code: "P0001", message: /Pontuação fora do limite/ }));
  await check("submit_score rejeita plataforma inválida", () =>
    assert.rejects(submit(token, 1012, chartId, "console"), { code: "P0001", message: /Plataforma inválida/ }));
  const submitted = await check("submit_score retorna posição e melhor pontuação", async () => {
    const { rows: [{ result }] } = await submit(token);
    assert.deepEqual(result, { position: 1, best_score: 1012 });
    return result;
  }, { keep: true });
  await check("submit_score bloqueia um segundo envio dentro de 30 s", async () => {
    assert.ok(submitted, "O primeiro envio precisa ter sido aceito.");
    await assert.rejects(submit(token), { code: "P0001", message: /Aguarde 30 segundos/ });
  });
  await check("get_leaderboard retorna a pontuação enviada", async () => {
    const { rows } = await leaderboard();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].username, username);
    assert.equal(rows[0].score, 1012);
    assert.equal(rows[0].platform, "mobile");
  });
  await check("get_player_profile ignora caixa e expõe só os campos públicos", async () => {
    await submit(token, 500, easyId);
    // Envelhece o primeiro envio para incluir uma tentativa pior sem esperar 30 segundos.
    await client.query("SET LOCAL ROLE NONE");
    await client.query(
      "UPDATE public.scores SET created_at = created_at - interval '1 minute' WHERE chart_id = $1", [chartId],
    );
    await client.query("SET LOCAL ROLE anonymous");
    await submit(token, 400);
    const { rows: [{ profile }] } = await client.query("SELECT public.get_player_profile($1) AS profile", [
      ` ${username.toLowerCase()} `,
    ]);
    assert.deepEqual(Object.keys(profile).sort(), [
      "best", "charts_played", "created_at", "global_position", "s_ranks", "submissions", "total_score", "username",
    ]);
    assert.equal(profile.username, username);
    assert.equal(profile.submissions, 3);
    assert.equal(profile.charts_played, 2);
    assert.equal(profile.s_ranks, 2);
    assert.equal(profile.total_score, 1512);
    assert.ok(profile.global_position > 0);
    assert.deepEqual(profile.best.map(({ difficulty, score }) => [difficulty, score]), [["easy", 500], ["normal", 1012]]);
    for (const best of profile.best) {
      assert.deepEqual(Object.keys(best).sort(), [
        "accuracy", "created_at", "difficulty", "position", "rank", "score", "song_slug", "title",
      ]);
      assert.equal(best.position, 1);
    }
    const { rows: [global] } = await client.query(
      "SELECT * FROM public.get_global_leaderboard() WHERE position = $1", [profile.global_position],
    );
    if (profile.global_position <= 50) assert.equal(global.username, username);
  });
  await check("get_player_profile rejeita jogador inexistente", () =>
    assert.rejects(client.query("SELECT public.get_player_profile($1)", [`${username}x`]), {
      code: "P0001", message: "Jogador não encontrado.",
    }));
  await check("get_global_leaderboard filtra por dificuldade e limita a 50", async () => {
    const { rows } = await client.query("SELECT * FROM public.get_global_leaderboard('normal', 100)");
    assert.ok(rows.length > 0 && rows.length <= 50);
    const player = rows.find((row) => row.username === username);
    if (player) {
      assert.equal(Number(player.total_score), 1012);
      assert.equal(player.charts_played, 1);
      assert.equal(player.s_ranks, 1);
      assert.equal(Number(player.avg_accuracy), 100);
    }
    const { rows: easy } = await client.query(
      "SELECT * FROM public.get_global_leaderboard('easy', 100) WHERE username = $1", [username],
    );
    assert.deepEqual(easy, []);
  });
  await check("get_global_leaderboard rejeita dificuldade inválida", () =>
    assert.rejects(client.query("SELECT * FROM public.get_global_leaderboard('expert')"), {
      code: "P0001", message: "Dificuldade inválida.",
    }));
  for (const name of ["ranked_active_bests", "ranked_global_positions"]) {
    await check(`${name} é bloqueada para anonymous`, () =>
      assert.rejects(client.query(`SELECT * FROM public.${name}(NULL)`), { code: "42501" }));
  }
  await check("authenticated não recebe acesso às novas funções", async () => {
    const { rows } = await client.query(`
      SELECT has_function_privilege(oid, signature, 'EXECUTE') AS allowed
      FROM pg_roles
      CROSS JOIN unnest(ARRAY[
        'public.get_player_profile(text)', 'public.get_global_leaderboard(text,int)',
        'public.ranked_active_bests(text)', 'public.ranked_global_positions(text)'
      ]) AS functions(signature)
      WHERE rolname = 'authenticated'
    `);
    assert.ok(rows.every(({ allowed }) => !allowed));
  });
  await check("logout invalida a sessão", async () => {
    await client.query("SELECT public.logout($1)", [token]);
    await assert.rejects(submit(token), { code: "P0001", message: /Sessão inválida/ });
  });
}
