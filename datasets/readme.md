# Datasets

Dados usados pelos modelos. Nenhum arquivo daqui é gerado em tempo de execução: tudo é versionado.

| Arquivo | Conteúdo | Atualizado |
|---------|----------|------------|
| `campeonato-brasileiro-limpo.csv` | Brasileirão 2003–2026 (9 444 jogos): `ID, rodata, mandante, visitante, vencedor, mandante_Placar, visitante_Placar`. Sem datas. Lido pelo backtest | 6 out 2026 (rodada 28 + adiados da 21ª) |
| `campeonato-brasileiro-serie-b.csv` | Série B 2007–2025 (19 × 380 jogos) + 2026 em andamento (311 jogos); mesmo formato + coluna `rodada_origem` (**rodadas sintéticas**). Gerado por `scripts/importar_wikipedia_serie_b.py` | 6 out 2026 |
| `campeonato-brasileiro-full_ate_2025.csv` | Variante rica do Brasileirão até 2025 (datas reais, arena, técnico, estado). **Sem uso hoje** — é a fonte para recuperar datas e `log γ` por estádio | 2025 |
| `results.csv` | Jogos internacionais de seleções desde 1872 (49 000+ linhas) | 2026 |
| `calendario.js` | Calendário 2026 da Série A e da Série B: janelas das rodadas (`concluida` / `confirmada` / `provisoria` / `semdata`), jogos pendentes e confrontos das rodadas detalhadas. Editado à mão | 6 out 2026 |
| `selecoes.zip` | Fonte original das seleções: `results.csv`, `goalscorers.csv`, `shootouts.csv`, `former_names.csv` (só `results.csv` é usado) | fev 2026 |

## Ao acrescentar resultados

`campeonato-brasileiro-limpo.csv` tem de ficar **idêntico** aos blocos `window.__EMBEDDED_CSV__` de `apps/index.html` e de `simulacoes/bench-brasileirao2026.html`. O passo a passo completo (calendário, testes, cache) está na seção *Atualização de dados* do [README](../README.md).

## Armadilhas conhecidas

- O CSV `limpo` traz um bloco de 2025 duplicado; `removeDuplicateBlock()` o descarta em tempo de execução.
- Mantenha o nome do clube **idêntico** entre divisões (mapa `CANONICO` do importador); do contrário o modelo não reconhece um clube promovido.
- `tests/competicoes.test.js` falha se um jogo listado em `pendentes` já estiver no CSV.
