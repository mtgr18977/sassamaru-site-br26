# Modelos

Fonte única da lógica. As páginas HTML carregam estes arquivos via `<script src>` — **não** duplique o código dentro do HTML.

| Arquivo | Conteúdo | Carregado por |
|---|---|---|
| `model.js` | Brasileirão (clubes): Dixon-Coles/Poisson + Elo, MLE conjunto via Adam; também `computeSeasonState()` para o Monte Carlo | `apps/index.html`, `simulacoes/bench-brasileirao2026.html`, `tests/` |
| `competicoes.js` | Registro das divisões (`serie-a`, `serie-b`) e `statusCalendario()` (rodada de hoje, próxima, dias restantes) | `apps/index.html`, `index.html`, `tests/` |
| `selecoes-model.js` | Seleções: Dixon-Coles/Poisson + Elo, ρ por busca em grade | `mundial-2026.html` (página antiga), `tests/` |

Os arquivos expõem um objeto global no navegador (`BenchModel`, `Competicoes`, `SelecoesModel`) e `module.exports` no Node, para que os testes rodem o mesmo código que o site.

> **Exceção conhecida:** `apps/bench-selecoes.html` e `simulacoes/bench-copa2026.html` ainda carregam uma **cópia inline** do modelo de seleções, em vez de `selecoes-model.js`. Mudanças na matemática das seleções precisam ser replicadas nelas até a unificação (veja `ToDo.md`).

## Antes de mexer na matemática

`npm run test:backtest` (Série A) e `npm run test:backtest:b` (Série B) rodam um backtest walk-forward sobre os dados reais e falham se o modelo piorar ou deixar de superar a taxa-base fixa. Qualquer mudança no modelo de clubes passa por eles — foi assim que se descobriu que os fatores de forma e de descanso pioravam as previsões.
