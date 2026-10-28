'use strict';
/**
 * Simulação do que falta da temporada (modelos/simulacao.js) e identidade visual dos clubes
 * (modelos/clubes.js), usadas pelo modal de apps/clubes.html.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const M = require('../modelos/model.js');
const C = require('../modelos/competicoes.js');
const S = require('../modelos/simulacao.js');
const K = require('../modelos/clubes.js');

let passed = 0, failed = 0;
const ok = (c, msg) => { if (c) { console.log(`  ✓ ${msg}`); passed++; } else { console.error(`  ✗ ${msg}`); failed++; } };
const section = (n) => console.log(`\n${n}`);
const parseCsv = (t) => { const l = t.trim().split(/\r?\n/), c = l[0].split(','); return l.slice(1).filter(Boolean).map((x) => { const v = x.split(','), o = {}; c.forEach((k, i) => { o[k] = v[i]; }); return o; }); };

section('Gerador com semente');
{
  const a = S.rngComSemente(7), b = S.rngComSemente(7), c = S.rngComSemente(8);
  const sa = [a(), a(), a()], sb = [b(), b(), b()], sc = [c(), c(), c()];
  ok(JSON.stringify(sa) === JSON.stringify(sb), 'mesma semente, mesma sequência');
  ok(JSON.stringify(sa) !== JSON.stringify(sc), 'semente diferente, sequência diferente');
  ok(sa.every((x) => x >= 0 && x < 1), 'valores em [0, 1)');
}

section('Mecânica (modelo falso: o mandante sempre ganha de 1×0)');
{
  const Falso = { predictMatch: () => ({ scoreAdj: new Map([['1,0', 1]]) }) };
  // A e B empatados em 3 pontos; C com 0. Resta A×B (A em casa) e C×A (C em casa).
  const tab = (pts, w, gd, gf) => ({ pts, w, gd, gf });
  const estado = {
    teams: ['a', 'b', 'c'],
    standings: new Map([['a', tab(3, 1, 0, 1)], ['b', tab(3, 1, 0, 1)], ['c', tab(0, 0, -1, 0)]]),
    remaining: [['a', 'b'], ['c', 'a']],
  };
  const sim = S.simularTemporada(Falso, {}, estado, { n: 50 });
  // A vence B (6 pts), C vence A (3 pts): a=6, b=3, c=3 → b e c empatam em pontos, vitórias e SG? b: gd -1+0... conferido abaixo
  ok(S.probabilidade(sim, 'a', 1, 1) === 1, 'A termina sempre em 1º');
  ok(Math.abs(sim.times.a.pontos - 6) < 1e-9, 'A termina com 6 pontos');
  ok(sim.times.b.pontos === 3 && sim.times.c.pontos === 3, 'B e C terminam com 3 pontos');
  // desempate: vitórias (b=1, c=1), saldo (b: 0−1=−1; c: −1+1=0) → C fica à frente de B
  ok(S.probabilidade(sim, 'c', 2, 2) === 1 && S.probabilidade(sim, 'b', 3, 3) === 1, 'desempate por saldo de gols: C (0) à frente de B (−1)');
  ok(Object.values(sim.times).every((t) => t.hist.reduce((x, y) => x + y, 0) === 50), 'cada clube soma n simulações');
}

section('Dados reais (Série A e Série B)');
for (const id of ['serie-a', 'serie-b']) {
  const comp = C.obter(id);
  const rows = parseCsv(fs.readFileSync(path.join(ROOT, comp.csv), 'utf8'));
  const model = M.buildModel(rows, { trainFromSeason: C.indiceTreino(comp) });
  const st = M.computeSeasonState(rows);
  const sim = S.simularTemporada(M, model, st, { n: 2000 });
  const outra = S.simularTemporada(M, model, st, { n: 2000 });
  const nT = st.teams.length;
  const col = (p) => st.teams.reduce((s, t) => s + sim.times[t].hist[p], 0);
  ok(Array.from({ length: nT }, (_, p) => col(p)).every((x) => x === 2000), `${comp.nome}: cada posição é ocupada uma vez por simulação`);
  ok(JSON.stringify(sim.times) === JSON.stringify(outra.times), `${comp.nome}: reprodutível (semente fixa)`);
  const pr = (t, de, ate) => S.probabilidade(sim, t, de, ate);
  const faixas = comp.faixasClube;
  ok(Math.abs(st.teams.reduce((s, t) => s + pr(t, 1, 1), 0) - 1) < 1e-9, `${comp.nome}: as chances de ser 1º somam 100%`);
  let monotono = true;
  for (const t of st.teams) {
    const g = (x) => pr(t, x.de, x.ate);
    if (id === 'serie-a') monotono = monotono && g(faixas[0]) <= g(faixas[1]) + 1e-12 && g(faixas[1]) <= g(faixas[2]) + 1e-12;
    else monotono = monotono && g(faixas[0]) <= g(faixas[1]) + 1e-12;
  }
  ok(monotono, `${comp.nome}: título ≤ G4 ≤ G8 (A) / G2 ≤ G6 (B) para todo clube`);
  ok(st.teams.every((t) => sim.times[t].pontos >= st.standings.get(t).pts), `${comp.nome}: pontos projetados ≥ pontos atuais`);
  const expRel = st.teams.reduce((s, t) => s + pr(t, 17, 20), 0);
  ok(Math.abs(expRel - 4) < 1e-9, `${comp.nome}: em média 4 clubes caem por simulação`);
}

section('Faixas do modal × zonas do registro');
{
  const a = C.obter('serie-a'), b = C.obter('serie-b');
  const f = (comp, id) => comp.faixasClube.find((x) => x.id === id);
  ok(JSON.stringify(a.faixasClube.map((x) => x.id)) === '["titulo","g4","g8","sul","rebaixamento"]', 'Série A: título, G4, G8, Sul-Americana, cair');
  ok(JSON.stringify(b.faixasClube.map((x) => x.id)) === '["g2","g6","rebaixamento"]', 'Série B: G2, G6, cair');
  ok(f(a, 'sul').de === a.zonas.sulamericana[0] && f(a, 'sul').ate === a.zonas.sulamericana[1], 'Série A: Sul-Americana = zonas.sulamericana');
  ok(f(a, 'rebaixamento').de === a.zonas.rebaixamento[0] && f(b, 'rebaixamento').ate === b.zonas.rebaixamento[1], 'cair = zonas.rebaixamento nas duas divisões');
  ok(f(b, 'g2').ate === b.zonas.acesso[1] && f(b, 'g6').ate === b.zonas.playoff[1], 'Série B: G2 = acesso direto, G6 = até o fim do playoff');
}

section('Escudos');
{
  const nomes = new Set();
  for (const id of ['serie-a', 'serie-b']) {
    const rows = parseCsv(fs.readFileSync(path.join(ROOT, C.obter(id).csv), 'utf8'));
    for (const t of M.computeSeasonState(rows).teams) nomes.add(t);
  }
  const semCor = [...nomes].filter((t) => !K.CORES[t]);
  ok(nomes.size === 40, `40 clubes nas duas divisões (${nomes.size})`);
  ok(semCor.length === 0, `todo clube tem cor${semCor.length ? ' — faltam: ' + semCor.join(', ') : ''}`);
  ok(K.sigla('Vila Nova') === 'VN' && K.sigla('Atlético-GO') === 'AG' && K.sigla('Flamengo') === 'FLA' && K.sigla('São Bernardo') === 'SB', 'siglas');
  const svg = K.escudoSvg('flamengo', 'Flamengo');
  ok(svg.startsWith('<svg') && svg.includes('FLA') && svg.includes(K.cores('flamengo')[0]), 'brasão de reserva é um SVG com a sigla e a cor do clube');
  ok(K.arquivo('atletico go') === 'atletico-go.png' && K.escudoImg('sao paulo', 'São Paulo', '../').includes('src="../icons/clubes/sao-paulo.png"'), 'escudoImg aponta para icons/clubes/<chave>.png');

  // escudos reais (baixados por scripts/baixar_escudos.py)
  const dir = path.join(ROOT, 'icons/clubes');
  const semImagem = [...nomes].filter((t) => {
    const f = path.join(dir, K.arquivo(t));
    return !fs.existsSync(f) || fs.readFileSync(f).subarray(0, 4).toString('hex') !== '89504e47';
  });
  ok(semImagem.length === 0, `todo clube tem o PNG do escudo em icons/clubes${semImagem.length ? ' — faltam: ' + semImagem.join(', ') : ''}`);
  const fontes = fs.readFileSync(path.join(dir, 'fontes.csv'), 'utf8').trim().split('\n').slice(1).map((l) => l.split(',')[0]);
  ok([...nomes].every((t) => fontes.includes(t.replace(/\s+/g, '-'))), 'fontes.csv registra a origem de cada escudo');

}

console.log(`\n${'─'.repeat(50)}\nsimulacao: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
