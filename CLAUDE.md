# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run tests
npm test                   # Club model tests
npm run test:selecoes      # Selection model tests (110+ assertions)
npm run test:pwa           # PWA compliance tests (manifest, service worker, icons)

# Local development (no build step needed)
python -m http.server 8000
```

## Architecture

Static HTML + vanilla JavaScript PWA — no build process, no framework.

### Directory layout

- `modelos/` — Dixon-Coles Poisson regression models (pure JS, shared between browser and Node.js tests)
  - `model.js` — club championship model
  - `selecoes-model.js` — national teams model
- `apps/` — Interactive prediction UIs that load models and CSV data at runtime
- `simulacoes/` — Self-contained simulation pages with model + full dataset embedded inline (large files, ~400KB–3.7MB)
- `datasets/` — Zipped CSV data files
- `tests/` — Node.js unit tests for model math and PWA compliance

### Prediction model pipeline

Both models follow the same flow:

1. Parse CSV → normalize team names → build Elo ratings with temporal decay
2. Estimate attack (α) and defense (β) strengths per team via MLE (Adam optimizer, 400 iterations)
3. Apply Dixon-Coles ρ correction to adjust for correlated low-scoring outcomes
4. Apply form factor (recency bonus over last N matches) and home advantage
5. Output Poisson-distributed win/draw/loss probabilities → convert to odds with overround

Key differences between models: selections use longer half-lives (2 years vs 730 days) and a higher minimum weight floor (25% vs 15%).

### Data updates

When updating championship data (e.g. adding new rounds), the CSV is embedded or referenced inside the large `simulacoes/bench-brasileirao2026.html` file. The `simulacoes/` files are the main artifacts to update for new match results.

### PWA

`service-worker.js` uses cache-first for same-origin assets and stale-while-revalidate for CDN resources (fonts, JS libs). `manifest.json` defines two app shortcuts (Brasileirão and Copa 2026).
