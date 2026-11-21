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

- **Jogue na horizontal.** Em celular em pé, a partida não começa e aparece o aviso "Gire o celular para jogar". Girar no meio da partida pausa o jogo. Tablets em pé (lado curto ≥ 600 px) podem jogar.
- **Tela cheia.** Em celulares/tablets, a tela de preparação oferece "Jogar em tela cheia". Onde o navegador deixa, o jogo também tenta travar a tela na horizontal (`screen.orientation.lock`).
- **Limitações reais do navegador:**
  - Um site **não consegue girar a tela sozinho**. O bloqueio de orientação só funciona em tela cheia e em navegadores que suportam a Screen Orientation API (na prática, Chrome/Edge/Samsung Internet no Android).
  - No **iPhone (Safari)** não há tela cheia para páginas nem bloqueio de orientação. O botão de tela cheia não aparece e o jogo mostra o aviso para girar manualmente. Para jogar sem a barra do Safari, use *Compartilhar → Adicionar à Tela de Início*.
  - Se a tela não girar, confira se a rotação automática do aparelho está ligada.
  - O áudio só começa depois de um toque (regra dos navegadores móveis). Por isso, se o jogo esperar o aparelho girar, aparece o botão "Começar". No iPhone com a chave de silêncio ligada, o som depende do Safari 16.4+ (`navigator.audioSession`).
- **Interrupções.** Trocar de app, bloquear a tela, receber ligação, sair da tela cheia ou girar para retrato pausa a partida. Se isso acontecer na contagem, ela é cancelada. Toques cancelados pelo sistema soltam a coluna, para nenhuma nota ficar presa.
- Para testar no celular na mesma rede: `npm run play` e abra o endereço de rede exibido pelo Vite.

## Estado atual

- Projeto Node com Vite + React.
- Jogo com 8 colunas e notas caindo.
- Teclado, toque (multitouch) e mouse com deteccao de acerto, erro, pontuacao e combo.
- Layout para celular na horizontal (tela cheia quando o navegador permite).
- Fase demo sincronizada com uma musica sintetizada via Web Audio.
- Importacao de fases JSON no jogo.
- Audio local no jogo para tocar fases importadas.
- Dificuldades leve, normal e rapida.
- Importador MIDI (`.mid`/`.midi`) e MusicXML (`.musicxml`/`.xml`), com seleção de tracks e geração de chart em 8 lanes.
- Reprodução integrada de MIDI por SoundFont General MIDI: todas as tracks habilitadas são ouvidas, enquanto as tracks de piano alimentam o gameplay por padrão.
- Modos de gameplay `Piano`, `Essência da música` e `Personalizado`. A Essência v1 analisa densidade, monofonia, pitch, velocity, duração, atividade e família do instrumento para escolher uma fonte melódica global segura.
- Painel avançado de diagnóstico com ranking, score explicável, NPS e detecção de tracks suspeitas (30+ notas/s).

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

## Proximos passos

- Salvar fases no navegador.
- Adicionar suporte opcional a MIDI simplificado.
- Melhorar feedback visual do mascote e das notas.
