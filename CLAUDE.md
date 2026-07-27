# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run tests
npm test                   # All four suites (model, selecoes, pwa, copa)
npm run test:model         # Club model unit tests
npm run test:backtest      # Walk-forward accuracy regression gate — run this
                           # after ANY change to the Brasileirão model math
npm run test:selecoes      # Selection model tests (111 assertions)
npm run test:pwa           # PWA compliance tests (manifest, service worker, icons)
npm run test:copa          # Copa 2026 bracket tests

# Local development (no build step needed)
python -m http.server 8000
```

## Architecture

Static HTML + vanilla JavaScript PWA — no build process, no framework.

### Directory layout

- `modelos/` — **single source of truth** for the models (pure JS, shared by browser and Node tests)
  - `model.js` — Brasileirão club model
  - `selecoes-model.js` — national teams model
- `apps/` — Interactive prediction UIs. `apps/index.html` loads `../modelos/model.js` via `<script src>`
- `simulacoes/` — Simulation pages with the dataset embedded inline. `bench-brasileirao2026.html`
  also loads `../modelos/model.js`; `bench-copa2026.html` still carries its own inline copy of the
  selections model
- `datasets/` — CSV data files
- `tests/` — Node tests: model math, walk-forward backtest, PWA compliance, Copa bracket

Do NOT paste the model back inline into a page. The Brasileirão model used to exist as three
diverging hand-copied versions with different constants and no test covering any of them.

### Prediction model pipeline (`modelos/model.js`)

1. Parse CSV → normalize team names → detect seasons from round-1 clusters
   (the club dataset has no dates; time is measured in **rounds**)
2. Exponential temporal weight per match, with a minimum-weight floor
3. Joint MLE (Adam + analytic gradients, 400 iterations) estimating attack α, defense β,
   home advantage γ, base rate μ and the Dixon-Coles ρ — all at once
4. Elo with per-season partial reset → small rotation of the λH/λA ratio
5. Poisson score grid + Dixon-Coles τ correction → 1X2 probabilities → odds with overround

**No form factor and no rest factor.** Both existed and both were measured to make predictions
worse (form alone cost ~0.039 log-loss). `tests/model.test.js` asserts they stay gone. If you
want to reintroduce either, `npm run test:backtest` has to justify it.

The τ applied at prediction time is the same λ-dependent τ that the likelihood maximizes —
`τ(0,0) = 1 − λH·λA·ρ`, not `1 − ρ`. These drifted apart once; keep them in sync.

Key differences vs the selections model: selections use date-based decay, a longer Poisson
half-life, tournament-importance weighting, neutral-venue handling, and estimate ρ by grid
search rather than jointly.

### Data updates

New match results go into the `window.__EMBEDDED_CSV__` block of **both**
`simulacoes/bench-brasileirao2026.html` and `apps/index.html`, plus
`datasets/campeonato-brasileiro-limpo.csv` (the file the Node backtest reads).
These drift apart easily — `apps/index.html` has been left several rounds behind before.

The CSV carries a duplicated 2025 block that `removeDuplicateBlock()` strips at runtime;
`datasets/campeonato-brasileiro-full_ate_2025.csv` is a richer, unused variant that still has
real dates, plus arena, coach and state columns.

### PWA

`service-worker.js` uses cache-first for same-origin assets and stale-while-revalidate for CDN resources (fonts, JS libs). `manifest.json` defines two app shortcuts (Brasileirão and Copa 2026).

## Model accuracy

`npm run test:backtest` is the regression gate. Current numbers (walk-forward, refit every 4
rounds, last 3 seasons, n=955):

| | log-loss | RPS | accuracy |
|---|---|---|---|
| Model | 1.030 | 0.212 | 48.2% |
| Constant 47/27/26 baseline | 1.059 | 0.222 | 47.0% |

The constant baseline matters: before this gate existed, the shipped model scored 1.069 —
**worse than predicting the same three numbers for every match**. Any model change that does
not beat the baseline on both log-loss and RPS is a regression, and the test fails on it.
