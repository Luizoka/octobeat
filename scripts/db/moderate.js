// Moderação pelo terminal (usa DATABASE_URL do .env; nunca roda no site).
//
//   npm run db:moderate -- list                    → últimos jogadores e envios
//   npm run db:moderate -- show <@usuário>         → perfil, status e melhores scores
//   npm run db:moderate -- hide <@usuário>         → some dos rankings e do perfil público
//   npm run db:moderate -- suspend <@usuário>      → continua visível, mas não envia score
//   npm run db:moderate -- restore <@usuário>      → volta ao normal (active)
//   npm run db:moderate -- delete-score <id>       → apaga UM envio (ex.: score forjado)
//
// <@usuário> aceita "Jogador Anonimo", "jogador-anonimo" ou "@jogador-anonimo".
import { connectDb } from "./connect.js";

const STATUS = { hide: "hidden", suspend: "suspended", restore: "active" };
const [command, ...rest] = process.argv.slice(2);
const arg = rest.join(" ").trim();

function toSlug(value) {
  return value.replace(/^@/, "").normalize("NFD").replace(/\p{M}/gu, "")
    .trim().replace(/\s+/g, " ").toLowerCase().replaceAll(" ", "-");
}

async function findProfile(client, value) {
  const { rows: [profile] } = await client.query(
    `SELECT p.user_id, p.username_slug, p.display_name, p.visibility, p.moderation_status, p.created_at, u.banned
     FROM public.profiles p JOIN neon_auth."user" u ON u.id = p.user_id WHERE p.username_slug = $1`, [toSlug(value)]);
  if (!profile) throw new Error(`Jogador não encontrado: ${value}`);
  return profile;
}

async function show(client, value) {
  const p = await findProfile(client, value);
  console.log(`@${p.username_slug} — ${p.display_name}`);
  console.log(`  status: ${p.moderation_status} | visibilidade: ${p.visibility} | banido no login: ${p.banned ? "sim" : "não"} | desde ${p.created_at.toISOString().slice(0, 10)}`);
  const { rows } = await client.query(
    `SELECT s.id, c.song_slug, c.difficulty, s.score, c.max_score, s.accuracy, s.platform, s.created_at
     FROM public.scores s JOIN public.ranked_charts c ON c.id = s.chart_id
     WHERE s.user_id = $1 ORDER BY s.created_at DESC LIMIT 15`, [p.user_id]);
  for (const s of rows) {
    const pct = s.max_score ? Math.round((s.score / s.max_score) * 100) : 0;
    console.log(`  #${s.id} ${s.song_slug}/${s.difficulty}: ${s.score} (${pct}% do máximo, precisão ${s.accuracy}%, ${s.platform ?? "?"}) ${s.created_at.toISOString().slice(0, 16)}`);
  }
}

async function main() {
  const client = await connectDb();
  try {
    if (command === "list") {
      const { rows } = await client.query(
        `SELECT p.username_slug, p.display_name, p.moderation_status,
           (SELECT count(*) FROM public.scores s WHERE s.user_id = p.user_id) AS envios
         FROM public.profiles p ORDER BY p.created_at DESC LIMIT 30`);
      for (const r of rows) console.log(`@${r.username_slug} — ${r.display_name} [${r.moderation_status}] ${r.envios} envio(s)`);
      if (!rows.length) console.log("Nenhum jogador ainda.");
    } else if (command === "show" && arg) {
      await show(client, arg);
    } else if (STATUS[command] && arg) {
      const p = await findProfile(client, arg);
      await client.query("UPDATE public.profiles SET moderation_status = $1, updated_at = now() WHERE user_id = $2",
        [STATUS[command], p.user_id]);
      console.log(`✔ @${p.username_slug}: ${p.moderation_status} → ${STATUS[command]}`);
    } else if (command === "delete-score" && /^\d+$/.test(arg)) {
      const { rowCount } = await client.query("DELETE FROM public.scores WHERE id = $1", [arg]);
      console.log(rowCount ? `✔ Envio #${arg} apagado.` : `Envio #${arg} não existe.`);
    } else {
      console.log("Uso: npm run db:moderate -- list | show <@usuário> | hide | suspend | restore <@usuário> | delete-score <id>");
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

try {
  await main();
} catch (error) {
  console.error(`✘ ${error.message}`);
  process.exitCode = 1;
}
