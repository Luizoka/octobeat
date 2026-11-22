# Histórico de versões

## [1.0.1] - 2026-11-22

- Início das músicas: as primeiras notas agora descem desde o topo da pista (pré-rolo com folga antes do áudio), em vez de aparecerem perto da linha de acerto logo após a contagem.
- Perfil reorganizado: cabeçalho com nome em destaque, números em cartões, seções separadas e zona de perigo isolada; edição com Cancelar/Salvar.

## [1.0.0] - 2026-11-22

- Jogo de ritmo com 8 colunas, quatro músicas incluídas, notas longas (holds) e multiplicador Fever por combo.
- Suporte a teclado, mouse e toque simultâneo em várias colunas, com layout para celular na horizontal.
- Ranking por música e geral, com filtros de dificuldade e fases ranqueadas congeladas por versão.
- Contas com Google ou usuário e senha. Perfil com nome de exibição, bio, cor do polvo e opção de visibilidade privada.
- Painel de privacidade e exclusão da própria conta, com remoção de perfil, pontuações e login.
- Bateria dos MIDIs tocada com a TR-808 (antes caía num instrumento melódico).
- Segurança no banco (RLS + funções) com testes automáticos de políticas; moderação pelo terminal (`npm run db:moderate`).
- CI no GitHub: testes e build em todo PR.

### Problemas conhecidos e limitações

- Quem chama a API diretamente pode forjar pontuações dentro dos limites validados pelo servidor.
- Contas com usuário e senha não têm recuperação por e-mail.
- Versões do Safari anteriores à 18.4 podem não manter a sessão.
