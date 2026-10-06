# Testes

Rodam em Node, sem framework: `npm test` (seis suítes) e `npm run test:backtest[:b]`.

| Arquivo | Script npm | Asserções | Cobre |
|---|---|---|---|
| `model.test.js` | `test:model` | 51 | Matemática de `modelos/model.js` com dados sintéticos; garante que forma e descanso não voltem |
| `selecoes-model.test.js` | `test:selecoes` | 111 | `modelos/selecoes-model.js` |
| `pwa.test.js` | `test:pwa` | 73 | Manifest, service worker, ícones e `<head>` de cada página |
| `copa2026-bracket.test.js` | `test:copa` | 8 | Chaveamento da Copa (lógica copiada de `bench-copa2026.html`) |
| `i18n.test.js` | `test:i18n` | 59 | Dicionários en/zh, placeholders, chaves `_t()`, blocos de docs, choque com nomes de clubes |
| `competicoes.test.js` | `test:competicoes` | 55 | Calendário, rodada de hoje, integridade com o CSV, Série B, `scripts/dados_serie.py` |
| `backtest.test.js` | `test:backtest` / `test:backtest:b` | — | Walk-forward sobre dados reais; falha se o modelo não superar a taxa-base em log-loss **e** RPS |

O backtest não entra no `npm test` por ser mais lento (2–5 s). Rode-o após qualquer mudança na matemática do modelo de clubes. Contagens de asserções mudam: confira a saída de cada suíte.
