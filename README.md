# OctoBeat

Jogo de ritmo casual para navegador inspirado em Piano Tiles e Guitar Hero. O foco e acompanhar o ritmo, nao simular um piano real.

## Como rodar

Instale as dependencias:

```bash
npm install
```

Rode o servidor de desenvolvimento:

```bash
npm run dev
```

Depois acesse a URL mostrada pelo Vite, normalmente `http://localhost:5173`.

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
