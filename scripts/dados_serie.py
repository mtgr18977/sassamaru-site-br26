#!/usr/bin/env python3
"""Ferramentas para trazer outra divisão (ex.: Série B) para o formato do Sassamaru.

    python scripts/dados_serie.py validar datasets/campeonato-brasileiro-limpo.csv
    python scripts/dados_serie.py converter resultados_b.csv datasets/campeonato-brasileiro-serie-b.csv

`converter` aceita um CSV com uma linha por jogo e cabeçalho (os nomes abaixo, em qualquer caixa):
    temporada | ano | season                     (obrigatória)
    rodada | round | rodata                      (obrigatória)
    mandante | home | time_casa                  (obrigatória)
    visitante | away | time_fora                 (obrigatória)
    gols_mandante | mandante_placar | home_goals (obrigatória)
    gols_visitante | visitante_placar | away_goals (obrigatória)
e escreve o formato lido por modelos/model.js (ID,rodata,mandante,visitante,vencedor,
mandante_Placar,visitante_Placar), em ordem cronológica — o modelo detecta as temporadas pelos
blocos de jogos da rodada 1, então a ordem importa.

`validar` confere o resultado (ou qualquer CSV desse formato): jogos por temporada, rodadas 1–38,
número de clubes e jogos por clube. Sai com código 1 se achar problema.
"""
import argparse
import csv
import sys
from collections import Counter, defaultdict

ALIASES = {
    "temporada": ("temporada", "ano", "season"),
    "rodada": ("rodada", "round", "rodata"),
    "mandante": ("mandante", "home", "time_casa"),
    "visitante": ("visitante", "away", "time_fora"),
    "gm": ("gols_mandante", "mandante_placar", "home_goals", "placar_mandante"),
    "gv": ("gols_visitante", "visitante_placar", "away_goals", "placar_visitante"),
}


def _col(header, chave):
    low = {h.lower().strip(): h for h in header}
    for nome in ALIASES[chave]:
        if nome in low:
            return low[nome]
    raise SystemExit(f"coluna '{chave}' não encontrada (aceito: {', '.join(ALIASES[chave])}); cabeçalho: {header}")


def converter(entrada, saida):
    with open(entrada, newline="", encoding="utf-8-sig") as f:
        leitor = csv.DictReader(f)
        cols = {k: _col(leitor.fieldnames, k) for k in ALIASES}
        linhas = []
        for n, r in enumerate(leitor, start=2):
            try:
                linhas.append((int(float(r[cols["temporada"]])), int(float(r[cols["rodada"]])), n,
                               r[cols["mandante"]].strip(), r[cols["visitante"]].strip(),
                               int(r[cols["gm"]]), int(r[cols["gv"]])))
            except (ValueError, TypeError):
                raise SystemExit(f"linha {n}: valores inválidos {dict(r)}")
    # ordem cronológica: temporada, rodada e, no empate, a ordem original do arquivo
    linhas.sort(key=lambda x: (x[0], x[1], x[2]))
    with open(saida, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["ID", "rodata", "mandante", "visitante", "vencedor", "mandante_Placar", "visitante_Placar"])
        for i, (_, rod, _, m, v, gm, gv) in enumerate(linhas, start=1):
            vencedor = m if gm > gv else v if gv > gm else "Empate"
            w.writerow([i, f"{rod}.0", m, v, vencedor, gm, gv])
    print(f"{len(linhas)} jogos escritos em {saida}")


def _temporadas(linhas):
    """Mesmo critério de modelos/model.js: nova temporada = bloco de ≥5 jogos seguidos da rodada 1."""
    ids, atual, i = [], -1, 0
    while i < len(linhas):
        if linhas[i] == 1:
            j = i
            while j < len(linhas) and linhas[j] == 1:
                j += 1
            if j - i >= 5:
                atual += 1
                ids.extend([atual] * (j - i))
                i = j
                continue
        ids.append(max(atual, 0))
        i += 1
    return ids


def validar(caminho, times=20, rodadas=38):
    with open(caminho, newline="", encoding="utf-8-sig") as f:
        linhas = list(csv.DictReader(f))
    rod = []
    for r in linhas:
        try:
            rod.append(int(float(r["rodata"])) if r["rodata"] else 0)
        except ValueError:
            rod.append(0)
    por_temp = defaultdict(list)
    for r, rd, s in zip(linhas, rod, _temporadas(rod)):
        por_temp[s].append((rd, r["mandante"].strip(), r["visitante"].strip()))

    esperado = times * (times - 1)
    print(f"{'temp.':>5} {'jogos':>6} {'clubes':>6} {'rodadas':>7} {'jogos/clube':>12}  situação")
    problemas = 0
    for s in sorted(por_temp):
        jogos = por_temp[s]
        n = Counter()
        for _, m, v in jogos:
            n[m] += 1
            n[v] += 1
        rods = {rd for rd, _, _ in jogos if rd}
        msgs, em_andamento = [], False
        if len(jogos) != esperado:
            msgs.append(f"{len(jogos)} jogos (esperado {esperado})")
        if len(n) != times:
            msgs.append(f"{len(n)} clubes (esperado {times})")
        if rods != set(range(1, rodadas + 1)):
            faltam = sorted(set(range(1, rodadas + 1)) - rods)
            msgs.append(f"rodadas fora de 1–{rodadas}" + (f" (faltam {faltam[:5]})" if faltam else ""))
        if n and (min(n.values()) != max(n.values())):
            msgs.append("clubes com número diferente de jogos: " + ", ".join(f"{t}={c}" for t, c in n.items() if c != rodadas)[:80])
        repetidos = [k for k, c in Counter((m, v) for _, m, v in jogos).items() if c > 1]
        if repetidos:
            msgs.append(f"{len(repetidos)} confrontos repetidos (ex.: {repetidos[0][0]} x {repetidos[0][1]})")
        # última temporada ainda em disputa: só reclama de clubes demais ou confrontos repetidos
        if s == max(por_temp) and len(jogos) < esperado and len(n) <= times and not repetidos:
            msgs = [f"em andamento (rodada {max(rods)}, {len(jogos)} de {esperado} jogos)"]
            em_andamento = True
        gpc = f"{min(n.values())}–{max(n.values())}" if n else "—"
        print(f"{s + 1:>5} {len(jogos):>6} {len(n):>6} {len(rods):>7} {gpc:>12}  {'ok' if not msgs else '; '.join(msgs)}")
        problemas += bool(msgs) and not em_andamento
    print(f"\n{len(por_temp)} temporadas, {len(linhas)} jogos, {problemas} com problema")
    return 1 if problemas else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    v = sub.add_parser("validar", help="confere um CSV no formato do modelo")
    v.add_argument("csv")
    v.add_argument("--times", type=int, default=20)
    v.add_argument("--rodadas", type=int, default=38)
    c = sub.add_parser("converter", help="converte um CSV genérico para o formato do modelo")
    c.add_argument("entrada")
    c.add_argument("saida")
    a = ap.parse_args()
    if a.cmd == "converter":
        converter(a.entrada, a.saida)
        return validar(a.saida)
    return validar(a.csv, a.times, a.rodadas)


if __name__ == "__main__":
    sys.exit(main())
