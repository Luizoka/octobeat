-- Usuário: letras, números e espaços (1 a 255 caracteres; antes: 3–20 com . _ -).
-- O 001 já cria a tabela com a regra nova; aqui atualiza bancos criados antes.
ALTER TABLE public.players DROP CONSTRAINT IF EXISTS players_username_check;
ALTER TABLE public.players ADD CONSTRAINT players_username_check
  CHECK (char_length(username) BETWEEN 1 AND 255 AND username COLLATE "C" !~ '[^A-Za-z0-9 ]') NOT VALID;
