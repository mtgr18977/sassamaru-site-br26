#!/usr/bin/env python3
"""Importa a Série B (2007–2025) da Wikipedia para o formato do modelo.

    python scripts/importar_wikipedia_serie_b.py [--saida datasets/campeonato-brasileiro-serie-b.csv] [--cache DIR]

Fonte: cada página "AAAA Campeonato Brasileiro Série B" (en.wikipedia.org, wikitext bruto) traz a matriz
completa de resultados (mandante × visitante, 380 jogos). 2014 (matriz incompleta) e 2015 (sem matriz) usam a tabela
"Confrontos" da página em português. 2006 não tem matriz em nenhuma das duas e fica de fora.

ATENÇÃO — a matriz não traz data nem rodada. O modelo mede o tempo em rodadas, então a rodada é
SINTÉTICA: o calendário é montado pelo método do círculo (19 rodadas de ida + 19 de volta) com o sorteio de
qual perna é a primeira, fixado por uma semente por temporada. Os resultados e os mandos são reais; só a
ORDEM dos jogos dentro da temporada é inventada (a coluna `rodada_origem` registra isso). O efeito é pequeno
(a meia-vida do modelo é de ~4 temporadas), mas é ruído: troque por rodadas reais assim que houver fonte.
"""
import argparse
import csv
import os
import random
import re
import sys
import time
import urllib.parse
import urllib.request

UA = "sassamaru-site-br26 importer (https://github.com/mtgr18977/sassamaru-site-br26)"
ANOS_PT = (2014, 2015)  # a matriz do inglês é incompleta (2014) ou ausente (2015); usa-se a tabela do pt.wikipedia
ANOS_EN = [a for a in range(2007, 2026) if a not in ANOS_PT]
# mesmo clube, nomes diferentes entre páginas → o nome usado no dataset da Série A (para o modelo reconhecer o clube)
CANONICO = {
    "América Mineiro": "América-MG", "Atlético Goianiense": "Atlético-GO", "Atlético Paranaense": "Athletico Paranaense",
    "América": "América-RN", "América de Natal": "América-RN", "Grêmio Barueri": "Barueri", "Sport Recife": "Sport",
}


def baixar(url, cache, nome):
    destino = os.path.join(cache, nome) if cache else None
    if destino and os.path.exists(destino):
        return open(destino, encoding="utf-8").read()
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        texto = r.read().decode("utf-8")
    if destino:
        os.makedirs(cache, exist_ok=True)
        open(destino, "w", encoding="utf-8").write(texto)
    time.sleep(1)  # educado com a Wikipedia
    return texto


def _nome(valor):
    valor = valor.strip()
    m = re.search(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]", valor)
    nome = (m.group(2) or m.group(1)) if m else valor
    return CANONICO.get(nome.strip(), nome.strip())


def parse_en(texto):
    """Matriz do módulo {{#invoke:sports results}}: |name_COD=… e |match_MAND_VIS=1–0."""
    nomes = {c: _nome(v) for c, v in re.findall(r"^\|name_(\w+)=(.+)$", texto, re.M)}
    jogos = {}
    for h, a, valor in re.findall(r"^\|match_(\w+)_(\w+)=(.*)$", texto, re.M):
        g = re.search(r"(\d+)\s*[–-]\s*(\d+)", valor)  # o placar pode vir dentro de um link: [[Derby Campineiro|2–1]]
        if g:
            jogos[(nomes[h], nomes[a])] = (int(g.group(1)), int(g.group(2)))
    return sorted(set(nomes.values())), jogos


def parse_pt_tabela(texto):
    """Tabela 'Confrontos' do pt.wikipedia: uma linha por mandante, uma célula por visitante.
    Os códigos vêm da ordem das colunas do cabeçalho; os nomes, do cabeçalho de cada linha (mesma ordem)."""
    texto = texto[texto.index("== Confrontos"):]
    cab = re.search(r"^!.*?!!(.+)$", texto, re.M)  # 1ª linha de cabeçalho com "!!" (o texto antes do 1º "!!" varia)
    ordem = re.findall(r"[A-Z]{3}", cab.group(1))
    corpo = texto[cab.end():]
    corpo = corpo[:corpo.index("|}")]
    blocos = [b for b in corpo.split("\n|-") if b.strip()]
    nomes, jogos = {}, {}
    for i, bloco in enumerate(blocos):
        m = re.match(r"\s*!\s*(.+)", bloco)
        nomes[ordem[i]] = _nome(re.sub(r"'''|<[^>]+>", "", m.group(1)))
    for i, bloco in enumerate(blocos):
        mand = nomes[ordem[i]]
        for cod, conteudo in re.findall(r"^\|<!--\s*([A-Z]{3})\s*-->(.*)$", bloco, re.M):
            g = re.search(r"(\d+)\s*[–-]\s*(\d+)", conteudo)
            if g and cod in nomes:
                jogos[(mand, nomes[cod])] = (int(g.group(1)), int(g.group(2)))
    return sorted(set(nomes.values())), jogos


def rodadas_sinteticas(times, jogos, semente):
    """Monta um calendário de turno e returno (método do círculo) e atribui a cada jogo real uma rodada."""
    rng = random.Random(semente)
    t = sorted(times)
    rng.shuffle(t)
    n = len(t)
    saida = []
    giro = t[:]
    for r in range(n - 1):
        for i in range(n // 2):
            a, b = giro[i], giro[n - 1 - i]
            if rng.random() < 0.5:
                a, b = b, a            # a joga em casa na 1ª perna; b, na 2ª
            saida.append((r + 1, a, b))
            saida.append((r + n, b, a))
        giro = [giro[0], giro[-1]] + giro[1:-1]
    linhas = []
    for rod, h, a in sorted(saida):
        gh, ga = jogos[(h, a)]
        linhas.append((rod, h, a, gh, ga))
    return linhas


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--saida", default="datasets/campeonato-brasileiro-serie-b.csv")
    ap.add_argument("--cache", default=None, help="pasta para guardar o wikitext baixado")
    a = ap.parse_args()

    temporadas = {}
    for ano in ANOS_EN:
        url = "https://en.wikipedia.org/w/index.php?title=" + urllib.parse.quote(f"{ano}_Campeonato_Brasileiro_Série_B") + "&action=raw"
        temporadas[ano] = parse_en(baixar(url, a.cache, f"en{ano}.txt"))
    for ano in ANOS_PT:
        url = "https://pt.wikipedia.org/w/index.php?title=" + urllib.parse.quote(f"Campeonato_Brasileiro_de_Futebol_de_{ano}_-_Série_B") + "&action=raw"
        temporadas[ano] = parse_pt_tabela(baixar(url, a.cache, f"pt{ano}.txt"))

    problemas = []
    linhas_saida = []
    print(f"{'temp.':>5} {'clubes':>6} {'jogos':>6}")
    for ano in sorted(temporadas):
        times, jogos = temporadas[ano]
        print(f"{ano:>5} {len(times):>6} {len(jogos):>6}")
        if len(times) != 20 or len(jogos) != 380:
            problemas.append(f"{ano}: {len(times)} clubes, {len(jogos)} jogos (esperado 20 e 380)")
            continue
        for rod, h, ad, gh, ga in rodadas_sinteticas(times, jogos, semente=ano):
            linhas_saida.append((ano, rod, h, ad, gh, ga))
    if problemas:
        sys.exit("temporadas incompletas:\n  " + "\n  ".join(problemas))

    with open(a.saida, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["ID", "rodata", "mandante", "visitante", "vencedor", "mandante_Placar", "visitante_Placar", "rodada_origem"])
        for i, (ano, rod, h, ad, gh, ga) in enumerate(linhas_saida, start=1):
            venc = h if gh > ga else ad if ga > gh else "Empate"
            w.writerow([i, f"{rod}.0", h, ad, venc, gh, ga, "sintetica"])
    print(f"\n{len(linhas_saida)} jogos em {a.saida} (rodadas sintéticas; 2006 ausente)")


if __name__ == "__main__":
    main()
