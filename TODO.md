# TODO - OctoBeat

## Agora

- [ ] Testar o fluxo completo: gravar no `Editor`, exportar JSON, importar no `Jogo`, carregar o mesmo audio e iniciar.
- [ ] Corrigir qualquer problema de sincronizacao entre audio local e notas importadas.
- [ ] Adicionar uma mensagem clara quando o JSON importado estiver invalido ou sem notas.
- [ ] Criar uma tela de resultado ao fim da fase com pontos, combo maximo, acertos e erros.
- [ ] Permitir parar a fase sem precisar reiniciar a pagina.

## Proxima versao jogavel

- [ ] Salvar fases no navegador usando `localStorage` ou `IndexedDB`.
- [ ] Criar uma lista de fases salvas dentro do jogo.
- [ ] Permitir apagar fases salvas.
- [ ] Permitir renomear titulo e artista de uma fase salva.
- [ ] Adicionar importacao e exportacao manual de JSON pela lista de fases.
- [ ] Separar fase demo, fase importada e fases salvas de forma clara na interface.

## Melhorias do editor

- [ ] Adicionar botao de desfazer ultima nota gravada.
- [ ] Adicionar botao para baixar o JSON mesmo sem precisar copiar o texto.
- [ ] Mostrar uma contagem de notas por coluna.
- [ ] Permitir testar a fase gravada diretamente no jogo sem reimportar arquivo.
- [ ] Adicionar ajuste de atraso global da fase, em segundos, para corrigir audio adiantado ou atrasado.
- [ ] Adicionar preview visual simples das notas gravadas enquanto o audio toca.

## Gameplay

- [ ] Ajustar janelas de julgamento: `Perfeito`, `Bom`, `Cedo`, `Atrasado` e `Erro`.
- [ ] Guardar combo maximo.
- [ ] Adicionar multiplicador de pontos por combo.
- [ ] Melhorar feedback visual de acerto e erro por coluna.
- [ ] Adicionar efeitos sonoros opcionais para acerto e erro.
- [ ] Adicionar pausa e continuar.

## Visual e identidade

- [ ] Melhorar o mascote polvo e conectar cada coluna a um tentaculo.
- [ ] Animar o polvo reagindo a combo, erro e fim de fase.
- [ ] Melhorar as notas com cores e formatos mais consistentes.
- [ ] Criar uma tela inicial simples com selecao de fase.
- [ ] Criar layout mais confortavel para telas menores.

## MIDI futuro

- [ ] Pesquisar uma biblioteca JavaScript estavel para ler MIDI no navegador.
- [ ] Criar um conversor inicial de MIDI para ate 8 colunas.
- [ ] Simplificar acordes para uma ou poucas notas jogaveis.
- [ ] Reduzir trechos rapidos para evitar fases impossiveis.
- [ ] Comparar a qualidade das fases MIDI com as fases feitas manualmente no editor.

## Qualidade do projeto

- [ ] Separar `src/App.jsx` em componentes menores.
- [ ] Mover regras de fase e julgamento para arquivos utilitarios.
- [ ] Adicionar testes automatizados para parser de JSON e validacao de notas.
- [ ] Adicionar lint/formatacao do projeto.
- [ ] Documentar melhor o formato de fase.
