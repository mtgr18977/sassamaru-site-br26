#!/usr/bin/env python3
"""Converte a "Tabela Básica" da CBF (PDF) num CSV rodada × mandante × visitante.

    pdftotext -layout Tabela_Basica_Brasileiro_Serie_B_2026.pdf - | python scripts/importar_tabela_cbf.py - datasets/serie-b-2026-tabela-cbf.csv
    python scripts/importar_tabela_cbf.py tabela.pdf saida.csv        # chama o pdftotext (poppler) sozinho

A tabela básica lista os 380 jogos com a RODADA REAL de cada um (as datas ali são só janelas planejadas e
mudam; ignore-as). É o que permite trocar as rodadas sintéticas da Série B 2026 por rodadas reais
(`importar_wikipedia_serie_b.py` usa este CSV). A rodada de cada jogo vem da numeração (REF 1–10 = rodada 1…),
não do rótulo impresso, porque o PDF tem erros de digitação (o jogo 330 está rotulado "34" e é da rodada 33).

Os nomes saem como no dataset do modelo (ver ALIASES). Baixe o PDF em
https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/serie-b/2026
"""
import csv
import re
import subprocess
import sys

ALIASES = {  # nome na tabela da CBF → nome no dataset
    "Atlético": "Atlético-GO", "América": "América-MG", "Botafogo": "Botafogo-SP",
    "São Bernardo FC": "São Bernardo", "Operário": "Operário Ferroviário",
}


def parse(texto):
    """{REF: (rodada, mandante, visitante)} a partir do texto do pdftotext -layout."""
    jogos = {}
    for linha in texto.split("\n"):
        m = re.match(r"\s*(\d{3})\s+(\d{1,2})ª?(?:\s|$)(.*)$", linha)
        if not m:
            continue
        campos = re.split(r"\s{2,}", m.group(3).strip())
        if "x" not in campos:
            continue
        i = campos.index("x")
        if i < 2:
            continue
        ref = int(m.group(1))
        mand, vis = campos[i - 2].strip(), campos[i + 1].strip()
        if ref > 380 or re.search(r"colocado", mand + vis):  # 381+ são os playoffs de acesso
            continue
        jogos[ref] = ((ref - 1) // 10 + 1, ALIASES.get(mand, mand), ALIASES.get(vis, vis))
    return jogos


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    entrada, saida = sys.argv[1:]
    if entrada == "-":
        texto = sys.stdin.read()
    elif entrada.lower().endswith(".pdf"):
        texto = subprocess.run(["pdftotext", "-layout", entrada, "-"], check=True, capture_output=True, text=True).stdout
    else:
        texto = open(entrada, encoding="utf-8").read()
    jogos = parse(texto)
    faltam = sorted(set(range(1, 381)) - set(jogos))
    if faltam:
        sys.exit(f"só {len(jogos)} jogos lidos; faltam as REF {faltam[:10]}")
    times = {t for _, h, a in jogos.values() for t in (h, a)}
    if len(times) != 20:
        sys.exit(f"esperava 20 clubes, achei {len(times)}: {sorted(times)}")
    pares = {(h, a) for _, h, a in jogos.values()}
    if len(pares) != 380:
        sys.exit("há confrontos repetidos")
    with open(saida, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["rodada", "mandante", "visitante"])
        for ref in sorted(jogos):
            w.writerow(jogos[ref])
    print(f"{len(jogos)} jogos, 20 clubes → {saida}")


if __name__ == "__main__":
    main()
