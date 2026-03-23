# Sassamaru BR 26 | Sassamaru WC 26

Simulador de **seleções (Copa do Mundo)** e de **clubes (Campeonato Brasileiro)**, com páginas HTML estáticas e materiais de apoio (datasets, modelos e simulações).

## Estrutura do repositório

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
# acesse http://localhost:8000/apps/
```

## Testes

```bash
npm test                 # testes do modelo de clubes
npm run test:selecoes    # testes do modelo de seleções (110+ asserções)
npm run test:pwa         # validação do PWA (manifest, service worker, ícones)
```

## Modelos

Os modelos em `modelos/` implementam regressão de Poisson com correção de Dixon-Coles:

- **Força de ataque/defesa** por equipe estimada via MLE (Adam optimizer, 400 iterações)
- **Sistema Elo** com decaimento temporal (meia-vida: 730 dias / 2 anos para clubes e seleções)
- **Fator de forma** baseado nos últimos jogos com bônus de recência
- **Vantagem em casa** calculada por equipe quando há dados suficientes

## Webapps disponíveis

| Webapp | Arquivo |
|--------|---------|
| Brasileirão 2026 | `apps/index.html` |
| Copa do Mundo 2026 | `apps/bench-selecoes.html` |

## Atualização de dados

Para adicionar novas rodadas, atualize o artefato de simulação em `simulacoes/` (ex.: `simulacoes/bench-brasileirao2026.html`), que contém o modelo e os dados embutidos inline. Os webapps em `apps/` (ex.: `apps/index.html`, `apps/bench-selecoes.html`) também incluem dados embutidos (via `window.__EMBEDDED_CSV__`) e são os arquivos referenciados na seção **"Webapps disponíveis"**; se você estiver alterando os dados do simulador principal, lembre-se de atualizar tanto o HTML em `simulacoes/` quanto o HTML correspondente em `apps/`, mantendo os blocos de dados sincronizados.

## Contribuição

1. Faça um fork desse projeto.
2. Crie uma branch (`feature/minha-melhoria`).
3. Abra um Pull Request descrevendo a mudança.

> [!IMPORTANT]
> Consulte o [ToDo.md](https://github.com/mtgr18977/sassamaru-site-br26/blob/main/ToDo.md) para a lista de melhorias planejadas.

## Licença

MIT
