# sassamaru-site-br26

Simulador de **seleções (Copa do Mundo)** e de **clubes (Campeonato Brasileiro)**, com páginas HTML estáticas e materiais de apoio (datasets, modelos e simulações).

## Estrutura do repositório

- `apps/`  
  Webapps (páginas HTML) para cada simulação.
  - `apps/index.html` — página principal (webapp).
  - `apps/bench-selecoes.html` — página de benchmark/seleções (webapp).
  - `apps/readme.md` — descrição curta da pasta.

- `datasets/`  
  Dados utilizados nas simulações (arquivos/datasets de entrada).

- `modelos/`  
  Modelos utilizados/estudados nas simulações.

- `simulacoes/`  
  Artefatos e organização das simulações.

## Como executar (local)

Este projeto **não roda em Node** — são **arquivos HTML estáticos**.

Você pode abrir direto no navegador, mas o ideal é usar um servidor local simples para evitar limitações do navegador (ex.: CORS ao carregar arquivos locais).

### Opção 1: abrir direto (mais simples)
- Abra `apps/index.html` no navegador.

### Opção 2: servidor local (recomendado)

#### Usando Python
```bash
cd apps
python -m http.server 8000
```

Acesse:
- http://localhost:8000/

## Webapps disponíveis

- **Index (principal)**: `apps/index.html`.
- **Bench/Seleções**: `apps/bench-selecoes.html`.

## Componentes

- páginas web de simulação/visualização (`apps/`).
- datasets (`datasets/`).
- modelos (`modelos/`).
- execuções e variações de simulações (`simulacoes/`).

## Contribuição

Sugestões e melhorias são bem-vindas, para isso faça o seguinte:
1. Faça um fork desse projeto.
2. Crie uma branch (`feature/minha-melhoria`).
3. Abra um Pull Request (PR) descrevendo a mudança.

## Licença

MIT
