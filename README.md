# Sassamaru 2026

**Sassamaru 2026** é um aplicativo web (PWA instalável) de previsões e simulações de futebol: **clubes (Campeonato Brasileiro)** e **seleções (Copa do Mundo)**. É HTML estático + JavaScript puro, sem servidor e sem build — funciona offline depois da primeira visita.

## Navegação

A barra de abas no topo (`shell/shell.js` + `shell/shell.css`, injetada em todas as páginas) leva às seções do app:

| Aba | Página | O que faz |
|-----|--------|-----------|
| Início | `index.html` | Apresenta o app, estado dos dados e precisão do modelo |
| Série A | `apps/index.html?comp=serie-a` | Rodada de hoje e contagem regressiva; previsão 1X2, odds e placares. Sub-aba **Simulação da temporada** (`simulacoes/bench-brasileirao2026.html`): Monte Carlo do resto de 2026 |
| Série B | `apps/index.html?comp=serie-b` | Mesma previsão de rodada para a Série B (2007–2026) |
| Clubes | `apps/clubes.html` | Escudo de cada clube da Série A e da Série B; o modal mostra as chances na temporada (título, G4, G8, Sul-Americana e cair na A; G2, G6 e cair na B) |
| Seleções | `apps/bench-selecoes.html` | Previsão de partidas entre seleções |
| Copa 2026 | `simulacoes/bench-copa2026.html` | Simulação do torneio completo |
| Docs | `bench-docs.html` | Documentação técnica do modelo |

## Calendário e rodada atual

As abas **Série A** e **Série B** comparam o dia do dispositivo com `datasets/calendario.js`, mostram a rodada em andamento (ou a próxima), as datas, quantos dias faltam e a faixa das 38 rodadas, e **já deixam o campo de jogos preenchido com a rodada em foco**; um botão simula a rodada. O navegador não consegue ler ge.globo.com nem a Wikipedia (CORS/bloqueio) e o app precisa funcionar offline, então o calendário é um arquivo editado a cada atualização, a partir da tabela detalhada da CBF. Série A: rodadas 1–35 concluídas; 36–38 confirmadas pela CBF (21 nov – 2 dez), com os 27 jogos que faltam detalhados (dia e hora). Série B: as 38 rodadas concluídas (a temporada regular terminou em 14 nov); enquanto o playoff de acesso não acaba, a aba carrega os jogos dele no campo de previsão, e depois mostra "Temporada encerrada". Sem os jogos da rodada no calendário, o campo fica vazio com um aviso para colar.

## Série B

`modelos/competicoes.js` registra Série A e Série B (20 clubes, 38 rodadas, 1º–2º sobem direto, 3º–6º disputam playoff de acesso (3º×6º e 4º×5º, ida e volta; os 2 vencedores sobem, 4 promovidos no total) e Z4). A aba **Série B** usa o mesmo modelo, com `datasets/campeonato-brasileiro-serie-b.csv`: **20 temporadas (2007–2026 completas), 7 600 jogos**, gerado por `scripts/importar_wikipedia_serie_b.py` a partir da matriz de resultados de cada página "AAAA Campeonato Brasileiro Série B" da Wikipedia (2014 e 2015 vêm da página em português).

Limitações, de propósito explícitas:
- **Rodadas: sintéticas até 2025, reais em 2026.** A matriz da Wikipedia não traz data nem rodada; em 2007–2025 a ordem dos jogos dentro da temporada é inventada (método do círculo, perna de ida sorteada por temporada), com resultados e mandos reais. Em 2026 a rodada de cada jogo vem da **tabela básica da CBF** (`datasets/serie-b-2026-tabela-cbf.csv`, gerada por `scripts/importar_tabela_cbf.py` a partir do PDF oficial). A coluna `rodada_origem` diz qual é qual (`sintetica` / `cbf`).
- **2006 fica de fora**: não tem matriz completa em nenhuma das duas Wikipedias.
- **2026 está completa** (380 jogos, 38 rodadas, até 14 nov; o playoff de acesso fica fora do modelo de pontos corridos). O importador só aceita jogos que as páginas em português e em inglês trazem **com o mesmo placar** (a pt já chegou a ter um 1×1 "Fortaleza × CRB" inexistente) e confere o mando e a rodada de cada jogo na tabela da CBF — se um jogo não está lá, para com erro. Conferência extra de 13 out: os pontos, jogos e gols de todos os 20 clubes na tabela de classificação da página batem com o que sai da matriz.
- **Ganho pequeno.** `npm run test:backtest:b` (n = 1 140: 2024, 2025 e 2026): log-loss 1,045 × 1,054 da taxa-base 49/27/24 (RPS 0,215 × 0,218). A Série B é mais parelha e troca de elenco todo ano; clubes sem histórico entram como média da liga.
- O treino usa todo o histórico (a janela muda pouco o resultado).

**Playoff de acesso (3º × 6º e 4º × 5º, ida e volta).** Fica **fora** do CSV e do modelo de pontos corridos: é um mata-mata, então vive em `datasets/calendario.js`, no campo `playoff` de `serie-b-2026` (confrontos, datas, estádios e placares). A aba **Série B → Classificação** mostra o chaveamento com o agregado e quem sobe; a **Previsão da rodada** carrega os jogos da fase seguinte (ida ou volta) no campo de jogos. Para atualizar depois de cada jogo, troque `placar: null` por `[gols do mandante, gols do visitante]` (mandante = o clube que manda aquele jogo), rode `npm run test:competicoes` e suba o `CACHE_VERSION`. A regra (`resumoPlayoff` em `modelos/competicoes.js`): o melhor colocado da fase regular joga a volta em casa e, se empatar no agregado, é ele quem sobe — não há gols fora, prorrogação nem pênaltis.

Para regerar: `python scripts/importar_wikipedia_serie_b.py` (precisa de internet; aceita `--cache DIR`; `--fonte pt|en` força uma das páginas em 2026, o padrão é a interseção das duas). Para atualizar as rodadas reais de 2026, baixe a tabela básica em PDF no site da CBF e rode `python scripts/importar_tabela_cbf.py tabela.pdf datasets/serie-b-2026-tabela-cbf.csv` (precisa do `pdftotext`). `python scripts/dados_serie.py validar <csv>` confere qualquer CSV no formato do modelo.

## Estado dos dados (22 nov 2026)

| Base | Cobertura | Jogos |
|------|-----------|-------|
| Brasileirão (clubes) | 2003 – rodada 35 de 2026 + 3 jogos da 36ª (+ adiados da 21ª) | 9 518 |
| Seleções | 1872 – 2026 | 49 000+ |
| Série B | 2007 – 2026 completa, 38 rodadas (2026 com rodadas reais da CBF) | 7 600 |

Faltam no Brasileirão 2026: 27 jogos (353 de 380 disputados), o resto da rodada 36 e as rodadas 37 e 38 (até 2 dez). O adiado da 21ª, Chapecoense 0×2 Vasco, já foi jogado.

Precisão do modelo de clubes (backtest walk-forward; Série A n = 1 113, Série B n = 1 140):

| | log-loss | RPS | acurácia |
|---|---|---|---|
| Série A — modelo | 1,026 | 0,211 | 48,7% |
| Série A — taxa-base fixa 47/27/26 | 1,056 | 0,221 | 47,5% |
| Série B — modelo | 1,045 | 0,215 | 47,0% |
| Série B — taxa-base 49/27/24 | 1,054 | 0,218 | 47,8% |

## Estrutura do repositório

| Pasta / arquivo | Conteúdo |
|---|---|
| `index.html` | Página inicial (números escritos à mão — atualize junto com os dados) |
| `bench-docs.html` | Documentação técnica do modelo (aba **Docs**) |
| `shell/` | Casca do app: barra de abas, tema claro/escuro e botão de instalação |
| `modelos/` | **Fonte única** dos modelos (JS puro, usado pelo navegador e pelo Node) — [detalhes](modelos/readme.md) |
| `apps/` | Webapps de previsão: Série A/B (`index.html`), Clubes (`clubes.html`) e Seleções (`bench-selecoes.html`) — [detalhes](apps/readme.md) |
| `simulacoes/` | Simulação da temporada (Brasileirão) e da Copa 2026, com dados embutidos — [detalhes](simulacoes/readme.md) |
| `datasets/` | CSVs, calendário e `.zip` com as fontes originais (fev 2026) — [detalhes](datasets/readme.md) |
| `scripts/` | Python: importador da Série B e validador de CSVs — [detalhes](scripts/readme.md) |
| `tests/` | Testes em Node (modelo, backtest, PWA, i18n, calendário, Copa) — [detalhes](tests/readme.md) |
| `i18n/` | Dicionários en / zh-CN |
| `service-worker.js`, `manifest.json`, `_headers`, `icons/` | PWA (offline, instalação, cabeçalhos HTTP) |

## Como executar (local)

Este projeto **não requer build** — são arquivos HTML estáticos. Use um servidor local (o service worker e o carregamento de CSVs não funcionam via `file://`):

```bash
cd /caminho/para/o/repositorio
python -m http.server 8000
# acesse http://localhost:8000/
```

**Requisitos:** apenas um navegador para usar o site. Para rodar os testes, Node.js e `npm install` (a única dependência é o `papaparse`). Os scripts de `scripts/` usam Python 3 e só precisam de internet para o importador da Wikipedia.

## Testes

`npm test` roda **sete suítes** em sequência; o backtest é separado porque é mais lento.

| Comando | O que verifica | Asserções |
|---|---|---|
| `npm run test:model` | Matemática do modelo de clubes (Poisson, τ de Dixon-Coles, pesos, MLE) | 51 |
| `npm run test:selecoes` | Modelo de seleções | 111 |
| `npm run test:pwa` | Manifest, service worker, ícones, `<head>` das páginas | 73 |
| `npm run test:copa` | Chaveamento da Copa 2026 | 8 |
| `npm run test:i18n` | Cobertura en/zh, `{placeholders}`, chaves `_t()`, blocos de docs | 57 |
| `npm run test:competicoes` | Calendário, rodada de hoje, Série B e `scripts/dados_serie.py` | 55 |
| `npm run test:backtest` | **Trava de acurácia** (Série A): walk-forward, falha se perder para a taxa-base | — |
| `npm run test:backtest:b` | A mesma trava para a Série B | — |

Rode o backtest depois de **qualquer** mudança na matemática do modelo.

## Idiomas

O site está disponível em **português (padrão), inglês e chinês simplificado**. O seletor `PT | EN | 中文` fica no cabeçalho de cada página; a escolha é guardada no navegador (ou use `?lang=en`). As traduções ficam em `i18n/` (veja a seção *Internationalization* do `CLAUDE.md`) e são validadas por `npm run test:i18n`.

## Modelos

Os modelos em `modelos/` implementam regressão de Poisson com correção de Dixon-Coles:

| | Clubes (`model.js`) | Seleções (`selecoes-model.js`) |
|---|---|---|
| Unidade de tempo | rodadas (o CSV não tem datas) | datas reais |
| Decaimento | exponencial por rodada, com piso | meia-vida mais longa + peso por importância do torneio |
| ρ (Dixon-Coles) | estimado junto com os demais parâmetros | busca em grade |
| Elo | reset parcial por temporada | decaimento por data |
| Campo neutro | — | sim |

Comum aos dois: ataque/defesa por equipe e vantagem de casa (γ) por MLE (Adam, 400 iterações). **Não há fator de forma nem de descanso**: ambos pioravam o backtest e foram removidos (veja `CLAUDE.md`).

## Atualização de dados

Depois de cada rodada do Brasileirão:

1. **Resultados** — acrescente-os em **três lugares, sempre iguais**: `datasets/campeonato-brasileiro-limpo.csv` (lido pelo backtest) e o bloco `window.__EMBEDDED_CSV__` de `apps/index.html` e de `simulacoes/bench-brasileirao2026.html`.
2. **Calendário** — em `datasets/calendario.js`: mova a rodada para `concluida`, inclua datas e jogos das próximas, atualize `atualizadoEm` e remova de `pendentes` os jogos já disputados.
3. **Verificação** — `npm test` e `npm run test:backtest`.
4. **Números escritos à mão** — `index.html`, `README.md` (tabelas acima), `CLAUDE.md` e `datasets/readme.md`.
5. **Cache** — suba `CACHE_VERSION` em `service-worker.js`.

Série B: regere o CSV com `python scripts/importar_wikipedia_serie_b.py` (veja [scripts/readme.md](scripts/readme.md)).

## Contribuição

1. Faça um fork desse projeto.
2. Crie uma branch (`feature/minha-melhoria`).
3. Abra um Pull Request descrevendo a mudança.

> [!IMPORTANT]
> Consulte o [ToDo.md](ToDo.md) para a lista de melhorias planejadas.

## Licença

MIT
