// ═══════════════════════════════════════════════════════════════════════════
//  Competições + calendário + prontidão para a Série B.
//  - statusCalendario: qual rodada é a de "hoje" e quantos dias faltam;
//  - integridade do calendário (datas ordenadas, jogos coerentes com o dataset);
//  - o modelo aguenta uma liga com alta rotatividade de clubes (caso da Série B);
//  - scripts/dados_serie.py converte e valida um CSV de outra divisão.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const C = require('../modelos/competicoes.js');
const CALS = require('../datasets/calendario.js');
const M = require('../modelos/model.js');

const ROOT = path.resolve(__dirname, '..');
let passed = 0, failed = 0;
const ok = (c, msg) => { if (c) { console.log(`  ✓ ${msg}`); passed++; } else { console.error(`  ✗ ${msg}`); failed++; } };
const section = (n) => console.log(`\n${n}`);
const at = (s) => new Date(s + 'T15:30:00'); // meio da tarde local: independe do fuso

// ── registro ────────────────────────────────────────────────────────────────
section('Registro de competições');
{
  const a = C.obter('serie-a'), b = C.obter('serie-b');
  ok(a.nTimes === 20 && a.rodadas === 38 && a.dados === 'embutido', 'Série A: 20 clubes, 38 rodadas, dados embutidos');
  ok(b.pontosCorridosDesde === 2006 && b.nTimes === 20 && b.rodadas === 38, 'Série B: pontos corridos desde 2006, 20 clubes, 38 rodadas');
  ok(b.zonas.acesso[1] === 4 && b.zonas.rebaixamento[0] === 17, 'Série B: G4 de acesso e Z4');
  ok(C.obter('qualquer-coisa').id === 'serie-a', 'id desconhecido cai na Série A');
  ok(C.indiceTreino(a) === 12, 'índice de treino da Série A = 2015 − 2003');
  ok(C.indiceTreino(b) === 0, 'Série B treina com todo o histórico (índice 0 = 2007)');
  ok(fs.existsSync(path.join(ROOT, a.csv)), 'CSV da Série A existe');
  ok(b.calendario === 'serie-b-2026', 'Série B tem calendário');
  ok(b.dados === 'pendente' ? !fs.existsSync(path.join(ROOT, b.csv)) : fs.existsSync(path.join(ROOT, b.csv)),
    'Série B: "dados" reflete se o CSV existe (troque para "disponivel" ao importar)');
  ok(b.rodadasSinteticas === true, 'Série B: rodadas marcadas como sintéticas');
}

// ── status do calendário ────────────────────────────────────────────────────
section('statusCalendario — rodada de hoje');
{
  const cal = CALS['serie-a-2026'];
  let s = C.statusCalendario(cal, at('2026-10-06'));
  ok(s.estado === 'entre-rodadas' && s.foco.n === 29 && s.diasAteFoco === 1, '6 out: próxima é a 29, faltam 1 dia');
  ok(s.ultima.n === 28, '6 out: última encerrada é a 28');
  s = C.statusCalendario(cal, at('2026-10-07'));
  ok(s.estado === 'em-andamento' && s.foco.n === 29 && s.diasAteFoco === 0, '7 out: 29ª em andamento');
  ok(s.proxima.n === 30 && s.diasAteProxima === 3, '7 out: depois vem a 30ª, em 3 dias');
  ok(s.diasParaFimAtual === 1, '7 out: a 29ª termina amanhã');
  s = C.statusCalendario(cal, at('2026-10-09'));
  ok(s.estado === 'entre-rodadas' && s.foco.n === 30 && s.diasAteFoco === 1 && s.ultima.n === 29, '9 out: entre a 29 e a 30');
  s = C.statusCalendario(cal, at('2026-10-12'));
  ok(s.estado === 'em-andamento' && s.foco.n === 30 && s.diasParaFimAtual === 0, '12 out: último dia da 30ª');
  s = C.statusCalendario(cal, at('2026-12-02'));
  ok(s.estado === 'em-andamento' && s.foco.n === 38 && s.proxima === null, '2 dez: última rodada, sem próxima');
  s = C.statusCalendario(cal, at('2026-12-03'));
  ok(s.estado === 'encerrada' && s.foco === null, '3 dez: temporada encerrada');
  s = C.statusCalendario(cal, at('2026-01-10'));
  ok(s.estado === 'antes' && s.foco.n === 1, 'antes do início: próxima é a 1ª');
  // meia-noite × fim do dia não muda o dia civil
  const a = C.statusCalendario(cal, new Date(2026, 9, 6, 0, 5)), b = C.statusCalendario(cal, new Date(2026, 9, 6, 23, 55));
  ok(a.diasAteFoco === 1 && b.diasAteFoco === 1, 'dias contados em dias civis (00:05 e 23:55 dão o mesmo)');
}

// ── calendário da Série B ───────────────────────────────────────────────────
section('Calendário da Série B 2026 — rodada 32');
{
  const cal = CALS['serie-b-2026'];
  let s = C.statusCalendario(cal, at('2026-10-06'));
  ok(s.estado === 'em-andamento' && s.foco.n === 32, '6 out: 32ª rodada da Série B em andamento');
  s = C.statusCalendario(cal, at('2026-10-09'));
  ok(s.estado === 'sem-calendario' && s.ultima.n === 32, '9 out: acabaram as datas conhecidas → "sem calendário" (não "temporada encerrada")');
  ok(cal.rodadas.length === 38 && cal.rodadas.filter((r) => r.status === 'semdata').length === 6, 'rodadas 33–38 marcadas como sem data');
  const j = C.jogosDaRodada(cal, 32);
  const nomes = new Set(j.flatMap((x) => [M.normalizeTeam(x.mandante), M.normalizeTeam(x.visitante)]));
  ok(j.length === 10 && nomes.size === 20, 'rodada 32: 10 jogos, 20 clubes distintos');
  const csvB = path.join(ROOT, C.obter('serie-b').csv);
  if (fs.existsSync(csvB)) {
    const doDataset = new Set(fs.readFileSync(csvB, 'utf8').trim().split('\n').slice(-311).flatMap((l) => [l.split(',')[2], l.split(',')[3]]).map(M.normalizeTeam));
    ok([...nomes].every((n) => doDataset.has(n)), 'rodada 32: os nomes batem com os clubes da Série B 2026 do dataset');
  }
  ok(j.every((x) => x.data >= cal.rodadas[31].inicio && x.data <= cal.rodadas[31].fim), 'rodada 32: datas dentro da janela');
}

// ── integridade do calendário ───────────────────────────────────────────────
section('Integridade do calendário 2026');
{
  const cal = CALS['serie-a-2026'];
  ok(cal.rodadas.length === 38 && cal.rodadas.every((r, i) => r.n === i + 1), '38 rodadas numeradas em sequência');
  const datadas = cal.rodadas.filter((r) => r.inicio);
  ok(datadas.every((r) => r.inicio <= r.fim), 'início ≤ fim em toda rodada');
  let ordenado = true;
  for (let i = 1; i < datadas.length; i++) if (datadas[i].inicio <= datadas[i - 1].fim) ordenado = false;
  ok(ordenado, 'rodadas datadas não se sobrepõem e estão em ordem');
  ok(cal.rodadas.filter((r) => r.status !== 'concluida').every((r) => r.inicio && r.fim), 'rodadas futuras sempre têm datas');
  ok(cal.rodadas.filter((r) => r.status === 'concluida').every((r) => r.n <= 28), 'só as 28 primeiras estão concluídas');

  // coerência com o dataset: os confrontos da rodada 29/30 existem e usam nomes que o modelo reconhece
  const csv = fs.readFileSync(path.join(ROOT, 'datasets/campeonato-brasileiro-limpo.csv'), 'utf8').split('\n').slice(1);
  const norm = new Set();
  const jogados = new Set();
  for (const l of csv.slice(-300)) {
    const p = l.split(',');
    if (p.length < 7) continue;
    norm.add(M.normalizeTeam(p[2])); norm.add(M.normalizeTeam(p[3]));
    jogados.add(M.normalizeTeam(p[2]) + '|' + M.normalizeTeam(p[3]));
  }
  for (const r of [29, 30]) {
    const j = C.jogosDaRodada(cal, r);
    const times = new Set(j.flatMap((x) => [M.normalizeTeam(x.mandante), M.normalizeTeam(x.visitante)]));
    ok(j.length === 10 && times.size === 20, `rodada ${r}: 10 jogos, 20 clubes distintos`);
    ok([...times].every((t) => norm.has(t)), `rodada ${r}: todos os nomes batem com o dataset`);
    ok(j.every((x) => { const rd = cal.rodadas[r - 1]; return x.data >= rd.inicio && x.data <= rd.fim; }), `rodada ${r}: datas dos jogos dentro da janela da rodada`);
  }
  const pend = cal.pendentes[0];
  ok(pend && !jogados.has(M.normalizeTeam(pend.mandante) + '|' + M.normalizeTeam(pend.visitante)),
    'jogo pendente (Chapecoense × Vasco) ainda não está no dataset — remova de "pendentes" quando for disputado');
}

// ── dataset da Série B ──────────────────────────────────────────────────────
section('Dataset da Série B (Wikipedia, rodadas sintéticas)');
{
  const b = C.obter('serie-b');
  const file = path.join(ROOT, b.csv);
  if (!fs.existsSync(file)) {
    console.log('  – CSV da Série B ausente; seção ignorada');
  } else {
    const [cab, ...ls] = fs.readFileSync(file, 'utf8').trim().split('\n');
    const cols = cab.split(',');
    const rows = ls.map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v])));
    ok(rows.length === 19 * 380 + 311, `19 temporadas completas + 311 jogos de 2026 = ${rows.length}`);
    ok(rows.every((r) => r.rodada_origem === 'sintetica'), 'toda linha marca a rodada como sintética');
    const r26 = rows.slice(-311), cont = {};
    for (const r of r26) { cont[r.mandante] = (cont[r.mandante] || 0) + 1; cont[r.visitante] = (cont[r.visitante] || 0) + 1; }
    ok(Object.values(cont).filter((v) => v === 31).length === 18 && Object.values(cont).filter((v) => v === 32).length === 2, '2026: 18 clubes com 31 jogos e 2 com 32 (um jogo adiado já disputado)');
    // temporada 2025: os 4 primeiros são os promovidos que estão na Série A 2026
    const t25 = rows.slice(-691, -311), pts = {}, sg = {};
    for (const r of t25) {
      const gm = +r.mandante_Placar, gv = +r.visitante_Placar;
      pts[r.mandante] = (pts[r.mandante] || 0) + (gm > gv ? 3 : gm === gv ? 1 : 0);
      pts[r.visitante] = (pts[r.visitante] || 0) + (gv > gm ? 3 : gm === gv ? 1 : 0);
      sg[r.mandante] = (sg[r.mandante] || 0) + gm - gv; sg[r.visitante] = (sg[r.visitante] || 0) + gv - gm;
    }
    const top4 = Object.keys(pts).sort((x, y) => pts[y] - pts[x] || sg[y] - sg[x]).slice(0, 4).map(M.normalizeTeam).sort();
    ok(JSON.stringify(top4) === JSON.stringify(['athletico paranaense', 'chapecoense', 'coritiba', 'remo']),
      `2025: Coritiba, Athletico-PR, Chapecoense e Remo no G4 (${top4.join(', ')})`);
    // mesmo clube = mesmo nome nas duas divisões (senão o modelo não reconhece o clube que subiu)
    const A = new Set(fs.readFileSync(path.join(ROOT, C.obter('serie-a').csv), 'utf8').split('\n').slice(-300).flatMap((l) => [l.split(',')[2], l.split(',')[3]]).map(M.normalizeTeam));
    const doB = new Set(t25.flatMap((r) => [r.mandante, r.visitante]).map(M.normalizeTeam));
    ok(['athletico paranaense', 'chapecoense', 'coritiba', 'remo'].every((c) => A.has(c) && doB.has(c)), 'clubes promovidos têm o mesmo nome na Série A e na Série B');
    const py = spawnSync('python3', ['-I', path.join(ROOT, 'scripts/dados_serie.py'), 'validar', file], { encoding: 'utf8' });
    if (!py.error) ok(py.status === 0 && /20 temporadas, 7531 jogos, 0 com problema/.test(py.stdout), 'scripts/dados_serie.py validar aprova o CSV da Série B');
  }
}

// ── rotatividade alta (Série B) ─────────────────────────────────────────────
section('Modelo com alta rotatividade de clubes');
{
  // 6 temporadas, 20 clubes; a cada ano 6 saem e 6 entram (parecido com a Série B). Força verdadeira conhecida.
  let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const pois = (l) => { let k = 0, p = Math.exp(-l), s = p, u = rnd(); while (u > s && k < 12) { k++; p *= l / k; s += p; } return k; };
  const forca = {}; for (let i = 0; i < 60; i++) forca['Clube ' + i] = 0.6 + rnd() * 1.0;
  let elenco = Array.from({ length: 20 }, (_, i) => 'Clube ' + i), prox = 20;
  const linhas = ['ID,rodata,mandante,visitante,vencedor,mandante_Placar,visitante_Placar']; let id = 1;
  for (let ano = 0; ano < 6; ano++) {
    const t = elenco.slice(); const n = 20;
    for (let rd = 0; rd < n - 1; rd++) {
      for (let i = 0; i < n / 2; i++) for (const [h, a, r] of [[t[i], t[n - 1 - i], rd + 1], [t[n - 1 - i], t[i], rd + n]]) {
        const gh = pois(forca[h] * forca[a] ** -0.5 * 1.35), ga = pois(forca[a] * forca[h] ** -0.5);
        linhas.push(`${id++},${r}.0,${h},${a},${gh > ga ? h : ga > gh ? a : 'Empate'},${gh},${ga}`);
      }
      t.splice(1, 0, t.pop());
    }
    elenco = elenco.slice(6).concat(Array.from({ length: 6 }, () => 'Clube ' + prox++));
  }
  // as linhas precisam estar em ordem de rodada dentro da temporada para o detector de temporadas
  const [cab, ...resto] = linhas;
  const ord = []; for (let s = 0; s < 6; s++) ord.push(...resto.slice(s * 380, (s + 1) * 380).sort((x, y) => parseFloat(x.split(',')[1]) - parseFloat(y.split(',')[1])));
  const cols = cab.split(',');
  const rows = ord.map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v])));
  let model;
  try { model = M.buildModel(rows, { trainFromSeason: 0 }); ok(true, 'buildModel aceita a liga com 6 temporadas e 50 clubes'); }
  catch (e) { ok(false, 'buildModel aceita a liga: ' + e.message); }
  if (model) {
    ok(model.seasonCount === 6, `detecta as 6 temporadas (${model.seasonCount})`);
    ok(model.teamCount > 30, `ajusta clubes de várias temporadas (${model.teamCount})`);
    const finito = [...model.dc.atk.values(), ...model.dc.def.values()].every(Number.isFinite);
    ok(finito, 'todos os parâmetros α/β são finitos');
    const novo = M.predictMatch('Clube 3', 'Clube Recém-Chegado', model);
    const soma = novo.probs ? novo.probs.home + novo.probs.draw + novo.probs.away : (novo.pH + novo.pD + novo.pA);
    ok(Math.abs(soma - 1) < 1e-6, 'clube sem histórico: probabilidades somam 1');
    ok(JSON.stringify(novo).includes('não encontrado'), 'clube sem histórico: gera aviso de "não encontrado"');
    // clube que saiu da liga há anos ainda tem força estimada, mas com peso temporal baixo
    const N = M.normalizeTeam;
    ok(model.dc.atk.has(N('Clube 0')) && model.dc.atk.has(N('Clube 25')), 'clubes que saíram e que entraram ao longo dos anos têm parâmetros');
    // recupera a ordenação das forças: o clube mais forte da última temporada deve ter α·(1/β) maior que o mais fraco
    const ultimos = elenco.slice(0, 20).filter((c) => model.dc.atk.has(N(c)));
    const score = (c) => model.dc.atk.get(N(c)) / model.dc.def.get(N(c));
    const verd = (c) => forca[c];
    const melhor = ultimos.slice().sort((x, y) => verd(y) - verd(x))[0], pior = ultimos.slice().sort((x, y) => verd(x) - verd(y))[0];
    ok(score(melhor) > score(pior), 'o modelo ordena o melhor clube acima do pior (força verdadeira conhecida)');
  }
  fs.writeFileSync(path.join(os.tmpdir(), 'sassamaru-churn.csv'), [cab, ...ord].join('\n'));
}

// ── scripts/dados_serie.py ─────────────────────────────────────────────────
section('scripts/dados_serie.py');
{
  const py = spawnSync('python3', ['--version']);
  if (py.error || py.status !== 0) {
    console.log('  – python3 não encontrado; testes do script ignorados');
  } else {
    const script = path.join(ROOT, 'scripts/dados_serie.py');
    const r = spawnSync('python3', ['-I', script, 'validar', path.join(os.tmpdir(), 'sassamaru-churn.csv'), '--times', '20'], { encoding: 'utf8' });
    ok(r.status === 0 && /6 temporadas, 2280 jogos, 0 com problema/.test(r.stdout), 'validar aprova uma liga sintética de 6 temporadas completas');
    const bad = path.join(os.tmpdir(), 'sassamaru-bad.csv');
    const txt = fs.readFileSync(path.join(os.tmpdir(), 'sassamaru-churn.csv'), 'utf8').split('\n');
    fs.writeFileSync(bad, txt.slice(0, 400).concat(txt.slice(401)).join('\n')); // remove um jogo
    const r2 = spawnSync('python3', ['-I', script, 'validar', bad], { encoding: 'utf8' });
    ok(r2.status === 1 && /379 jogos/.test(r2.stdout), 'validar reprova (exit 1) quando falta um jogo');
  }
}

console.log(`\n${'─'.repeat(50)}\ncompeticoes: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
