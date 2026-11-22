CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anonymous') THEN
    BEGIN
      CREATE ROLE anonymous NOLOGIN;
    EXCEPTION WHEN duplicate_object THEN
      -- Uma migração concorrente em outro banco pode ter criado o papel.
      NULL;
    END;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.players (
  id bigserial PRIMARY KEY,
  username text NOT NULL CONSTRAINT players_username_check
    CHECK (char_length(username) BETWEEN 1 AND 255 AND username COLLATE "C" !~ '[^A-Za-z0-9 ]'),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX IF NOT EXISTS players_username_ci ON public.players (lower(username COLLATE "C"));
CREATE INDEX IF NOT EXISTS players_created_at ON public.players (created_at);

CREATE TABLE IF NOT EXISTS public.sessions (
  token_hash text PRIMARY KEY,
  player_id bigint NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '720 hours')
);

CREATE TABLE IF NOT EXISTS public.ranked_charts (
  id bigserial PRIMARY KEY,
  song_slug text NOT NULL,
  difficulty text NOT NULL CHECK (difficulty IN ('easy', 'normal', 'hard')),
  chart_version text NOT NULL,
  title text NOT NULL,
  note_count int NOT NULL CHECK (note_count > 0),
  max_score int NOT NULL CHECK (max_score >= 0),
  active boolean NOT NULL DEFAULT true,
  UNIQUE (song_slug, difficulty, chart_version)
);

CREATE TABLE IF NOT EXISTS public.scores (
  id bigserial PRIMARY KEY,
  chart_id bigint NOT NULL REFERENCES public.ranked_charts(id),
  player_id bigint NOT NULL REFERENCES public.players(id),
  user_id uuid,
  score int NOT NULL CHECK (score >= 0),
  accuracy numeric NOT NULL CHECK (accuracy BETWEEN 0 AND 100),
  max_combo int NOT NULL CHECK (max_combo >= 0),
  perfect int NOT NULL CHECK (perfect >= 0),
  good int NOT NULL CHECK (good >= 0),
  "offset" int NOT NULL CHECK ("offset" >= 0),
  miss int NOT NULL CHECK (miss >= 0),
  holds_complete int NOT NULL CHECK (holds_complete >= 0),
  rank text NOT NULL CHECK (rank IN ('S', 'A', 'B', 'C', 'D')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- Onde a partida foi jogada (informativo; null em envios antigos).
ALTER TABLE public.scores ADD COLUMN IF NOT EXISTS platform text CHECK (platform IN ('pc', 'mobile'));
CREATE INDEX IF NOT EXISTS scores_player_recent ON public.scores (player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS scores_best_by_chart
  ON public.scores (chart_id, player_id, score DESC, created_at, id);

ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ranked_charts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anonymous;
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anonymous;
-- O custo do bcrypt é fixado pelo cadastro, sem acesso direto ao RPC do pgcrypto.
REVOKE EXECUTE ON FUNCTION public.crypt(text, text), public.gen_salt(text), public.gen_salt(text, int)
  FROM PUBLIC, anonymous;
REVOKE ALL ON public.players, public.sessions, public.ranked_charts, public.scores FROM PUBLIC, anonymous;
REVOKE ALL ON SEQUENCE public.players_id_seq, public.ranked_charts_id_seq, public.scores_id_seq FROM PUBLIC, anonymous;
GRANT SELECT ON public.ranked_charts TO anonymous;
DROP POLICY IF EXISTS ranked_charts_active ON public.ranked_charts;
CREATE POLICY ranked_charts_active ON public.ranked_charts FOR SELECT TO anonymous USING (active);

CREATE OR REPLACE FUNCTION public.check_ranked_score()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  chart public.ranked_charts%ROWTYPE;
  submitted_at timestamptz;
  day_start timestamptz;
BEGIN
  SELECT c.* INTO chart FROM public.ranked_charts AS c
  WHERE c.id = NEW.chart_id AND c.active FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ranking indisponível para esta versão.';
  END IF;
  IF NEW.score IS NULL OR NEW.score NOT BETWEEN 0 AND chart.max_score THEN
    RAISE EXCEPTION 'Pontuação fora do limite desta fase.';
  END IF;
  IF NEW.perfect::bigint + NEW.good + NEW."offset" > chart.note_count
     OR NEW.miss > chart.note_count::bigint * 4
     OR NEW.max_combo > chart.note_count OR NEW.holds_complete > chart.note_count
     OR NEW.holds_complete > NEW.perfect::bigint + NEW.good + NEW."offset" THEN
    RAISE EXCEPTION 'As estatísticas ultrapassam os limites desta fase.';
  END IF;
  IF NEW.accuracy IS NULL OR NEW.accuracy NOT BETWEEN 0 AND 100
     OR NEW.max_combo IS NULL OR NEW.perfect IS NULL OR NEW.good IS NULL OR NEW."offset" IS NULL
     OR NEW.miss IS NULL OR NEW.holds_complete IS NULL OR NEW.rank IS NULL
     OR least(NEW.max_combo, NEW.perfect, NEW.good, NEW."offset", NEW.miss, NEW.holds_complete) < 0
     OR NEW.rank NOT IN ('S', 'A', 'B', 'C', 'D') THEN
    RAISE EXCEPTION 'As estatísticas da partida são inválidas.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Serializa envios do mesmo jogador, inclusive para charts diferentes.
    PERFORM pg_advisory_xact_lock(hashtextextended('octobeat:score:' || NEW.player_id, 0));
    submitted_at := clock_timestamp();
    day_start := date_trunc('day', submitted_at, 'UTC');
    IF EXISTS (
      SELECT 1 FROM public.scores AS s WHERE s.player_id = NEW.player_id
        AND s.chart_id = NEW.chart_id AND s.created_at > submitted_at - interval '30 seconds'
    ) THEN
      RAISE EXCEPTION 'Aguarde 30 segundos entre envios para esta fase.';
    END IF;
    IF (SELECT count(*) FROM public.scores AS s WHERE s.player_id = NEW.player_id AND s.created_at >= day_start) >= 200 THEN
      RAISE EXCEPTION 'Limite diário de 200 envios atingido.';
    END IF;
    NEW.created_at := submitted_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_ranked_score ON public.scores;
CREATE TRIGGER check_ranked_score BEFORE INSERT OR UPDATE ON public.scores
  FOR EACH ROW EXECUTE FUNCTION public.check_ranked_score();

CREATE OR REPLACE FUNCTION public.new_ranked_session(p_player_id bigint, p_username text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  token text := encode(public.gen_random_bytes(32), 'hex');
BEGIN
  INSERT INTO public.sessions (token_hash, player_id)
  VALUES (encode(public.digest(token, 'sha256'), 'hex'), p_player_id);
  RETURN json_build_object('token', token, 'username', p_username);
END;
$$;

-- O bcrypt aceita até 72 bytes. Senhas multibyte mais longas entram como SHA-256 em hex.
CREATE OR REPLACE FUNCTION public.ranked_password_material(p_password text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN octet_length(p_password) > 72
    THEN encode(public.digest(p_password, 'sha256'), 'hex')
    ELSE p_password END;
$$;

CREATE OR REPLACE FUNCTION public.register(p_username text, p_password text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  cleaned text := regexp_replace(btrim(p_username, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), '[[:space:]]+', ' ', 'g');
  new_id bigint;
BEGIN
  IF cleaned IS NULL OR char_length(cleaned) NOT BETWEEN 1 AND 255 OR cleaned COLLATE "C" ~ '[^A-Za-z0-9 ]' THEN
    RAISE EXCEPTION 'Use só letras, números e espaços no usuário.';
  END IF;
  IF p_password IS NULL OR char_length(p_password) NOT BETWEEN 6 AND 255 THEN
    RAISE EXCEPTION 'A senha precisa ter pelo menos 6 caracteres.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('octobeat:register', 0));
  IF EXISTS (SELECT 1 FROM public.players AS p WHERE lower(p.username COLLATE "C") = lower(cleaned COLLATE "C")) THEN
    RAISE EXCEPTION 'Este nome de usuário já está em uso.';
  END IF;
  IF (SELECT count(*) FROM public.players AS p WHERE p.created_at > clock_timestamp() - interval '1 minute') >= 5 THEN
    RAISE EXCEPTION 'Limite de cadastros atingido. Tente novamente em um minuto.';
  END IF;
  INSERT INTO public.players (username, password_hash)
  VALUES (cleaned, CASE WHEN octet_length(p_password) > 72 THEN 'sha256:' ELSE '' END
    || public.crypt(public.ranked_password_material(p_password), public.gen_salt('bf', 10)))
  RETURNING id INTO new_id;
  RETURN public.new_ranked_session(new_id, cleaned);
END;
$$;

CREATE OR REPLACE FUNCTION public.login(p_username text, p_password text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  cleaned text := regexp_replace(btrim(p_username, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), '[[:space:]]+', ' ', 'g');
  player public.players%ROWTYPE;
  prefix text;
  salt text;
BEGIN
  IF p_password IS NULL OR char_length(p_password) NOT BETWEEN 6 AND 255 THEN
    RAISE EXCEPTION 'Usuário ou senha inválidos.';
  END IF;
  SELECT p.* INTO player FROM public.players AS p WHERE lower(p.username COLLATE "C") = lower(cleaned COLLATE "C");
  prefix := CASE WHEN octet_length(p_password) > 72 THEN 'sha256:' ELSE '' END;
  -- Também calcula bcrypt para usuário desconhecido, com o mesmo custo.
  salt := coalesce(right(player.password_hash, 60), '$2a$10$abcdefghijklmnopqrstuu');
  IF (prefix || public.crypt(public.ranked_password_material(p_password), salt)) IS DISTINCT FROM player.password_hash THEN
    RAISE EXCEPTION 'Usuário ou senha inválidos.';
  END IF;
  RETURN public.new_ranked_session(player.id, player.username);
END;
$$;

CREATE OR REPLACE FUNCTION public.logout(p_token text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DELETE FROM public.sessions AS s WHERE s.token_hash = encode(public.digest(p_token, 'sha256'), 'hex');
$$;

-- Mudar o tipo de retorno exige DROP (CREATE OR REPLACE não troca colunas).
DROP FUNCTION IF EXISTS public.get_leaderboard(bigint, int);
DROP FUNCTION IF EXISTS public.ranked_positions(bigint);
DROP FUNCTION IF EXISTS public.submit_score(text, bigint, int, numeric, int, int, int, int, int, int, text);

CREATE OR REPLACE FUNCTION public.ranked_positions(p_chart_id bigint)
RETURNS TABLE ("position" bigint, player_id bigint, score int, accuracy numeric, max_combo int, rank text, created_at timestamptz, platform text)
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT row_number() OVER (ORDER BY best.score DESC, best.created_at, best.id),
    best.player_id, best.score, best.accuracy, best.max_combo, best.rank, best.created_at, best.platform
  FROM (
    SELECT DISTINCT ON (s.player_id) s.id, s.player_id, s.score, s.accuracy, s.max_combo, s.rank, s.created_at, s.platform
    FROM public.scores AS s JOIN public.ranked_charts AS c ON c.id = s.chart_id
    WHERE s.chart_id = p_chart_id AND c.active
    ORDER BY s.player_id, s.score DESC, s.created_at, s.id
  ) AS best;
$$;

CREATE OR REPLACE FUNCTION public.get_leaderboard(p_chart_id bigint, p_limit int DEFAULT 50)
RETURNS TABLE ("position" bigint, username text, score int, accuracy numeric, max_combo int, rank text, created_at timestamptz, platform text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT r.position, p.username, r.score, r.accuracy, r.max_combo, r.rank, r.created_at, r.platform
  FROM public.ranked_positions(p_chart_id) AS r JOIN public.players AS p ON p.id = r.player_id
  ORDER BY r.position LIMIT greatest(0, least(50, coalesce(p_limit, 50)));
$$;

CREATE OR REPLACE FUNCTION public.submit_score(
  p_token text, p_chart_id bigint, p_score int, p_accuracy numeric, p_max_combo int,
  p_perfect int, p_good int, p_offset int, p_miss int, p_holds_complete int, p_rank text,
  p_platform text DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  session_player bigint;
  result json;
BEGIN
  SELECT s.player_id INTO session_player FROM public.sessions AS s
    WHERE s.token_hash = encode(public.digest(p_token, 'sha256'), 'hex') AND s.expires_at > clock_timestamp()
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão inválida ou expirada. Entre novamente.';
  END IF;
  IF p_platform IS NOT NULL AND p_platform NOT IN ('pc', 'mobile') THEN
    RAISE EXCEPTION 'Plataforma inválida.';
  END IF;
  INSERT INTO public.scores (chart_id, player_id, score, accuracy, max_combo, perfect, good, "offset", miss, holds_complete, rank, platform)
  VALUES (p_chart_id, session_player, p_score, p_accuracy, p_max_combo, p_perfect, p_good, p_offset, p_miss, p_holds_complete, p_rank, p_platform);
  SELECT json_build_object('position', r.position, 'best_score', r.score) INTO result
    FROM public.ranked_positions(p_chart_id) AS r WHERE r.player_id = session_player;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.check_ranked_score(), public.new_ranked_session(bigint, text),
  public.ranked_password_material(text), public.ranked_positions(bigint) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.register(text, text), public.login(text, text), public.logout(text),
  public.get_leaderboard(bigint, int),
  public.submit_score(text, bigint, int, numeric, int, int, int, int, int, int, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register(text, text), public.login(text, text), public.logout(text),
  public.get_leaderboard(bigint, int),
  public.submit_score(text, bigint, int, numeric, int, int, int, int, int, int, text, text) TO anonymous;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.players, public.sessions, public.ranked_charts, public.scores FROM authenticated;
    REVOKE ALL ON SEQUENCE public.players_id_seq, public.ranked_charts_id_seq, public.scores_id_seq FROM authenticated;
    REVOKE ALL ON FUNCTION public.check_ranked_score(), public.new_ranked_session(bigint, text),
      public.ranked_password_material(text), public.ranked_positions(bigint),
      public.register(text, text), public.login(text, text), public.logout(text),
      public.get_leaderboard(bigint, int),
      public.submit_score(text, bigint, int, numeric, int, int, int, int, int, int, text, text) FROM authenticated;
  END IF;
END;
$$;
