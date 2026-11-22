CREATE OR REPLACE FUNCTION public.ranked_active_bests(p_difficulty text)
RETURNS TABLE (
  "position" bigint, player_id bigint, song_slug text, title text,
  difficulty text, score int, accuracy numeric, rank text, created_at timestamptz, has_s boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT r.position, r.player_id, c.song_slug, c.title, c.difficulty,
    r.score, r.accuracy, r.rank, r.created_at,
    r.rank = 'S' OR EXISTS (
      SELECT 1 FROM public.scores AS s
      WHERE s.chart_id = c.id AND s.player_id = r.player_id AND s.rank = 'S'
    )
  FROM public.ranked_charts AS c
  CROSS JOIN LATERAL public.ranked_positions(c.id) AS r
  WHERE c.active AND (p_difficulty IS NULL OR c.difficulty = p_difficulty);
$$;

CREATE OR REPLACE FUNCTION public.ranked_global_positions(p_difficulty text)
RETURNS TABLE (
  "position" bigint, player_id bigint, total_score bigint,
  charts_played int, s_ranks int, avg_accuracy numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  -- A última melhor marca indica quando o jogador atingiu a soma atual.
  SELECT row_number() OVER (ORDER BY sum(b.score) DESC, max(b.created_at), b.player_id),
    b.player_id, sum(b.score), count(*)::int,
    (count(*) FILTER (WHERE b.has_s))::int, round(avg(b.accuracy), 2)
  FROM public.ranked_active_bests(p_difficulty) AS b
  GROUP BY b.player_id;
$$;

CREATE OR REPLACE FUNCTION public.get_global_leaderboard(p_difficulty text DEFAULT NULL, p_limit int DEFAULT 50)
RETURNS TABLE (
  "position" bigint, username text, total_score bigint,
  charts_played int, s_ranks int, avg_accuracy numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_difficulty IS NOT NULL AND p_difficulty NOT IN ('easy', 'normal', 'hard') THEN
    RAISE EXCEPTION 'Dificuldade inválida.';
  END IF;
  RETURN QUERY
    SELECT g.position, p.username, g.total_score, g.charts_played, g.s_ranks, g.avg_accuracy
    FROM public.ranked_global_positions(p_difficulty) AS g
    JOIN public.players AS p ON p.id = g.player_id
    ORDER BY g.position LIMIT greatest(0, least(50, coalesce(p_limit, 50)));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_player_profile(p_username text)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  cleaned text := regexp_replace(btrim(p_username, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), '[[:space:]]+', ' ', 'g');
  profile_player_id bigint;
  player_name text;
  joined_at timestamptz;
BEGIN
  SELECT p.id, p.username, p.created_at INTO profile_player_id, player_name, joined_at
  FROM public.players AS p WHERE lower(p.username COLLATE "C") = lower(cleaned COLLATE "C");
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jogador não encontrado.';
  END IF;

  RETURN (SELECT json_build_object(
    'username', player_name,
    'created_at', joined_at,
    'submissions', (SELECT count(*) FROM public.scores AS s WHERE s.player_id = profile_player_id),
    'charts_played', coalesce(g.charts_played, 0),
    's_ranks', coalesce(g.s_ranks, 0),
    'total_score', coalesce(g.total_score, 0),
    'global_position', g.position,
    'best', coalesce((
      SELECT json_agg(json_build_object(
        'song_slug', b.song_slug, 'title', b.title, 'difficulty', b.difficulty,
        'score', b.score, 'accuracy', b.accuracy, 'rank', b.rank,
        'position', b.position, 'created_at', b.created_at
      ) ORDER BY b.song_slug, CASE b.difficulty WHEN 'easy' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, b.position)
      FROM public.ranked_active_bests(NULL) AS b WHERE b.player_id = profile_player_id
    ), '[]'::json)
  )
  FROM (SELECT 1) AS seed
  LEFT JOIN public.ranked_global_positions(NULL) AS g ON g.player_id = profile_player_id);
END;
$$;

REVOKE ALL ON FUNCTION public.ranked_active_bests(text), public.ranked_global_positions(text)
  FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.get_player_profile(text), public.get_global_leaderboard(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_player_profile(text), public.get_global_leaderboard(text, int) TO anonymous;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.ranked_active_bests(text), public.ranked_global_positions(text),
      public.get_player_profile(text), public.get_global_leaderboard(text, int) FROM authenticated;
  END IF;
END;
$$;
