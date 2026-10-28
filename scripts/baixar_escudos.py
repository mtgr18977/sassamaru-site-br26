#!/usr/bin/env python3
"""Baixa o escudo de cada clube da Série A e da Série B para icons/clubes/<chave>.png.

Para cada clube lê o infobox da página dele na Wikipedia em português (campo `imagem`) e baixa o arquivo em 160 px de
largura. A chave é o nome normalizado do modelo com hífen no lugar do espaço ("atletico-go"). Grava também
icons/clubes/fontes.csv (clube, artigo, arquivo, url) para dar crédito e permitir trocar/remover um escudo.

Os escudos são marcas dos clubes; a Wikipedia só os hospeda. Precisa de internet. Pausa entre requisições e repete com
espera quando recebe 429.

Uso (da raiz do repositório):  python scripts/baixar_escudos.py [--so chave ...] [--forcar]
"""
import argparse, csv, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

UA = "sassamaru-site-updater/1.0 (guilhermepilotti@gmail.com)"
SAIDA = os.path.join("icons", "clubes")
LARGURA = 160
PAUSA = 2.0

# chave do modelo → artigo na Wikipedia em português
CLUBES = {
    # Série A 2026
    "flamengo": "Clube de Regatas do Flamengo", "palmeiras": "Sociedade Esportiva Palmeiras",
    "athletico-paranaense": "Club Athletico Paranaense", "cruzeiro": "Cruzeiro Esporte Clube",
    "fluminense": "Fluminense Football Club", "atletico-mineiro": "Clube Atlético Mineiro",
    "bahia": "Esporte Clube Bahia", "santos": "Santos Futebol Clube", "sao-paulo": "São Paulo Futebol Clube",
    "bragantino": "Red Bull Bragantino", "botafogo": "Botafogo de Futebol e Regatas",
    "coritiba": "Coritiba Foot Ball Club", "vasco": "Club de Regatas Vasco da Gama",
    "vitoria": "Esporte Clube Vitória", "mirassol": "Mirassol Futebol Clube",
    "internacional": "Sport Club Internacional", "gremio": "Grêmio Foot-Ball Porto Alegrense",
    "corinthians": "Sport Club Corinthians Paulista", "remo": "Clube do Remo", "chapecoense": "Associação Chapecoense de Futebol",
    # Série B 2026
    "novorizontino": "Grêmio Novorizontino", "juventude": "Esporte Clube Juventude", "vila-nova": "Vila Nova Futebol Clube",
    "fortaleza": "Fortaleza Esporte Clube", "criciuma": "Criciúma Esporte Clube", "crb": "Clube de Regatas Brasil",
    "sport": "Sport Club do Recife", "atletico-go": "Atlético Clube Goianiense",
    "operario-ferroviario": "Operário Ferroviário Esporte Clube", "sao-bernardo": "São Bernardo Futebol Clube",
    "goias": "Goiás Esporte Clube", "cuiaba": "Cuiabá Esporte Clube", "botafogo-sp": "Botafogo Futebol Clube (Ribeirão Preto)",
    "athletic": "Athletic Club (Minas Gerais)", "ceara": "Ceará Sporting Club", "nautico": "Clube Náutico Capibaribe",
    "avai": "Avaí Futebol Clube", "londrina": "Londrina Esporte Clube", "america-mg": "América Futebol Clube (Minas Gerais)",
    "ponte-preta": "Associação Atlética Ponte Preta",
}


def pegar(url, tentativas=6):
    espera = 20
    for i in range(tentativas):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read(), r.headers.get("Content-Type", "")
        except urllib.error.HTTPError as e:
            if e.code == 429 and i < tentativas - 1:
                time.sleep(espera); espera *= 2; continue
            raise
    raise RuntimeError("sem resposta")


def arquivo_do_infobox(artigo):
    # action=raw do index.php (a API tem limite de requisições mais apertado para IPs compartilhados)
    for _ in range(3):   # segue até 3 redirecionamentos (#REDIRECIONAMENTO [[Artigo]])
        q = urllib.parse.urlencode({"title": artigo.replace(" ", "_"), "action": "raw"})
        wikitexto = pegar("https://pt.wikipedia.org/w/index.php?" + q)[0].decode("utf-8")
        r = re.match(r"\s*#(?:REDIRECIONAMENTO|REDIRECT)\s*\[\[([^\]|#]+)", wikitexto, re.I)
        if not r:
            break
        artigo = r.group(1).strip(); time.sleep(PAUSA)
    # o nome do campo varia entre os infoboxes (imagem, img, escudo, logo); vale o primeiro que aponta para um arquivo de imagem
    padrao = re.compile(r"^\s*\|\s*(?:imagem|img|escudo|logo)\s*=\s*(?!\s*$)(.*\.(?:svg|png|jpe?g|webp|gif)\b.*)$", re.M | re.I)
    m = padrao.search(wikitexto[:8000])
    if not m:   # alguns artigos só chamam um sub-modelo ({{Info/Clube de futebol/Fortaleza Esporte Clube}}): o campo está nele
        sub = re.search(r"\{\{\s*(Info/[^|}\n]+)", wikitexto[:3000])
        if sub:
            time.sleep(PAUSA)
            q = urllib.parse.urlencode({"title": "Predefinição:" + sub.group(1).strip().replace(" ", "_"), "action": "raw"})
            m = padrao.search(pegar("https://pt.wikipedia.org/w/index.php?" + q)[0].decode("utf-8")[:8000])
    if not m:
        raise RuntimeError(f"infobox sem campo de imagem: {artigo}")
    nome = re.sub(r"<!--.*?-->", "", m.group(1)).strip()
    nome = re.sub(r"^\[\[(?:Ficheiro|Arquivo|File|Imagem):", "", nome, flags=re.I).split("|")[0].rstrip("]").strip()
    nome = re.sub(r"^(?:Ficheiro|Arquivo|File|Imagem):", "", nome, flags=re.I)
    return nome


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--so", nargs="*", help="só estas chaves")
    ap.add_argument("--forcar", action="store_true", help="baixa de novo mesmo se o arquivo já existe")
    a = ap.parse_args()
    os.makedirs(SAIDA, exist_ok=True)
    fontes_path = os.path.join(SAIDA, "fontes.csv")
    fontes = {}
    if os.path.exists(fontes_path):
        with open(fontes_path, encoding="utf-8") as f:
            fontes = {r["clube"]: r for r in csv.DictReader(f)}
    falhas = []
    for chave, artigo in CLUBES.items():
        if a.so and chave not in a.so:
            continue
        destino = os.path.join(SAIDA, chave + ".png")
        if os.path.exists(destino) and not a.forcar and chave in fontes:
            continue
        try:
            arq = arquivo_do_infobox(artigo); time.sleep(PAUSA)
            url = "https://pt.wikipedia.org/wiki/Special:FilePath/" + urllib.parse.quote(arq.replace(" ", "_")) + f"?width={LARGURA}"
            dados, tipo = pegar(url); time.sleep(PAUSA)
            if not tipo.startswith("image/") or dados[:4] != b"\x89PNG":
                raise RuntimeError(f"não veio PNG ({tipo}, {len(dados)} bytes)")
            with open(destino, "wb") as f:
                f.write(dados)
            fontes[chave] = {"clube": chave, "artigo": artigo, "arquivo": arq, "url": "https://pt.wikipedia.org/wiki/Ficheiro:" + urllib.parse.quote(arq.replace(" ", "_"))}
            print(f"ok   {chave:22} {arq}  ({len(dados)//1024} KB)", flush=True)
        except Exception as e:  # noqa: BLE001 — segue para o próximo e lista no fim
            falhas.append(chave); print(f"FALHA {chave:21} {e}", flush=True)
        with open(fontes_path, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=["clube", "artigo", "arquivo", "url"], lineterminator="\n")
            w.writeheader(); w.writerows(fontes[c] for c in CLUBES if c in fontes)
    print(f"\n{len(fontes)}/{len(CLUBES)} escudos; falhas: {falhas or 'nenhuma'}")
    sys.exit(1 if falhas else 0)


if __name__ == "__main__":
    main()
