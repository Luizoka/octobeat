# OctoBeat — Orientação para o Claude

## Contexto do projeto

OctoBeat é um jogo de ritmo casual para navegador (Vite + React), com 8 colunas (`A S D F J K L Ç`), inspirado em Piano Tiles e Guitar Hero. O foco é acompanhar o ritmo, não simular um piano real.

O jogo já funciona. O problema atual é **o gerador automático de charts a partir de MIDI/MusicXML**: ele não produz fases boas de forma consistente para músicas variadas. Esse é o foco do trabalho.

Responda e escreva comentários em português.

## Arquivos principais

- `src/music/midi/importMidi.js` — importa MIDI (extrai `tempoChanges` e `timeSignatures` com o instante correto em segundos).
- `src/music/musicxml/importMusicXml.js` — importa MusicXML (usa `DOMParser`, só funciona no navegador).
- `src/music/models/OctoBeatSong.js` — modelo da música.
- `src/music-analysis/` — análise e pontuação de tracks (`analyzeTrack`, `scoreTrack`, `selectGameplayTracks`, `config.js`).
- `src/music-analysis/config.js` — também guarda `CHART_DIFFICULTY` (densidade por dificuldade em beats).
- `src/chart/beatGrid.js` — segundos ↔ beats, compassos, quantização, `beatStrength`.
- `src/chart/generateChart.js` — gera o chart.
- `src/chart/mapPitchToLane.js` — mapeia pitch para coluna.
- `src/chart/simplifyChart.js` — simplifica por dificuldade (prioridade por força rítmica + espaçamento em beats).
- `src/chart/chartQuality.js` — métricas de qualidade de chart.
- `src/game/adaptNotesForHands.js` — adapta para uma mão.
- `src/App.jsx` — controlador: motor do jogo (tick, input, holds, áudio MIDI/sintetizador, pausa) e navegação entre telas.
- `src/ui/` — telas: `HomeScreen` → `SetupScreen` → `GameScreen` → `ResultsScreen`, `SettingsPanel` (modal) e `RotateOverlay` (celular em pé). `device.js`: media queries, tela cheia e bloqueio de orientação.
- `src/game/laneInput.js` — entrada unificada: teclado e toque (pointer events) registram quem segura cada lane; a lane só é solta quando a última fonte sai. `App.jsx` liga os pointer events na `.track`.
- `src/game/scoring.js` — pontos, combo, multiplicador/Fever (×2 em 25, ×3 em 50, ×4 em 100), nota final S–D.
- `src/settings/settings.js` — preferências (um objeto em `localStorage["octobeat.settings"]`, migra chaves antigas).
- `src/effects/` — partículas (canvas), sons de acerto, `useGameEffects` (tremor, flash, textos, faixas de combo).

## Ferramentas

- `npm test` — testes (node --test). Rodar sempre após mudanças.
- Música de exemplo do site: `Deltarune Chapter 5 - Flower Man.mid` (raiz). A antiga (vs Susie) foi para `test-songs/`.
- `npm run eval:charts` — roda o pipeline sobre `test-songs/` + o MIDI de exemplo da raiz e compara com `test-songs/baseline.json` (▲ melhor / ▼ pior).
- `npm run eval:charts -- --save` — regrava o baseline. O baseline atual é o estado **anterior ao Passo 1**; só regravar quando o usuário pedir.
- `npm run eval:songs` — regenera os MIDIs sintéticos (determinístico).
- O corpus tem só 1 música real; as sintéticas reproduzem problemas específicos. Mais MIDIs reais em `test-songs/` deixam a avaliação mais confiável.

## Decisões já tomadas

- **Não deslocar o tempo das notas para a grade.** O áudio toca o MIDI original e a janela de "Perfeito" é ±55 ms; a grade só decide prioridade/espaçamento.
- Espaçamento mínimo é medido na posição quantizada em 1/12 de beat (tolera humanização), com um piso em segundos por dificuldade.
- **Holds** (`{ time, key, duration }`): cabeça julgada como nota comum; segurar até o fim completa sozinho; soltar antes dos últimos 0,15 s = "Soltou" (quebra combo, mantém pontos da cabeça). Holds existem também no Fácil (≥ 2 beats, sem outras notas na mesma mão). No máximo 1 hold por mão, até 25% das notas. Lógica em `src/game/holdNotes.js`; geração em `src/chart/applyHolds.js`; `normalizeNotes` encurta holds que atravessam outra nota da mesma lane.

## Desempenho (não reintroduzir)

Medido com Chrome + GPU via Playwright (scripts em scratchpad, não versionados). Regras:
- **Áudio:** o smplr entrega notas ao Web Audio por timer na thread principal. `MidiPlayer` usa um `Scheduler` compartilhado com 1 s de antecedência e entrega notas numa janela de 3 s (não agendar a música inteira de uma vez).
- **React:** só desenhar notas visíveis (`gone` / `y > -80`); notas se movem por `transform`, nunca `top`.
- **CSS na pista:** não animar `filter`, `box-shadow` ou `scale` em elementos com sombra desfocada; não usar `var()` dentro de `@keyframes`; preferir `opacity`/`transform` com `will-change`. Sem `backdrop-filter` sobre a pista.
- **1ª vez de cada efeito** custa 100–450 ms de GPU (preparar o efeito). `EffectsWarmup` em `GameScreen.jsx` desenha cópias invisíveis durante a contagem — todo efeito visual novo deve entrar lá.
- **Nada de variável CSS mudando a cada quadro em contêiner** (ex.: `--progress` no `.game-stage`): invalida o estilo de toda a pista. A barra de progresso recebe `transform` direto (`.js-progress`). Medido: recálculo de estilo caiu ~3×.
- `GameScreen` renderiza a cada quadro; HUD, painéis, HUD flutuante e colunas são `memo` (colunas recebem as lanes como texto). Não passar objetos/Sets novos por quadro para eles.
- Partículas são o efeito mais caro no celular: lá o canvas usa dpr 1 e `TOUCH_PARTICLE_FACTOR` reduz a quantidade.
- `MidiPlayer`: pausar/reiniciar usam `halt()` (limpa a fila do Scheduler + `stop()` das vozes); não descartar o player, senão o SoundFont é baixado de novo. `currentTime()` não pode travar em `song.duration` (a partida nunca terminava).
- `npm run dev` (React em modo desenvolvimento) é bem mais lento; para jogar de verdade: `npm run play`.

## Diagnóstico (por que os charts ficam ruins)

1. ~~**Simplificação em segundos, não em tempo musical.**~~ Resolvido no Passo 1.
2. **Mapeamento de lane linear global.** `mapPitchToLane` usa min–max de pitch da música inteira; uma nota extrema comprime a melodia em 2–3 colunas e gera repetições monótonas. Padrões repetidos (arpejos) caem sempre na mesma lane.
3. ~~**Modo Essência escolhe uma única track.**~~ Resolvido: `selectMelodySegments` escolhe a melodia por blocos de 4 compassos (Viterbi com custo de troca). O `scoreTrack` ainda pode preferir um arpejo denso à melodia (ex.: balada sintética).
4. **Modo Piano mistura todas as tracks de piano** (mão esquerda + direita + acordes) num único filtro.
5. ~~**Duração das notas é ignorada.**~~ Resolvido no Passo 5 (holds).
6. ~~**Não há métrica de qualidade de chart.**~~ Resolvido no Passo 0.

## Plano de melhoria (fazer em ordem, um passo por vez)

### Passo 0 — Métricas e corpus de teste ✅

### Passo 1 — Grade de beats ✅
- `beatGrid.js` com tempo map, compassos (`timeSignatures`, compasso composto), quantização e `beatStrength`.
- `simplifyChart` processa onsets do mais forte para o mais fraco e aceita se respeitar o espaçamento mínimo em beats (easy 1, normal 1/2, hard 1/4).

### Passo 2 — Seleção por importância
Estender a prioridade atual (só `beatStrength` + volume) para:

```js
importance =
  beatStrength(pos)        // tempo 1 > tempo forte > contratempo > subdivisões
  + velocity * w1
  + log(duration) * w2
  + onsetAfterRest * w3    // nota após pausa
  + pitchChange * w4       // mudança de contorno
```

Por janela (ex.: 1 compasso), escolher as notas de maior importância até atingir a densidade‑alvo da dificuldade (NPS máximo configurável em `config.js`). Pesos devem ficar em `config.js`.

### Passo 3 — Mapeamento de lane por contorno
- Usar janela local (2–4 compassos) em vez do range global.
- Nota sobe → move para a direita; desce → esquerda; tamanho do salto define quantas lanes.
- Regras de jogabilidade: limitar jacks rápidos, equilibrar uso das 8 colunas, acordes em mãos diferentes (lanes 0–3 vs 4–7).
- Manter o resultado determinístico (mesma entrada → mesmo chart).

### Passo 4 — Melodia por segmento (parcial ✅)
- Feito: blocos de 4 compassos + custo de troca (`src/music-analysis/selectMelodySegments.js`, pesos em `MELODY_SEGMENTS`). Corrigiu ~48 s mudos na Flower Man.
- Falta: skyline e separar mão direita/esquerda no modo Piano.
- Dividir a música em segmentos de 2–4 compassos e reaproveitar `scoreTrack` por segmento.
- Alternativa/complemento: algoritmo *skyline* (nota mais aguda por instante) sobre as tracks melódicas candidatas.
- Aplicar custo de troca de track para evitar pulos a cada compasso.
- No modo Piano, separar mão direita (melodia/skyline) de mão esquerda (acompanhamento) antes de simplificar.

### Passo 5 — Notas longas (holds) ✅
- Feito antes dos Passos 2–4 a pedido do usuário. Ideias futuras de notas especiais: "rajada" (trinados/tremolos) e "nota de destaque" (pontos em dobro).

### Passo 6 (opcional) — Visualizador de debug
- Tela/rota que desenha o chart sobre a grade de compassos, colorindo cada nota pela track de origem e mostrando a pontuação de importância.

## Regras de trabalho

- Fazer um passo por vez. Ao final de cada passo: rodar `npm test`, rodar `npm run eval:charts` e mostrar a comparação com o baseline.
- Escrever testes para cada função nova (quantização, beatStrength, seleção, mapeamento de lane).
- Não quebrar o formato de fase atual (`{ time, key }`); campos novos devem ser opcionais.
- Manter funções puras em `src/chart/` e `src/music-analysis/`, sem dependência de React.
- Não adicionar dependências sem perguntar.
- Antes de mudanças grandes, explicar o plano e esperar confirmação.
- Se algo não ficar claramente melhor nas métricas ou ao jogar, dizer isso honestamente em vez de forçar a mudança.
