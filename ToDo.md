# Sassamaru — ToDo & Próximos Passos

> Estado atual do projeto e melhorias planejadas para os modelos de previsão de futebol.


## Modelo

- [x] **Dixon-Coles completo com iteração MLE**
  Implementado em `modelos/model.js`: gradiente analítico da log-verossimilhança DC (com correção τ e chain rule em log-espaço), penalidades de identificabilidade, 400 iterações Adam. Todos os parâmetros (α ataque, β defesa, γ home advantage, μ base, ρ) estimados conjuntamente com pesos temporais.

- [ ] **Modelo de correlação de gols (bivariate Poisson ou Weibull-gamma)**  
  Substitui a independência entre λ_H e λ_A por uma distribuição bivariada que captura correlações negativas (quando um time marca mais, o outro tende a recuar). O modelo de Dixon & Robinson (1998) é uma extensão natural.

- [ ] **Inflação de empates por pressão de resultado**  
  Times que precisam de ponto extra tendem a jogar para o empate. Um fator situacional baseado na diferença de pontos na tabela poderia corrigir a subestimação de empates em rodadas finais.

- [ ] **Calibração isotônica pós-treinamento**  
  Aplicar Platt scaling ou regressão isotônica às probabilidades brutas do modelo para corrigir vieses sistemáticos de calibração (ex.: o modelo pode ser consistentemente over-confident em placares 1-0).

- [ ] **Home advantage por estádio/time**  
  Atualmente o modelo usa a média da liga para vantagem de casa. Times com forte vantagem de casa (ex.: Grêmio na Arena Porto Alegre) poderiam ter um fator individual estimado. Já existe uma implementação parcial no bench-selecoes que poderia ser portada.


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
  A tabela de resultados com 11 colunas não é legível em tela pequena. Uma visualização alternativa em cards verticais para mobile melhoraria a usabilidade.

- [x] **Bracket visual interativo para a Copa 2026**
  Implementado em `simulacoes/bench-copa2026.html`: layout estilo ESPN com chaveamento visual completo da fase eliminatória.


## Infraestrutura

- [x] **Testes automatizados para o modelo de seleções**
  Implementado em `tests/selecoes-model.test.js`: 110 testes cobrindo helpers matemáticos, pesos temporais, buildModel e predict. Roda via `npm test`.

- [ ] **Web Worker para o Monte Carlo**  
  Mover o loop de simulação para um Web Worker eliminaria completamente o risco de travar a UI, mesmo com 50 000 simulações, e permitiria cancelar uma simulação em andamento.

- [ ] **Compressão do CSV embutido**  
  O CSV do Brasileirão ocupa ~400 KB e o de seleções ~3.7 MB inline no HTML. Comprimir com pako (gzip via JS) reduziria o tamanho dos arquivos em ~70% e aceleraria o carregamento inicial.


---

*Gerado a partir de [bench-docs.html](bench-docs.html) · Março 2026*
