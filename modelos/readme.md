# Modelos

Fonte única dos modelos. As páginas HTML carregam estes arquivos via
`<script src>` — **não** duplique o código dentro do HTML.

| Arquivo | Modelo | Carregado por |
|---|---|---|
| `model.js` | Brasileirão (clubes) — Dixon-Coles/Poisson + Elo, MLE conjunto via Adam | `apps/index.html`, `simulacoes/bench-brasileirao2026.html`, `tests/` |
| `selecoes-model.js` | Seleções — Dixon-Coles/Poisson + Elo, ρ por busca em grade | `mundial-2026.html`, `tests/` |

Ambos expõem `window.BenchModel` / `SelecoesModel` no browser e
`module.exports` no Node, para que os testes rodem o mesmo código que o site.

## Antes de mexer na matemática

`npm run test:backtest` roda um backtest walk-forward sobre o dataset real e
falha se o log-loss piorar. Qualquer mudança no modelo do Brasileirão precisa
passar por ele — foi assim que se descobriu que o fator de forma e o fator de
descanso estavam piorando as previsões.
