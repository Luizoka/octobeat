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

## Estado atual

- Projeto Node com Vite + React.
- Jogo com 8 colunas e notas caindo.
- Teclado com deteccao de acerto, erro, pontuacao e combo.
- Fase demo sincronizada com uma musica sintetizada via Web Audio.
- Importacao de fases JSON no jogo.
- Audio local no jogo para tocar fases importadas.
- Dificuldades leve, normal e rapida.
- Editor manual com upload de audio, gravacao de teclas no tempo da musica e exportacao JSON com metadados.
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
3. Clique em `Gerar chart e abrir o jogo`.
4. Escolha a dificuldade no modo `Jogo`.
5. Opcionalmente associe um áudio local e exporte o JSON da fase.

### Gravação manual

1. Abra o modo `Editor`.
2. Carregue um audio local.
3. Clique em `Gravar` e toque `A S D F J K L Ç` no ritmo.
4. Exporte o JSON.
5. Volte ao modo `Jogo`.
6. Carregue o JSON em `Fase JSON`.
7. Carregue o mesmo audio em `Audio local`.
8. Clique em `Iniciar`.

## Proximos passos

- Salvar fases no navegador.
- Adicionar suporte opcional a MIDI simplificado.
- Melhorar feedback visual do mascote e das notas.
