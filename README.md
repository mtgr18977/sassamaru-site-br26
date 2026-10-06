# Sassamaru 2026

**Sassamaru 2026** é um aplicativo web (PWA instalável) de previsões e simulações de futebol: **clubes (Campeonato Brasileiro)** e **seleções (Copa do Mundo)**. É HTML estático + JavaScript puro, sem servidor e sem build — funciona offline depois da primeira visita.

## Navegação

A barra de abas no topo (`shell/shell.js` + `shell/shell.css`, injetada em todas as páginas) leva às seções do app:

| Aba | Página | O que faz |
|-----|--------|-----------|
| Início | `index.html` | Apresenta o app, estado dos dados e precisão do modelo |
| Rodada | `apps/index.html` | Rodada de hoje e contagem regressiva para a próxima (pelo relógio do dispositivo); previsão 1X2, odds e placares; seletor Série A \| Série B |
| Brasileirão | `simulacoes/bench-brasileirao2026.html` | Monte Carlo do resto da temporada 2026 |
| Seleções | `apps/bench-selecoes.html` | Previsão de partidas entre seleções |
| Copa 2026 | `simulacoes/bench-copa2026.html` | Simulação do torneio completo |
| Docs | `bench-docs.html` | Documentação técnica do modelo |

## Calendário e rodada atual

A aba **Rodada** compara o dia do dispositivo com `datasets/calendario.js` e mostra a rodada em andamento (ou a próxima), as datas, quantos dias faltam e a faixa das 38 rodadas; um botão carrega os jogos da rodada para o simulador. O navegador não consegue ler ge.globo.com nem a Wikipedia (CORS/bloqueio) e o app precisa funcionar offline, então o calendário é um arquivo editado a cada atualização, a partir da tabela detalhada da CBF. Hoje: rodadas 29–32 confirmadas, 33–38 provisórias; jogos completos das rodadas 29 e 30.

## Série B (estrutura pronta, dados pendentes)

`modelos/competicoes.js` registra Série A e Série B (20 clubes, 38 rodadas, pontos corridos desde 2006, G4 de acesso e Z4). O seletor **Série A | Série B** da aba Rodada já existe; enquanto não houver CSV ele mostra o passo a passo. Para ativar:

```bash
python scripts/dados_serie.py converter resultados_b.csv datasets/campeonato-brasileiro-serie-b.csv   # converte e valida
# depois: troque dados: 'pendente' por 'disponivel' em modelos/competicoes.js
```

`python scripts/dados_serie.py validar <csv>` confere jogos por temporada, rodadas 1–38, 20 clubes e jogos por clube. O modelo trata clubes sem histórico como média da liga (com aviso), o que é o ponto fraco numa divisão de alta rotatividade — veja o `ToDo.md`.

## Estado dos dados (6 out 2026)

| Base | Cobertura | Jogos |
|------|-----------|-------|
| Brasileirão (clubes) | 2003 – rodada 28 de 2026 (+ adiados da 21ª) | 9 444 |
| Seleções | 1872 – 2026 | 49 000+ |
| Série B (2006+) | estrutura pronta, sem dados | — |

Faltam no Brasileirão 2026: 101 jogos (279 de 380 disputados), entre eles Chapecoense × Vasco, adiado da 21ª rodada.

Precisão do modelo de clubes (backtest walk-forward, n = 1 039):

| | log-loss | RPS | acurácia |
|---|---|---|---|
| Modelo | 1,031 | 0,212 | 48,1% |
| Taxa-base fixa 47/27/26 | 1,058 | 0,222 | 47,1% |

## Estrutura do repositório

- `scripts/` — `dados_serie.py` (converter/validar CSVs de outras divisões)
- `shell/` — Casca do app: barra de abas no topo e botão de instalação
- `i18n/` — Traduções (en, zh-CN)
- `apps/` — Webapps interativas de predição
  - `apps/index.html` — Simulador do Brasileirão
  - `apps/bench-selecoes.html` — Simulador da Copa do Mundo
- `datasets/` — Dados históricos em CSV (compactados em `.zip`)
- `modelos/` — Modelos estatísticos em JavaScript (Dixon-Coles + Poisson)
- `simulacoes/` — Páginas autocontidas com modelo + dados embutidos (artefatos gerados)
- `tests/` — Testes automatizados dos modelos

## Como executar (local)

Este projeto **não requer build** — são arquivos HTML estáticos. Abra direto no navegador ou use um servidor local para evitar restrições de CORS:

```bash
cd /caminho/para/o/repositorio
python -m http.server 8000
# acesse http://localhost:8000/
```

## Testes

```bash
npm test                 # as quatro suítes (modelo, seleções, PWA, Copa)
npm run test:backtest    # trava de regressão de acurácia do modelo de clubes
npm run test:i18n        # traduções en/zh
npm run test:competicoes # calendário, rodada de hoje, Série B e scripts/dados_serie.py
npm run test:selecoes    # testes do modelo de seleções (110+ asserções)
npm run test:pwa         # validação do PWA (manifest, service worker, ícones)
```

## Idiomas

O site está disponível em **português (padrão), inglês e chinês simplificado**. O seletor `PT | EN | 中文` fica no cabeçalho de cada página; a escolha é guardada no navegador (ou use `?lang=en`). As traduções ficam em `i18n/` (veja a seção *Internationalization* do `CLAUDE.md`) e são validadas por `npm run test:i18n`.

## Modelos

Os modelos em `modelos/` implementam regressão de Poisson com correção de Dixon-Coles:

- **Força de ataque/defesa** por equipe estimada via MLE (Adam optimizer, 400 iterações)
- **Sistema Elo** com reset parcial por temporada (clubes) e decaimento por data (seleções)
- **Vantagem em casa** (γ) estimada junto com ataque e defesa
- **Sem fator de forma nem de descanso**: ambos pioravam o backtest e foram removidos (veja `CLAUDE.md`)

## Webapps disponíveis

| Webapp | Arquivo |
|--------|---------|
| Rodada do Brasileirão | `apps/index.html` |
| Seleções | `apps/bench-selecoes.html` |

## Atualização de dados

Novos resultados do Brasileirão entram em **três lugares**, sempre iguais: `datasets/campeonato-brasileiro-limpo.csv` (lido pelo backtest) e o bloco `window.__EMBEDDED_CSV__` de `apps/index.html` e de `simulacoes/bench-brasileirao2026.html`. Depois rode `npm test` e `npm run test:backtest`, atualize os números da página inicial (`index.html`), do `CLAUDE.md` e do `README.md`, e suba o `CACHE_VERSION` em `service-worker.js`.

## Contribuição

1. Faça um fork desse projeto.
2. Crie uma branch (`feature/minha-melhoria`).
3. Abra um Pull Request descrevendo a mudança.

> [!IMPORTANT]
> Consulte o [ToDo.md](https://github.com/mtgr18977/sassamaru-site-br26/blob/main/ToDo.md) para a lista de melhorias planejadas.

## Licença

MIT
