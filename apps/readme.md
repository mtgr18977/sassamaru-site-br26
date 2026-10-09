# Apps

Webapps de previsão. Todos aparecem como abas na barra superior do **Sassamaru 2026** (`shell/shell.js`).

| Arquivo | Aba | O que faz |
|---------|-----|-----------|
| `index.html` | **Série A** e **Série B** (sub-aba *Previsão da rodada*) | Rodada de hoje, previsão 1X2, odds e placares; exporta CSV. A divisão é escolhida por `?comp=serie-a` ou `?comp=serie-b` |
| `tabela.html` | **Série A** e **Série B** (sub-aba *Classificação*) | Tabela de classificação calculada dos CSVs de `datasets/` (`computeSeasonState`), com faixas de Libertadores/Sul-Americana/rebaixamento (A) ou acesso/rebaixamento (B). Escolhida por `?comp=` |
| `bench-selecoes.html` | **Seleções** | Previsão de partidas entre seleções |

`index.html` embute o CSV do Brasileirão em `window.__EMBEDDED_CSV__` (e carrega o da Série B por `fetch`). Ele precisa ficar igual ao CSV de `datasets/` — veja *Atualização de dados* no [README](../README.md).
