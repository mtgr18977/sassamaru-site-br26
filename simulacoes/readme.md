# Simulações

Páginas autocontidas, com os dados embutidos.

| Arquivo | Aba | O que faz |
|---------|-----|-----------|
| `bench-brasileirao2026.html` | **Série A** → *Simulação da temporada* | Monte Carlo do restante do Brasileirão 2026, a partir da tabela atual (`computeSeasonState()`). Zonas da Série A fixas no código; ainda não serve para a Série B |
| `bench-copa2026.html` | **Copa 2026** | Simulação do torneio completo (grupos + chaveamento) |

`bench-brasileirao2026.html` usa `../modelos/model.js`; `bench-copa2026.html` ainda carrega uma cópia inline do modelo de seleções.
