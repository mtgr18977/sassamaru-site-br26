# Scripts

Ferramentas em Python 3 (rodar da raiz do repositório). Não fazem parte do site.

| Script | Para quê | Uso |
|---|---|---|
| `importar_wikipedia_serie_b.py` | Gera `datasets/campeonato-brasileiro-serie-b.csv` a partir das matrizes de resultados da Wikipedia. **Rodadas sintéticas** (a fonte não tem datas). Precisa de internet | `python scripts/importar_wikipedia_serie_b.py [--saida CSV] [--cache DIR]` |
| `dados_serie.py` | `converter`: traz o CSV de outra divisão para o formato do modelo. `validar`: confere jogos por temporada, rodadas 1–38 e jogos por clube (sai com código 1 se achar problema) | `python scripts/dados_serie.py validar <csv>` |

`tests/competicoes.test.js` exercita o `dados_serie.py`.
