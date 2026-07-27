# Sassamaru — ToDo & Próximos Passos

> Estado atual do projeto e melhorias planejadas para os modelos de previsão de futebol.


## Modelo

- [x] **Dixon-Coles completo com iteração MLE — agora em produção**
  Implementado em `modelos/model.js`: gradiente analítico da log-verossimilhança DC (com correção τ e chain rule em log-espaço), penalidades de identificabilidade, 400 iterações Adam. Todos os parâmetros (α ataque, β defesa, γ home advantage, μ base, ρ) estimados conjuntamente com pesos temporais.
  Até então o MLE existia mas estava órfão: as páginas rodavam uma cópia inline sem MLE, com razões empíricas de gols e ρ fixo em −0.10. As três cópias foram unificadas neste arquivo.

- [x] **Backtest walk-forward como trava de regressão**
  `npm run test:backtest` roda o modelo rodada a rodada sobre o dataset real e falha se o log-loss passar do limiar. Inclui RPS e comparação obrigatória contra a taxa-base fixa 47/27/26 — foi essa comparação que revelou que o modelo em produção estava *pior* que o palpite constante (1.069 vs 1.058).

- [x] **Remoção do fator de forma e do fator de descanso**
  Ambos pioravam as previsões no backtest (forma sozinha custava ~0.039 de log-loss). Ver `bench-docs.html` §3.4 e §3.6 para os números. `tests/model.test.js` garante que não voltem sem justificativa.

- [ ] **Modelo de correlação de gols (bivariate Poisson ou Weibull-gamma)**  
  Substitui a independência entre λ_H e λ_A por uma distribuição bivariada que captura correlações negativas (quando um time marca mais, o outro tende a recuar). O modelo de Dixon & Robinson (1998) é uma extensão natural.

- [ ] **Inflação de empates por pressão de resultado**  
  Times que precisam de ponto extra tendem a jogar para o empate. Um fator situacional baseado na diferença de pontos na tabela poderia corrigir a subestimação de empates em rodadas finais.

- [ ] **Calibração isotônica pós-treinamento**  
  Aplicar Platt scaling ou regressão isotônica às probabilidades brutas do modelo. Prioridade baixa: depois da remoção dos multiplicadores ad-hoc a calibração ficou boa (previsto 0.446 vs observado 0.436 na faixa 0.4–0.5). Encolher as probabilidades em direção à taxa-base foi testado e **piora** o log-loss.

- [ ] **Home advantage por estádio/time**
  A primeira tentativa (multiplicador empírico por time, aplicado por cima do γ do MLE) foi removida: contava a vantagem de casa duas vezes e piorava o log-loss. A forma correta é um `log γ_i` por time dentro do vetor de parâmetros, com prior hierárquico (2n+3 → 3n+2), estimado junto com o resto. A coluna `arena` de `datasets/campeonato-brasileiro-full_ate_2025.csv` permitiria fazer isso por estádio.


## Dados

- [ ] **Atualização automática do CSV via API**  
  Integrar com APIs públicas (Sofascore, ESPN, football-data.org) para atualizar o dataset automaticamente após cada rodada, sem necessidade de atualização manual do arquivo.

- [ ] **Inclusão de dados de posse, chutes a gol e xG**  
  Expected Goals (xG) é substancialmente mais preditivo do que gols marcados para estimar a força real de um time. Datasets públicos como o Statsbomb Open Data ou a API do Understat contêm xG histórico.

- [ ] **Séries B, C e estaduais para times recém-promovidos**  
  Times que sobem da Série B chegam ao modelo com histórico apenas em divisões inferiores. Incluir dados da Série B com desconto de força (divisão inferior penaliza ataque/defesa estimados) melhoraria as previsões para times como Remo e Chapecoense.

- [ ] **Datas reais no dataset do Brasileirão**  
  O CSV atual usa apenas o número da rodada, sem data. Com datas reais seria possível usar decay date-based (como no modelo de seleções), que é mais preciso durante a janela de transferências ou após longos períodos sem jogos.


## Interface

- [ ] **Modo "o que mudou" — comparação de rodadas**  
  Permitir ao usuário rodar o modelo em duas rodadas diferentes e ver como as probabilidades mudaram para cada confronto, com setas de variação e destaques automáticos.

- [x] **Exportação de resultados como CSV / JSON**
  Implementado em `apps/index.html`: botão de exportação que gera CSV com todas as previsões da rodada.

- [ ] **Modo mobile otimizado para o bench-rodada**  
  A tabela de resultados com 9 colunas não é legível em tela pequena. Uma visualização alternativa em cards verticais para mobile melhoraria a usabilidade.

- [x] **Bracket visual interativo para a Copa 2026**
  Implementado em `simulacoes/bench-copa2026.html`: layout estilo ESPN com chaveamento visual completo da fase eliminatória.


## Infraestrutura

- [x] **Testes automatizados para o modelo de seleções**
  Implementado em `tests/selecoes-model.test.js`: 111 testes cobrindo helpers matemáticos, pesos temporais, buildModel e predict. Roda via `npm test`, que agora executa as quatro suítes (antes rodava só `model.test.js`, e por isso uma falha em `applyDC` passou despercebida).

- [x] **Web Worker para o Monte Carlo**
  Já implementado em `apps/index.html` (worker criado via blob). 5 000 simulações rodam em ~0.1 s.

- [ ] **Monte Carlo do bench a partir do estado real da temporada**
  `simulacoes/bench-brasileirao2026.html` simula sempre uma temporada virgem de 380 jogos com um calendário sintético, ignorando os jogos de 2026 já disputados. O `apps/index.html` já parte da tabela real — falta portar isso.

- [ ] **Compressão do CSV embutido**  
  O CSV do Brasileirão ocupa ~400 KB e o de seleções ~3.7 MB inline no HTML. Comprimir com pako (gzip via JS) reduziria o tamanho dos arquivos em ~70% e aceleraria o carregamento inicial.


---

*Gerado a partir de [bench-docs.html](bench-docs.html) · Março 2026*


## Dívida técnica conhecida

- **`apps/index.html` está com o CSV embutido desatualizado** em relação a
  `simulacoes/bench-brasileirao2026.html` e a `datasets/` (3 934 vs 3 994 jogos).
  Os três precisam ser atualizados juntos a cada rodada.
- **`simulacoes/bench-copa2026.html` e `apps/bench-selecoes.html` ainda carregam
  cópias inline do modelo de seleções.** Mesma unificação já feita no modelo de
  clubes deveria ser aplicada a eles.
- **`campeonatobrasileirolimpo_xg.csv` tem as colunas de xG 100% vazias**
  (0 de 9 310 linhas) e `fetch_xg.py` nunca produziu dados. O esquema está
  pronto; falta rodar a coleta.
- **A coluna `data` foi descartada** ao gerar o CSV "limpo", mas existe em
  `datasets/campeonato-brasileiro-full_ate_2025.csv`. Recuperá-la permitiria
  decay por data em vez de assumir `roundsPerSeason = 38`.
