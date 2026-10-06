# Datasets

Datasets used in the model.

| Arquivo | Conteúdo | Atualizado |
|---------|----------|------------|
| `campeonato-brasileiro-limpo.csv` | Brasileirão 2003–2026 (rodada, mandante, visitante, placar); lido pelo backtest | 6 out 2026 (rodada 28 + adiados da 21ª) |
| `campeonato-brasileiro-full_ate_2025.csv` | Variante rica até 2025 (datas, arena, técnico) — ainda sem uso | 2025 |
| `results.csv` | Jogos internacionais de seleções desde 1872 | 2026 |

| `calendario.js` | Calendário 2026: janelas das 38 rodadas (status concluída/confirmada/provisória), jogos pendentes e confrontos das rodadas 29–30 | 6 out 2026 |
| `campeonato-brasileiro-serie-b.csv` | Série B 2007–2025 (19×380 jogos), mesmo formato da Série A + coluna `rodada_origem` (**rodadas sintéticas**); gerado por `scripts/importar_wikipedia_serie_b.py` | 6 out 2026 |

Ao acrescentar resultados em `campeonato-brasileiro-limpo.csv`, replique-os nos blocos `__EMBEDDED_CSV__` de `apps/index.html` e `simulacoes/bench-brasileirao2026.html`.
