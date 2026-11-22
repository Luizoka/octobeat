-- 005 — O jogador apaga a própria conta (LGPD / issue #6).
-- Apaga o usuário no Neon Auth; perfil e scores somem em cascata
-- (profiles.user_id → neon_auth.user ON DELETE CASCADE; scores → profiles).
--
-- Confirmação no servidor (não só no front): o jogador digita o próprio
-- @usuário; conta ainda sem perfil confirma com a palavra "excluir".

CREATE FUNCTION public.delete_my_account(p_confirm text) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  uid uuid := internal.require_user();
  slug text;
  expected text;
BEGIN
  SELECT p.username_slug INTO slug FROM public.profiles AS p WHERE p.user_id = uid;
  expected := coalesce(slug, 'excluir');
  IF p_confirm IS NULL
     OR internal.username_slug(internal.normalize_username(p_confirm)) <> expected THEN
    RAISE EXCEPTION 'Confirmação incorreta. Digite % para excluir a conta.',
      CASE WHEN slug IS NULL THEN '"excluir"' ELSE 'o seu nome de usuário' END;
  END IF;
  DELETE FROM neon_auth.session WHERE "userId" = uid;
  DELETE FROM neon_auth.account WHERE "userId" = uid;
  DELETE FROM neon_auth."user" WHERE id = uid;
  RETURN json_build_object('deleted', true);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_my_account(text) TO authenticated;
