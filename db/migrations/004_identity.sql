-- 004 — Identidade (#6): contas via Neon Auth, perfis e ranking por user_id.
-- Substitui o login caseiro da #5 (players/sessions). As contas e scores
-- antigos eram testes e são descartados (decisão do dono do projeto).
--
-- Convenções (docs/architecture.md):
--   * schema `internal`: funções/auxiliares que a Data API não enxerga;
--   * `public`: só tabelas com RLS e as RPCs listadas em PUBLIC_RPC;
--   * quem é o jogador: auth.uid() (sub do JWT do Neon Auth).

-- ── 1. Sai o login caseiro ───────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.register(text, text);
DROP FUNCTION IF EXISTS public.login(text, text);
DROP FUNCTION IF EXISTS public.logout(text);
DROP FUNCTION IF EXISTS public.new_ranked_session(bigint, text);
DROP FUNCTION IF EXISTS public.ranked_password_material(text);
DROP FUNCTION IF EXISTS public.submit_score(text, bigint, int, numeric, int, int, int, int, int, int, text, text);
DROP FUNCTION IF EXISTS public.get_player_profile(text);
DROP FUNCTION IF EXISTS public.get_global_leaderboard(text, int);
DROP FUNCTION IF EXISTS public.ranked_global_positions(text);
DROP FUNCTION IF EXISTS public.ranked_active_bests(text);
DROP FUNCTION IF EXISTS public.get_leaderboard(bigint, int);
DROP FUNCTION IF EXISTS public.ranked_positions(bigint);
DROP TABLE IF EXISTS public.scores;
DROP FUNCTION IF EXISTS public.check_ranked_score();
DROP TABLE IF EXISTS public.sessions;
DROP TABLE IF EXISTS public.players;

-- ── 2. Schema interno ────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS internal;
REVOKE ALL ON SCHEMA internal FROM PUBLIC;

-- Domínio das contas "usuário + senha": viram conta Neon Auth com e-mail
-- interno <usuario>@<domínio> (ninguém vê; não recebe e-mail).
CREATE FUNCTION internal.password_account_domain() RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT 'contas.octobeat.luizoka.dev' $$;

-- Usuário: letras/números (sem acento) e espaços simples. Corta as pontas e
-- junta espaços repetidos (mesma regra de src/identity/username.js).
CREATE FUNCTION internal.normalize_username(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
    btrim(p, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'),
    '[[:space:]]+', ' ', 'g')
$$;

CREATE FUNCTION internal.valid_username(p text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT p IS NOT NULL AND char_length(p) BETWEEN 1 AND 255
    AND p COLLATE "C" ~ '^[A-Za-z0-9]+( [A-Za-z0-9]+)*$'
$$;

-- Slug para links (/u/<slug>) e unicidade: minúsculas, espaço → '-'.
CREATE FUNCTION internal.username_slug(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT replace(lower(p COLLATE "C"), ' ', '-') $$;

-- E-mail interno da conta "usuário + senha": minúsculas, espaço → '.'.
CREATE FUNCTION internal.password_account_email(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT replace(lower(p COLLATE "C"), ' ', '.') || '@' || internal.password_account_domain()
$$;

-- Admin/moderação: decidido no provedor (neon_auth.user.role), nunca por
-- um campo que o próprio jogador edite. Ainda sem RPC de admin (fora do escopo).
CREATE FUNCTION internal.is_admin(p_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT coalesce((SELECT u.role = 'admin' AND NOT coalesce(u.banned, false)
                   FROM neon_auth."user" AS u WHERE u.id = p_user_id), false)
$$;

-- ── 3. Perfis ────────────────────────────────────────────────────────────
-- Cores do polvo disponíveis (avatar em camadas; acessórios ficam para a #14).
CREATE FUNCTION internal.avatar_colors() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['teal', 'coral', 'violet', 'gold', 'lime', 'sky'] $$;

CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  -- Como o jogador escolheu (ex.: "Luiz Teste"). Fixo: é o login das contas
  -- usuário+senha e a base do slug. O nome exibido é `display_name`.
  username text NOT NULL CHECK (internal.valid_username(username)),
  username_slug text NOT NULL UNIQUE CHECK (username_slug = internal.username_slug(username)),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 255
    AND display_name !~ '[[:cntrl:]]' AND display_name = btrim(display_name)),
  bio text NOT NULL DEFAULT '' CHECK (char_length(bio) <= 280),
  -- Contrato v1: { v, base, color, layers }. Ordem das camadas (#14):
  -- body → eyes → mouth → hat → held. Só o servidor escreve.
  avatar_config jsonb NOT NULL DEFAULT '{"v": 1, "base": "octo", "color": "teal", "layers": {}}'
    CHECK (jsonb_typeof(avatar_config) = 'object'),
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  -- active | hidden (some dos rankings/perfil) | suspended (não envia score).
  moderation_status text NOT NULL DEFAULT 'active' CHECK (moderation_status IN ('active', 'hidden', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profiles FROM PUBLIC, anonymous, authenticated;

-- ── 4. Scores por user_id ────────────────────────────────────────────────
CREATE TABLE public.scores (
  id bigserial PRIMARY KEY,
  chart_id bigint NOT NULL REFERENCES public.ranked_charts(id),
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  score int NOT NULL CHECK (score >= 0),
  accuracy numeric NOT NULL CHECK (accuracy BETWEEN 0 AND 100),
  max_combo int NOT NULL CHECK (max_combo >= 0),
  perfect int NOT NULL CHECK (perfect >= 0),
  good int NOT NULL CHECK (good >= 0),
  "offset" int NOT NULL CHECK ("offset" >= 0),
  miss int NOT NULL CHECK (miss >= 0),
  holds_complete int NOT NULL CHECK (holds_complete >= 0),
  rank text NOT NULL CHECK (rank IN ('S', 'A', 'B', 'C', 'D')),
  platform text CHECK (platform IN ('pc', 'mobile')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX scores_user_recent ON public.scores (user_id, created_at DESC);
CREATE INDEX scores_best_by_chart ON public.scores (chart_id, user_id, score DESC, created_at, id);
ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scores FROM PUBLIC, anonymous, authenticated;
REVOKE ALL ON SEQUENCE public.scores_id_seq FROM PUBLIC, anonymous, authenticated;

-- Score possível + freio de spam (mesmas regras da #5, agora por user_id).
CREATE FUNCTION internal.check_ranked_score() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  chart public.ranked_charts%ROWTYPE;
  submitted_at timestamptz;
BEGIN
  SELECT c.* INTO chart FROM public.ranked_charts AS c WHERE c.id = NEW.chart_id AND c.active FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ranking indisponível para esta versão.';
  END IF;
  IF NEW.score NOT BETWEEN 0 AND chart.max_score THEN
    RAISE EXCEPTION 'Pontuação fora do limite desta fase.';
  END IF;
  IF NEW.perfect::bigint + NEW.good + NEW."offset" > chart.note_count
     OR NEW.miss > chart.note_count::bigint * 4
     OR NEW.max_combo > chart.note_count OR NEW.holds_complete > chart.note_count
     OR NEW.holds_complete > NEW.perfect::bigint + NEW.good + NEW."offset" THEN
    RAISE EXCEPTION 'As estatísticas ultrapassam os limites desta fase.';
  END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('octobeat:score:' || NEW.user_id, 0));
    submitted_at := clock_timestamp();
    IF EXISTS (SELECT 1 FROM public.scores AS s WHERE s.user_id = NEW.user_id
               AND s.chart_id = NEW.chart_id AND s.created_at > submitted_at - interval '30 seconds') THEN
      RAISE EXCEPTION 'Aguarde 30 segundos entre envios para esta fase.';
    END IF;
    IF (SELECT count(*) FROM public.scores AS s WHERE s.user_id = NEW.user_id
        AND s.created_at >= date_trunc('day', submitted_at, 'UTC')) >= 200 THEN
      RAISE EXCEPTION 'Limite diário de 200 envios atingido.';
    END IF;
    NEW.created_at := submitted_at;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER check_ranked_score BEFORE INSERT OR UPDATE ON public.scores
  FOR EACH ROW EXECUTE FUNCTION internal.check_ranked_score();

-- ── 5. Leituras internas do ranking ──────────────────────────────────────
-- Perfis que aparecem em rankings e perfis públicos (moderação).
CREATE FUNCTION internal.listed(p_status text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$ SELECT p_status <> 'hidden' $$;

-- Melhor score por jogador num chart, com posição.
CREATE FUNCTION internal.chart_positions(p_chart_id bigint)
RETURNS TABLE ("position" bigint, user_id uuid, score int, accuracy numeric, max_combo int,
               rank text, platform text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT row_number() OVER (ORDER BY b.score DESC, b.created_at, b.id),
    b.user_id, b.score, b.accuracy, b.max_combo, b.rank, b.platform, b.created_at
  FROM (
    SELECT DISTINCT ON (s.user_id) s.*
    FROM public.scores AS s
    JOIN public.ranked_charts AS c ON c.id = s.chart_id AND c.active
    JOIN public.profiles AS p ON p.user_id = s.user_id AND internal.listed(p.moderation_status)
    WHERE s.chart_id = p_chart_id
    ORDER BY s.user_id, s.score DESC, s.created_at, s.id
  ) AS b
$$;

-- Melhor por jogador em cada chart ativo (opcionalmente de uma dificuldade).
CREATE FUNCTION internal.active_bests(p_difficulty text)
RETURNS TABLE ("position" bigint, user_id uuid, chart_id bigint, song_slug text, title text,
               difficulty text, score int, accuracy numeric, rank text, created_at timestamptz, has_s boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT r.position, r.user_id, c.id, c.song_slug, c.title, c.difficulty, r.score, r.accuracy, r.rank, r.created_at,
    EXISTS (SELECT 1 FROM public.scores AS s WHERE s.chart_id = c.id AND s.user_id = r.user_id AND s.rank = 'S')
  FROM public.ranked_charts AS c
  CROSS JOIN LATERAL internal.chart_positions(c.id) AS r
  WHERE c.active AND (p_difficulty IS NULL OR c.difficulty = p_difficulty)
$$;

-- Ranking geral: soma dos melhores; desempate por quem chegou primeiro.
CREATE FUNCTION internal.global_positions(p_difficulty text)
RETURNS TABLE ("position" bigint, user_id uuid, total_score bigint, charts_played int, s_ranks int, avg_accuracy numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT row_number() OVER (ORDER BY sum(b.score) DESC, max(b.created_at), b.user_id),
    b.user_id, sum(b.score), count(*)::int, (count(*) FILTER (WHERE b.has_s))::int, round(avg(b.accuracy), 2)
  FROM internal.active_bests(p_difficulty) AS b
  GROUP BY b.user_id
$$;

-- Exige jogador logado; devolve o user_id.
CREATE FUNCTION internal.require_user() RETURNS uuid
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Entre na sua conta para continuar.';
  END IF;
  RETURN uid;
END;
$$;

CREATE FUNCTION internal.profile_json(p public.profiles, p_private boolean) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'username', p.username, 'username_slug', p.username_slug, 'display_name', p.display_name,
    'bio', p.bio, 'avatar_config', p.avatar_config, 'created_at', p.created_at)
  || CASE WHEN p_private THEN jsonb_build_object(
       'visibility', p.visibility, 'moderation_status', p.moderation_status, 'updated_at', p.updated_at)
     ELSE '{}'::jsonb END
$$;

-- ── 6. RPCs públicas (visitante e jogador) ───────────────────────────────
CREATE FUNCTION public.username_available(p_username text) RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE cleaned text := internal.normalize_username(p_username);
BEGIN
  IF NOT internal.valid_username(cleaned) THEN
    RETURN json_build_object('available', false, 'reason', 'Use só letras, números e espaços no usuário.');
  END IF;
  -- Ocupado por um perfil, ou por uma conta usuário+senha ainda sem perfil.
  IF EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.username_slug = internal.username_slug(cleaned))
     OR EXISTS (SELECT 1 FROM neon_auth."user" AS u WHERE lower(u.email) = internal.password_account_email(cleaned)) THEN
    RETURN json_build_object('available', false, 'reason', 'Este nome de usuário já está em uso.');
  END IF;
  RETURN json_build_object('available', true, 'username', cleaned,
    'login_email', internal.password_account_email(cleaned));
END;
$$;

CREATE FUNCTION public.get_leaderboard(p_chart_id bigint, p_limit int DEFAULT 50)
RETURNS TABLE ("position" bigint, display_name text, username_slug text, score int, accuracy numeric,
               max_combo int, rank text, platform text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT r.position, p.display_name, p.username_slug, r.score, r.accuracy, r.max_combo, r.rank, r.platform, r.created_at
  FROM internal.chart_positions(p_chart_id) AS r JOIN public.profiles AS p ON p.user_id = r.user_id
  ORDER BY r.position LIMIT greatest(0, least(50, coalesce(p_limit, 50)))
$$;

CREATE FUNCTION public.get_global_leaderboard(p_difficulty text DEFAULT NULL, p_limit int DEFAULT 50)
RETURNS TABLE ("position" bigint, display_name text, username_slug text, total_score bigint,
               charts_played int, s_ranks int, avg_accuracy numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_difficulty IS NOT NULL AND p_difficulty NOT IN ('easy', 'normal', 'hard') THEN
    RAISE EXCEPTION 'Dificuldade inválida.';
  END IF;
  RETURN QUERY
    SELECT g.position, p.display_name, p.username_slug, g.total_score, g.charts_played, g.s_ranks, g.avg_accuracy
    FROM internal.global_positions(p_difficulty) AS g JOIN public.profiles AS p ON p.user_id = g.user_id
    ORDER BY g.position LIMIT greatest(0, least(50, coalesce(p_limit, 50)));
END;
$$;

-- Perfil público por slug. Privado: só nome/avatar (o dono vê tudo).
-- Campos `level`, `achievements` e `published_charts` são o contrato para
-- #13/#7: hoje vêm vazios, sem tabelas próprias.
CREATE FUNCTION public.get_player_profile(p_slug text) RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  p public.profiles%ROWTYPE;
  own boolean;
  g record;
BEGIN
  SELECT * INTO p FROM public.profiles AS x WHERE x.username_slug = lower(btrim(p_slug));
  own := FOUND AND coalesce(p.user_id = auth.uid(), false);
  IF NOT FOUND OR (NOT internal.listed(p.moderation_status) AND NOT own) THEN
    RAISE EXCEPTION 'Jogador não encontrado.';
  END IF;
  IF p.visibility = 'private' AND NOT own THEN
    RETURN json_build_object('username_slug', p.username_slug, 'display_name', p.display_name,
      'avatar_config', p.avatar_config, 'private', true);
  END IF;
  SELECT * INTO g FROM internal.global_positions(NULL) AS x WHERE x.user_id = p.user_id;
  RETURN (internal.profile_json(p, own) || jsonb_build_object(
    'private', false,
    'own', own,
    'submissions', (SELECT count(*) FROM public.scores AS s WHERE s.user_id = p.user_id),
    'charts_played', coalesce(g.charts_played, 0),
    's_ranks', coalesce(g.s_ranks, 0),
    'total_score', coalesce(g.total_score, 0),
    'global_position', g.position,
    'best', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'song_slug', b.song_slug, 'title', b.title, 'difficulty', b.difficulty, 'score', b.score,
        'accuracy', b.accuracy, 'rank', b.rank, 'position', b.position, 'created_at', b.created_at)
        ORDER BY b.song_slug, CASE b.difficulty WHEN 'easy' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END)
      FROM internal.active_bests(NULL) AS b WHERE b.user_id = p.user_id), '[]'::jsonb),
    'level', NULL,
    'achievements', '[]'::jsonb,
    'published_charts', '[]'::jsonb
  ))::json;
END;
$$;

-- ── 7. RPCs do jogador logado ────────────────────────────────────────────
-- Perfil do próprio jogador, ou null (conta nova sem @usuário: front pede um).
CREATE FUNCTION public.get_my_profile() RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT internal.profile_json(p, true)::json FROM public.profiles AS p WHERE p.user_id = internal.require_user()
$$;

CREATE FUNCTION public.create_my_profile(p_username text, p_display_name text DEFAULT NULL) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  uid uuid := internal.require_user();
  cleaned text := internal.normalize_username(p_username);
  shown text := btrim(coalesce(nullif(btrim(p_display_name), ''), internal.normalize_username(p_username)));
  account_email text;
  created public.profiles%ROWTYPE;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.user_id = uid) THEN
    RAISE EXCEPTION 'Esta conta já tem um perfil.';
  END IF;
  IF NOT internal.valid_username(cleaned) THEN
    RAISE EXCEPTION 'Use só letras, números e espaços no usuário.';
  END IF;
  IF char_length(shown) NOT BETWEEN 1 AND 255 OR shown ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Nome de exibição inválido.';
  END IF;
  SELECT lower(u.email) INTO account_email FROM neon_auth."user" AS u WHERE u.id = uid;
  -- Conta usuário+senha: o @usuário tem de ser o mesmo do login.
  IF account_email LIKE '%@' || internal.password_account_domain()
     AND account_email <> internal.password_account_email(cleaned) THEN
    RAISE EXCEPTION 'O nome de usuário precisa ser o mesmo usado para entrar.';
  END IF;
  -- Conta Google não pode pegar um nome que já é login de outra conta.
  IF account_email NOT LIKE '%@' || internal.password_account_domain()
     AND EXISTS (SELECT 1 FROM neon_auth."user" AS u WHERE lower(u.email) = internal.password_account_email(cleaned)) THEN
    RAISE EXCEPTION 'Este nome de usuário já está em uso.';
  END IF;
  BEGIN
    INSERT INTO public.profiles (user_id, username, username_slug, display_name)
    VALUES (uid, cleaned, internal.username_slug(cleaned), shown)
    RETURNING * INTO created;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Este nome de usuário já está em uso.';
  END;
  RETURN internal.profile_json(created, true)::json;
END;
$$;

-- Campos null = não mudar. O @usuário (slug) é fixo nesta versão.
CREATE FUNCTION public.update_my_profile(
  p_display_name text DEFAULT NULL, p_bio text DEFAULT NULL,
  p_visibility text DEFAULT NULL, p_avatar_color text DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  uid uuid := internal.require_user();
  shown text := btrim(p_display_name);
  updated public.profiles%ROWTYPE;
BEGIN
  IF p_display_name IS NOT NULL AND (char_length(shown) NOT BETWEEN 1 AND 255 OR shown ~ '[[:cntrl:]]') THEN
    RAISE EXCEPTION 'Nome de exibição inválido.';
  END IF;
  IF p_bio IS NOT NULL AND char_length(p_bio) > 280 THEN
    RAISE EXCEPTION 'A bio pode ter até 280 caracteres.';
  END IF;
  IF p_visibility IS NOT NULL AND p_visibility NOT IN ('public', 'private') THEN
    RAISE EXCEPTION 'Visibilidade inválida.';
  END IF;
  IF p_avatar_color IS NOT NULL AND NOT (p_avatar_color = ANY (internal.avatar_colors())) THEN
    RAISE EXCEPTION 'Cor de avatar inválida.';
  END IF;
  UPDATE public.profiles AS p SET
    display_name = coalesce(shown, p.display_name),
    bio = coalesce(p_bio, p.bio),
    visibility = coalesce(p_visibility, p.visibility),
    avatar_config = CASE WHEN p_avatar_color IS NULL THEN p.avatar_config
                         ELSE jsonb_set(p.avatar_config, '{color}', to_jsonb(p_avatar_color)) END,
    updated_at = now()
  WHERE p.user_id = uid
  RETURNING * INTO updated;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Crie seu perfil antes de editar.';
  END IF;
  RETURN internal.profile_json(updated, true)::json;
END;
$$;

CREATE FUNCTION public.submit_score(
  p_chart_id bigint, p_score int, p_accuracy numeric, p_max_combo int,
  p_perfect int, p_good int, p_offset int, p_miss int, p_holds_complete int, p_rank text,
  p_platform text DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  uid uuid := internal.require_user();
  status text;
  result json;
BEGIN
  SELECT p.moderation_status INTO status FROM public.profiles AS p WHERE p.user_id = uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Crie seu perfil para entrar no ranking.';
  END IF;
  IF status = 'suspended' OR (SELECT coalesce(u.banned, false) FROM neon_auth."user" AS u WHERE u.id = uid) THEN
    RAISE EXCEPTION 'Sua conta não pode enviar pontuações no momento.';
  END IF;
  IF p_platform IS NOT NULL AND p_platform NOT IN ('pc', 'mobile') THEN
    RAISE EXCEPTION 'Plataforma inválida.';
  END IF;
  INSERT INTO public.scores (chart_id, user_id, score, accuracy, max_combo, perfect, good, "offset", miss, holds_complete, rank, platform)
  VALUES (p_chart_id, uid, p_score, p_accuracy, p_max_combo, p_perfect, p_good, p_offset, p_miss, p_holds_complete, p_rank, p_platform);
  SELECT json_build_object('position', r.position, 'best_score', r.score) INTO result
    FROM internal.chart_positions(p_chart_id) AS r WHERE r.user_id = uid;
  RETURN result;
END;
$$;

-- ── 8. Permissões ────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.ranked_charts TO authenticated;
DROP POLICY IF EXISTS ranked_charts_active ON public.ranked_charts;
CREATE POLICY ranked_charts_active ON public.ranked_charts FOR SELECT TO anonymous, authenticated USING (active);

-- Funções internas: ninguém além do dono (as RPCs rodam como dono).
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA internal FROM PUBLIC;
-- Funções futuras nascem fechadas: cada RPC pública precisa de GRANT explícito.
ALTER DEFAULT PRIVILEGES IN SCHEMA internal REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

REVOKE ALL ON FUNCTION
  public.username_available(text), public.get_leaderboard(bigint, int),
  public.get_global_leaderboard(text, int), public.get_player_profile(text),
  public.get_my_profile(), public.create_my_profile(text, text),
  public.update_my_profile(text, text, text, text),
  public.submit_score(bigint, int, numeric, int, int, int, int, int, int, text, text)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  public.username_available(text), public.get_leaderboard(bigint, int),
  public.get_global_leaderboard(text, int), public.get_player_profile(text)
TO anonymous, authenticated;

GRANT EXECUTE ON FUNCTION
  public.get_my_profile(), public.create_my_profile(text, text),
  public.update_my_profile(text, text, text, text),
  public.submit_score(bigint, int, numeric, int, int, int, int, int, int, text, text)
TO authenticated;
