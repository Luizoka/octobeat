# OctoBeat

Jogo de ritmo casual para navegador inspirado em Piano Tiles e Guitar Hero. O foco e acompanhar o ritmo, nao simular um piano real.

## Como rodar

No terminal, dentro da pasta do projeto, instale as dependências:

```bash
npm install
```

Depois rode o servidor de desenvolvimento:

```bash
npm run dev
```

Abra no navegador o endereço exibido pelo Vite, normalmente `http://localhost:5173`.
Para encerrar o servidor, use `Ctrl + C` no terminal.

## Controles

As 8 colunas usam `A`, `S`, `D`, `F`, `J`, `K`, `L` e `Ç`.

Em teclados sem `Ç`, a ultima coluna tambem aceita `;`.

No celular/tablet, toque direto nas colunas da pista (a coluna inteira vale, não só a tecla desenhada). Vários dedos ao mesmo tempo funcionam para acordes, e nas notas longas é só manter o dedo na coluna. Arrastar o dedo para outra coluna conta como soltar. Deslizar não acerta notas. O mouse também funciona na pista.

## Celular

- **O site todo é pensado na horizontal.** Com o celular em pé aparece um aviso com o botão grande "Girar para a horizontal". Nos menus dá para seguir em pé ("Continuar na vertical mesmo assim"); na partida não: ela não começa e, se o celular for girado no meio, pausa. Tablets em pé (lado curto ≥ 600 px) não veem o aviso.
- **Tela de jogo no celular:** a pista fica no centro, na altura toda. Pontos, precisão e progresso ficam soltos na lateral esquerda; multiplicador e nota, na direita; o botão de pausa (que também leva às configurações) flutua no canto.
- **Tela cheia.** Em celulares/tablets, a tela de preparação oferece "Jogar em tela cheia". Onde o navegador deixa, o jogo também tenta travar a tela na horizontal (`screen.orientation.lock`).
- **Limitações reais do navegador:**
  - Um site **não consegue girar a tela sozinho**. O bloqueio de orientação só funciona em tela cheia e em navegadores que suportam a Screen Orientation API (na prática, Chrome/Edge/Samsung Internet no Android).
  - No **iPhone (Safari)** não há tela cheia para páginas nem bloqueio de orientação. O botão de tela cheia não aparece e o jogo mostra o aviso para girar manualmente. Para jogar sem a barra do Safari, use *Compartilhar → Adicionar à Tela de Início*.
  - Se a tela não girar, confira se a rotação automática do aparelho está ligada.
  - O áudio só começa depois de um toque (regra dos navegadores móveis). Por isso, se o jogo esperar o aparelho girar, aparece o botão "Começar". No iPhone com a chave de silêncio ligada, o som depende do Safari 16.4+ (`navigator.audioSession`).
- **Interrupções.** Trocar de app, bloquear a tela, receber ligação, sair da tela cheia ou girar para retrato pausa a partida. Se isso acontecer na contagem, ela é cancelada. Toques cancelados pelo sistema soltam a coluna, para nenhuma nota ficar presa.
- **Desempenho:** no celular as partículas saem em menor quantidade e em resolução 1× (eram o efeito mais caro). Os outros efeitos continuam iguais e podem ser ajustados em Configurações.
- **Pausa** não recarrega o SoundFont: os instrumentos ficam carregados enquanto a música for a mesma (também ao reiniciar).
- Para testar no celular na mesma rede: `npm run play` e abra o endereço de rede exibido pelo Vite.

## Estado atual

A versão 1.0 traz quatro músicas, 8 colunas, notas longas, Fever e suporte a celular na horizontal. Também é possível importar MIDI e MusicXML para jogar localmente. As fases oficiais têm ranking por música e geral, com contas Google ou usuário e senha, perfis e opção de excluir a conta.

Veja as novidades e limitações no [histórico da versão](CHANGELOG.md) e os detalhes técnicos em [Arquitetura](docs/architecture.md).

## Formato de fase

Formato recomendado:

```json
{
  "title": "Nome da fase",
  "artist": "Artista",
  "notes": [
    { "time": 1.2, "key": 0 },
    { "time": 1.6, "key": 1 },
    { "time": 2.0, "key": 3 }
  ]
}
```

O jogo tambem aceita temporariamente o formato antigo:

```json
[
  { "time": 1.2, "key": 0 },
  { "time": 1.6, "key": 1 },
  { "time": 2.0, "key": 3 }
]
```

`time` e o momento em segundos. `key` e a coluna, de `0` a `7`.

## Fluxo de fase real

### A partir de MIDI ou MusicXML

1. A tela inicial é `Música`. Clique em `Escolher MIDI / MusicXML`.
2. Confira os dados e as tracks. Tracks de piano são selecionadas automaticamente quando existirem.
3. Clique em `Jogar agora`. O OctoBeat gera o chart, abre o jogo, carrega os instrumentos e inicia após a contagem.
5. Opcionalmente associe um áudio local e exporte o JSON da fase.

## Ranking (Neon)

Abra **Ranking** para ver a classificação por música ou a aba **Geral**, com filtro por dificuldade.
Clique no nome de um jogador para abrir o perfil. Entre com **Google** ou com **usuário e senha**
pela tela inicial ou pelo resultado. No primeiro acesso com Google, escolha seu nome de usuário.
Em fases ranqueadas no modo duas mãos, a pontuação é enviada automaticamente após entrar e criar o perfil.
Você também pode continuar como convidado e jogar sem enviar pontuações.

Arquitetura, regras do banco e checklist para novas features: [`docs/architecture.md`](docs/architecture.md).
Migrações ficam em `db/migrations/` (rodam uma vez; `npm run db:migrate -- --status` mostra o estado)
e testes de segurança em `scripts/db/policies/` (`npm run db:test-policies [suíte]`).

### Configurar o Neon

1. Crie um projeto Neon com Postgres 18 ou anterior e escolha a branch e o banco que vão receber o ranking.
   Em **Postgres database → Data API**, ative a API com **Neon Auth** (padrão; ele
   fornece o JWT anônimo) e deixe **Grant public schema access** desmarcado. Em **Settings**, exponha o
   schema `public` e use `anonymous` como **Anonymous role**.
   [Configuração da Data API](https://neon.com/docs/data-api/get-started)
2. Em **CORS allowed origins**, configure `https://octobeat.luizoka.dev`,
   `http://localhost:5173` e `http://localhost:4173`.
   [Configurações avançadas da Data API](https://neon.com/docs/data-api/manage#advanced-settings)
3. Copie `.env.example` para `.env`. Em `DATABASE_URL`, coloque a conexão
   direta do Postgres para a role administradora do banco. Mantenha essa variável
   privada e jamais use o prefixo `VITE_` nela. Em `VITE_NEON_DATA_API_URL`,
   coloque a URL completa exibida na aba **API**, incluindo `/rest/v1` e sem
   acrescentar `/rpc`. Em `VITE_NEON_AUTH_URL`, coloque a URL do Neon Auth
   (a do JWKS sem `/.well-known/jwks.json`, terminando em `/neondb/auth`). A Data API
   exige JWT até para o papel `anonymous`: o cliente busca um JWT anônimo em
   `<auth>/token/anonymous` (sem criar conta). No Neon Auth, habilite Google e
   e-mail/senha, autorize as origens do jogo e deixe a verificação obrigatória de e-mail
   desativada para aceitar as contas de usuário e senha. As variáveis `VITE_` são
   distribuídas no bundle do navegador.
4. Rode `npm run db:migrate` para criar o schema e carregar o seed. A migração
   `db/migrations/004_identity.sql` conecta os perfis e as pontuações às contas
   do Neon Auth. No Neon,
   clique em **Refresh schema cache** na aba **API**. Rode
   `npm run db:test-policies` para verificar o acesso como `anonymous`.
   A role usada no teste precisa poder executar `SET ROLE anonymous`, e os
   dados criados pelo teste são revertidos ao final da transação.
5. Reinicie o Vite ou refaça o build com `VITE_NEON_DATA_API_URL` e
   `VITE_NEON_AUTH_URL` configuradas. A ausência delas desativa o ranking online. As fases congeladas continuam
   jogáveis se seus arquivos e os recursos de áudio estiverem acessíveis.

### Adicionar música ou atualizar uma versão

1. Adicione o MIDI a `songs/` e a entrada a `src/songs/catalog.js`.
2. Rode `npm run ranked:freeze`. Faça commit dos JSONs de `public/ranked/`
   e de `db/seeds/ranked_charts.sql` junto com a alteração no catálogo.
3. Rode `npm run db:migrate` no banco da publicação para aplicar o seed e
   publique o novo build. Cada dificuldade tem uma versão baseada nas notas.
   As pontuações ficam na versão em que foram enviadas.

O navegador calcula e envia a pontuação. O banco verifica a sessão, os limites
do chart e a frequência dos envios, mas uma pontuação dentro desses limites
pode ser forjada. As sessões duram 30 dias e o limite diário de envios usa UTC.

## Proximos passos

- Salvar fases no navegador.
- Adicionar suporte opcional a MIDI simplificado.
- Melhorar feedback visual do mascote e das notas.
