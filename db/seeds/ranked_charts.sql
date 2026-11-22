-- Gerado por npm run ranked:freeze.
INSERT INTO public.ranked_charts (song_slug, difficulty, chart_version, title, note_count, max_score)
VALUES
  ('flower-man', 'easy', 'e455b02bb12d', 'Flower Man', 320, 3575764),
  ('flower-man', 'normal', 'cf147e12da61', 'Flower Man', 427, 6026567),
  ('flower-man', 'hard', '922e36a9c9b7', 'Flower Man', 441, 6381051),
  ('cutie-mew-mew-magic', 'easy', 'ec0e2bd56e2a', 'Cutie Mew Mew Magic', 383, 4845200),
  ('cutie-mew-mew-magic', 'normal', '12af848f68c1', 'Cutie Mew Mew Magic', 401, 5352798),
  ('cutie-mew-mew-magic', 'hard', '566a8cbd5cac', 'Cutie Mew Mew Magic', 672, 13484444),
  ('chaos-king', 'easy', 'd265bd456023', 'Chaos King', 375, 4658955),
  ('chaos-king', 'normal', 'b64370c4ca0b', 'Chaos King', 596, 10798447),
  ('chaos-king', 'hard', '3f9111edc458', 'Chaos King', 968, 26276936),
  ('tv-world', 'easy', 'd408dbc07ffd', 'TV World', 211, 1669634),
  ('tv-world', 'normal', '0a18d66f9ace', 'TV World', 463, 6788325),
  ('tv-world', 'hard', '9bb3ec5eafb0', 'TV World', 777, 17397384),
  ('death-by-glamour', 'easy', 'e8975d1067cc', 'Death by Glamour', 254, 2327868),
  ('death-by-glamour', 'normal', '671dd62d3183', 'Death by Glamour', 479, 7218188),
  ('death-by-glamour', 'hard', 'f34f5deab9bc', 'Death by Glamour', 905, 23103576)
ON CONFLICT (song_slug, difficulty, chart_version) DO NOTHING;
