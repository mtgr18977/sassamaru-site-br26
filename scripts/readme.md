# Scripts

Ferramentas em Python 3 (rodar da raiz do repositório). Não fazem parte do site.

| Script | Para quê | Uso |
|---|---|---|
| `importar_wikipedia_serie_b.py` | Gera `datasets/campeonato-brasileiro-serie-b.csv` a partir das matrizes de resultados da Wikipedia. Rodadas sintéticas até 2025 (a fonte não tem datas) e reais em 2026 (tabela da CBF). Só aceita jogos de 2026 presentes nas duas Wikipedias. Precisa de internet | `python scripts/importar_wikipedia_serie_b.py [--saida CSV] [--cache DIR]` |
| `importar_tabela_cbf.py` | Converte a Tabela Básica da CBF (PDF) em `datasets/serie-b-2026-tabela-cbf.csv` (rodada real de cada jogo). Precisa do `pdftotext` (poppler) | `python scripts/importar_tabela_cbf.py tabela.pdf datasets/serie-b-2026-tabela-cbf.csv` |
| `baixar_escudos.py` | Baixa o escudo de cada clube da Série A e da Série B (infobox da Wikipedia em português) para `icons/clubes/<chave>.png` e grava `icons/clubes/fontes.csv` com a origem de cada arquivo. Pausa entre requisições (a Wikipedia limita; repete com espera no 429). Precisa de internet | `python scripts/baixar_escudos.py [--so chave ...] [--forcar]` |
| `dados_serie.py` | `converter`: traz o CSV de outra divisão para o formato do modelo. `validar`: confere jogos por temporada, rodadas 1–38 e jogos por clube (sai com código 1 se achar problema) | `python scripts/dados_serie.py validar <csv>` |

`tests/competicoes.test.js` exercita o `dados_serie.py`.
