#!/usr/bin/env python3
"""Importa a Série B (2007–2025 + 2026 em andamento) da Wikipedia para o formato do modelo.

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
ANO_ANDAMENTO = 2026  # temporada em curso: entra só com os jogos já disputados
ANOS_PT = (2014, 2015)  # a matriz do inglês é incompleta (2014) ou ausente (2015); usa-se a tabela do pt.wikipedia
ANOS_EN = [a for a in range(2007, 2026) if a not in ANOS_PT]
# mesmo clube, nomes diferentes entre páginas → o nome usado no dataset da Série A (para o modelo reconhecer o clube)
CANONICO = {
    "América Mineiro": "América-MG", "Atlético Goianiense": "Atlético-GO", "Atlético Paranaense": "Athletico Paranaense",
    "América": "América-RN", "América de Natal": "América-RN", "Grêmio Barueri": "Barueri", "Sport Recife": "Sport",
    "Vila Nova-GO": "Vila Nova", "Operário-PR": "Operário Ferroviário",
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
    m = re.fullmatch(r"\{\{\s*Futebol\s+([^|}]+?)\s*(?:\|[^}]*)?\}\}", valor)  # {{Futebol América-MG}} (pt.wikipedia)
    if m:
        return CANONICO.get(m.group(1).strip(), m.group(1).strip())
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


def rodadas_parciais(times, jogos, semente, tentativas=200):
    """Temporada em andamento: se todo clube jogou k vezes, os jogos disputados formam k rodadas completas.
    Reparte os jogos em k rodadas (cada clube joga uma vez por rodada) procurando emparelhamentos perfeitos
    ao acaso; resultados e mandos são os reais, a ordem das rodadas é sintética (como nas outras temporadas).
    Jogos adiados já disputados (clubes com k+1 jogos) entram como uma rodada parcial k+1."""
    n_jogos = {t: 0 for t in times}
    for h, a in jogos:
        n_jogos[h] += 1
        n_jogos[a] += 1
    k = min(n_jogos.values())
    extra = {t for t, v in n_jogos.items() if v == k + 1}
    if any(v not in (k, k + 1) for v in n_jogos.values()) or len(extra) % 2:
        sys.exit(f"número de jogos por clube incoerente: {sorted(n_jogos.items(), key=lambda x: x[1])[:4]}")
    # jogos adiados já disputados (clubes com k+1 jogos) viram uma rodada parcial k+1; o resto são k rodadas completas
    jogos = dict(jogos)
    antecipados = []
    for t in sorted(extra):
        if t not in {x for g in antecipados for x in g[:2]}:
            par = [(h, a) for (h, a) in jogos if {h, a} <= extra and t in (h, a) and not ({h, a} & {x for g in antecipados for x in g[:2]})]
            if not par:
                sys.exit(f"não achei o jogo antecipado de {t}")
            h, a = sorted(par)[0]
            antecipados.append((h, a, *jogos.pop((h, a))))
    rng = random.Random(semente)
    for _ in range(tentativas):
        restantes = {}
        for (h, a) in jogos:
            restantes.setdefault(frozenset((h, a)), []).append((h, a))
        rodadas, ok = [], True
        for _r in range(k):
            vizinhos = {t: [u for u in times if u != t and frozenset((t, u)) in restantes] for t in times}
            casamento, usados = {}, set()

            def achar():
                livres = [t for t in times if t not in usados]
                if not livres:
                    return True
                t = min(livres, key=lambda x: len([u for u in vizinhos[x] if u not in usados]))  # o mais restrito primeiro
                cand = [u for u in vizinhos[t] if u not in usados]
                rng.shuffle(cand)
                for u in cand:
                    usados.update((t, u))
                    casamento[t] = u
                    if achar():
                        return True
                    usados.difference_update((t, u))
                    del casamento[t]
                return False
            if not achar():
                ok = False
                break
            rodada = []
            for t, u in casamento.items():
                lista = restantes[frozenset((t, u))]
                jogo = lista.pop(rng.randrange(len(lista)))
                if not lista:
                    del restantes[frozenset((t, u))]
                rodada.append(jogo)
            rodadas.append(rodada)
        if ok and not restantes:
            saida = [(r + 1, h, a, *jogos[(h, a)]) for r, rod in enumerate(rodadas) for h, a in sorted(rod)]
            return saida + [(k + 1, h, a, gh, ga) for h, a, gh, ga in antecipados]
    sys.exit("não consegui repartir os jogos da temporada em andamento em rodadas completas")


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

    # temporada em andamento (pt.wikipedia, conferida com a en.wikipedia): jogos disputados até agora
    url_pt = "https://pt.wikipedia.org/w/index.php?title=" + urllib.parse.quote(f"Campeonato_Brasileiro_de_Futebol_de_{ANO_ANDAMENTO}_-_Série_B") + "&action=raw"
    url_en = "https://en.wikipedia.org/w/index.php?title=" + urllib.parse.quote(f"{ANO_ANDAMENTO}_Campeonato_Brasileiro_Série_B") + "&action=raw"
    times_pt, jogos_pt = parse_en(baixar(url_pt, a.cache, f"pt{ANO_ANDAMENTO}.txt"))
    times_en, jogos_en = parse_en(baixar(url_en, a.cache, f"en{ANO_ANDAMENTO}.txt"))
    if jogos_pt != jogos_en or times_pt != times_en:
        dif = sorted(set(jogos_pt.items()) ^ set(jogos_en.items()))[:5]
        print(f"AVISO: as páginas pt e en de {ANO_ANDAMENTO} divergem ({len(jogos_pt)} × {len(jogos_en)} jogos): {dif}")
    # a página mais completa vence (a mais recente costuma ser a que tem mais jogos)
    times_26, jogos_26 = (times_pt, jogos_pt) if len(jogos_pt) >= len(jogos_en) else (times_en, jogos_en)
    print(f"{ANO_ANDAMENTO:>5} {len(times_26):>6} {len(jogos_26):>6}  (em andamento; pt={len(jogos_pt)} en={len(jogos_en)})")

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
    if len(times_26) == 20 and jogos_26:
        for rod, h, ad, gh, ga in rodadas_parciais(times_26, jogos_26, semente=ANO_ANDAMENTO):
            linhas_saida.append((ANO_ANDAMENTO, rod, h, ad, gh, ga))

    with open(a.saida, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["ID", "rodata", "mandante", "visitante", "vencedor", "mandante_Placar", "visitante_Placar", "rodada_origem"])
        for i, (ano, rod, h, ad, gh, ga) in enumerate(linhas_saida, start=1):
            venc = h if gh > ga else ad if ga > gh else "Empate"
            w.writerow([i, f"{rod}.0", h, ad, venc, gh, ga, "sintetica"])
    print(f"\n{len(linhas_saida)} jogos em {a.saida} (rodadas sintéticas; 2006 ausente; {ANO_ANDAMENTO} parcial)")


if __name__ == "__main__":
    main()
