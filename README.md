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
- Dificuldades leve, normal e rapida.
- Editor manual com upload de audio, gravacao de teclas no tempo da musica e exportacao JSON.

## Formato de fase

```json
[
  { "time": 1.2, "key": 0 },
  { "time": 1.6, "key": 1 },
  { "time": 2.0, "key": 3 }
]
```

`time` e o momento em segundos. `key` e a coluna, de `0` a `7`.

## Proximos passos

- Permitir importar JSON no jogo.
- Salvar fases no navegador.
- Adicionar suporte opcional a MIDI simplificado.
- Melhorar feedback visual do mascote e das notas.
