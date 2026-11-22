# Arquitetura do OctoBeat

Mapa para quem vai mexer no projeto (pessoas e agentes). Vale para todas as
issues do roadmap (#6–#17). Regras de gameplay, charts e desempenho continuam
no `CLAUDE.md`.

## Princípios

1. **Jogo local sempre funciona.** Sem internet, sem conta ou com o Neon fora
   do ar, dá para jogar. Recursos online falham com mensagem clara e nunca
   travam o gameplay.
2. **Sem backend próprio (por enquanto).** O navegador fala com a Neon Data API
   (PostgREST). Toda regra de segurança fica no Postgres: `GRANT` + RLS +
   funções `SECURITY DEFINER`. Só introduzir função serverless (ex.: Vercel)
   quando algo não puder ser feito com segurança no banco.
3. **Nunca confiar no cliente** para conceder moedas, XP, permissões, vitórias
   ou scores competitivos. O cliente *pede*; o banco valida.
4. **Identidade = `user_id` imutável.** Nome/apelido é só apresentação.
5. **Não antecipar módulos.** Cada issue cria só o que usa, mais os pontos de
   extensão combinados aqui.

## Pastas

| Onde | O quê |
|---|---|
| `src/music/`, `src/music-analysis/`, `src/chart/` | Importação, análise e geração de charts (puro, sem React). |
| `src/game/` | Motor: julgamento, pontuação, holds, entrada (puro). |
| `src/ui/` | Telas e componentes React. |
| `src/leaderboard/` | Cliente do ranking (Data API) e validações. |
| `src/<domínio>/` | Cada domínio novo ganha sua pasta: `identity/`, `profile/`, `social/`… Serviços de rede ficam aqui, **nunca** dentro do loop do jogo. |
| `db/migrations/` | Migrações SQL numeradas, rodam uma vez. |
| `db/seeds/` | SQL repetível (idempotente), roda em todo `db:migrate`. |
| `scripts/db/` | `migrate.js`, conexão e testes de políticas (`policies/*.policy.js`). |
| `public/ranked/` | Fases congeladas do ranking (geradas, versionadas no git). |

## Modos de conteúdo e elegibilidade

| Modo | O que é | Vale ranking? |
|---|---|---|
| `local` | Música importada pelo jogador, só no navegador dele. | Não |
| `community_pending` | Submetida, aguardando moderação (#7/#9). | Não |
| `published` | Aprovada e pública, com versão imutável. | Só se também `ranked` |
| `ranked` | Fase congelada oficial (`ranked_charts`). | Sim |
| `friendly` | Duelo/partida amistosa com conteúdo não homologado. | Não (sem rating/moedas) |

Um score só é competitivo quando a combinação abaixo é oficial e ativa:
`chart_id` + `chart_version` (hash do conteúdo) + dificuldade + regras de
pontuação + modo de entrada (hoje: duas mãos). Mudar qualquer uma cria um
ranking novo; o antigo fica arquivado, nunca reescrito.

## Identidade (issue #6)

- Provedor: **Neon Auth** (Better Auth gerenciado). SDK no front:
  `@neon/neon-js`. Usuários em `neon_auth.user` (id `uuid`).
- Login misto: **Google** ou **usuário + senha**. Usuário + senha vira conta
  Neon Auth com e-mail interno `<usuario>@contas.octobeat.luizoka.dev`
  (ninguém vê; não há "esqueci a senha" nesse modo).
- Sessão: cookie `HttpOnly; SameSite=None; Partitioned` no domínio do Neon
  Auth (7 dias). O SDK obtém um JWT (≈15 min, `role=authenticated`,
  `sub=user_id`) e o envia à Data API.
- No banco, `auth.user_id()` (texto) / `auth.uid()` (uuid) dizem quem é o
  jogador. Tabelas do app referenciam `neon_auth.user(id)`.
- Dados do jogador ficam em tabelas **nossas** (`profiles`, …), nunca em
  campos livres do provedor. Nível/moedas/inventário: tabelas próprias,
  escritas só por funções do servidor.
- Admin/moderação: decidido no banco (`neon_auth.user.role` ou tabela de
  papéis com escrita restrita). Nunca uma flag que o próprio usuário edita.

### Contrato atual (migração 004)

- `public.profiles`: `user_id` (PK → `neon_auth.user`, cascata ao apagar a
  conta), `username` (fixo; login das contas usuário+senha), `username_slug`
  (único; links `?perfil=<slug>`, que funcionam em hospedagem estática), `display_name` (alterável), `bio` (≤ 280),
  `avatar_config`, `visibility` (`public`/`private`), `moderation_status`
  (`active`/`hidden`/`suspended`).
- `avatar_config` v1: `{ "v": 1, "base": "octo", "color": "<cor>", "layers": {} }`.
  Cores em `internal.avatar_colors()`. Ordem das camadas para a #14:
  body → eyes → mouth → hat → held. Só o servidor escreve.
- `public.scores` por `user_id` (FK → `profiles`). Perfil `hidden` some de
  rankings e do perfil público; `suspended` ou banido no Neon Auth não envia.
- Perfil público (`get_player_profile(slug)`) já devolve `level: null`,
  `achievements: []`, `published_charts: []` — contrato para #13/#7, sem
  tabelas ainda. Perfil privado: só nome e avatar para quem não é o dono.
- Conta usuário+senha: o `@usuário` do perfil precisa ser o mesmo do login
  (checado em `create_my_profile`). Conta Google escolhe um `@usuário` livre no
  primeiro acesso (estado `needsProfile` no front).

| RPC | Visitante | Logado |
|---|:-:|:-:|
| `username_available`, `get_leaderboard`, `get_global_leaderboard`, `get_player_profile` | ✔ | ✔ |
| `get_my_profile`, `create_my_profile`, `update_my_profile`, `submit_score` | | ✔ |

## Banco

### Migrações

- `npm run db:migrate` aplica as pendentes, cada uma na sua transação, e
  registra em `ops.schema_migrations` (schema fora da API). `-- --status`
  só mostra.
- **`npm run db:migrate -- --dry-run`** aplica as pendentes e roda todas as
  suítes de políticas numa transação que sempre é desfeita. Use antes de
  aplicar de verdade — o banco de produção é o mesmo.
- Schemas: `public` (tabelas com RLS + RPCs da lista `PUBLIC_RPC`),
  `internal` (funções auxiliares; a API não enxerga), `ops` (controle de
  migrações). Funções novas nascem sem `EXECUTE` para `PUBLIC`
  (`ALTER DEFAULT PRIVILEGES`): RPC pública precisa de `GRANT` explícito.
- Nome: `db/migrations/NNN_descricao.sql` (minúsculas). **Migração aplicada é
  imutável** — o executor recusa se o arquivo mudou. Para corrigir, crie outra.
- Mudou o tipo de retorno de uma função → `DROP FUNCTION` antes do
  `CREATE`. Coluna `position` em `RETURNS TABLE` precisa de aspas.
- **Depois de aplicar: Neon → Data API → "Refresh schema cache".** O Neon
  não aceita `NOTIFY pgrst`; sem o refresh, RPC nova/alterada dá 404.

### Papéis da Data API

| Papel | Quem | Pode |
|---|---|---|
| `anonymous` | visitante (JWT anônimo do Neon Auth) | ler dados públicos permitidos, chamar RPCs públicas |
| `authenticated` | jogador logado (`auth.user_id()`) | o mesmo + RPCs/linhas próprias via RLS |
| dono (`neondb_owner`) | só scripts locais / funções `SECURITY DEFINER` | tudo |

### Receita para tabela/função nova

```sql
CREATE TABLE public.coisa (...);
ALTER TABLE public.coisa ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coisa FROM PUBLIC, anonymous, authenticated;
-- leitura pública? GRANT SELECT + POLICY ... FOR SELECT TO anonymous, authenticated USING (...)
-- escrita: preferir função (validações + limites) em vez de INSERT direto:
CREATE FUNCTION public.fazer_coisa(...) RETURNS ...
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$ ... $$;
REVOKE ALL ON FUNCTION public.fazer_coisa(...) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fazer_coisa(...) TO authenticated;
```

Erros para o usuário: `RAISE EXCEPTION 'mensagem em português'` (o cliente
mostra `message` quando `code = P0001`).

### Testes de políticas

`npm run db:test-policies` roda `scripts/db/policies/*.policy.js` no banco
real, dentro de transação revertida. A suíte `platform` vigia o projeto todo:
tabela sem RLS, função executável fora da lista `PUBLIC_RPC` ou schema `ops`
exposto fazem o teste falhar. Toda RPC nova entra em `PUBLIC_RPC` de propósito.

## Front

- Variáveis (Vercel/`.env`): `VITE_NEON_DATA_API_URL`, `VITE_NEON_AUTH_URL`.
  `DATABASE_URL` é só local (scripts) e nunca usa prefixo `VITE_`.
- Chamadas de rede passam por um cliente do domínio (`src/<domínio>/client.js`)
  com timeout e mensagens amigáveis; componentes não chamam `fetch` direto.
- Nada de rede ou estado novo por quadro na `GameScreen` (ver `CLAUDE.md`).
- Layout precisa funcionar em celular na horizontal.
- CORS (Neon → Data API e Auth → Domains): `https://octobeat.luizoka.dev`,
  `http://localhost:5173`, `http://localhost:4173`. Previews do Vercel não
  estão liberados (ranking aparece "indisponível" — esperado).

## Checklist de uma feature nova

1. Migração nova em `db/migrations/` seguindo a receita (RLS + REVOKE).
2. Suíte `scripts/db/policies/<domínio>.policy.js` com casos negativos
   (o que **não** pode) e atualização de `PUBLIC_RPC`.
3. Cliente em `src/<domínio>/`, funções puras com teste em `test/`.
4. `npm test`, `npm run build`, `npm run db:migrate -- --dry-run`, e só então
   `npm run db:migrate` + Refresh schema cache + `npm run db:test-policies`.
   Se a migração quebra RPCs que o site publicado usa, aplique junto com o
   deploy do front (o banco é compartilhado com produção).
5. Atualizar este documento se mudar um contrato.

## Decisões em aberto

- Funções serverless: ainda não usadas. Candidatas futuras: validação de
  replay (anti-cheat), webhooks de pagamento (#16).
- Google em produção precisa de Client ID próprio (Google Cloud).
- Sessão no Safari depende de cookies `Partitioned` (Safari 18.4+): validar em
  iPhone real.
