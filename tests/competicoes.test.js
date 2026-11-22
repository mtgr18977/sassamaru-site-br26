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
  ok(b.zonas.acesso[1] === 2 && b.zonas.playoff[0] === 3 && b.zonas.playoff[1] === 6 && b.zonas.rebaixamento[0] === 17, 'Série B: 1º–2º sobem, 3º–6º playoff de acesso, Z4');
  ok(JSON.stringify(b.playoffAcesso.cruzamentos) === '[[3,6],[4,5]]' && b.playoffAcesso.vagas === 2, 'Série B: playoff 3º×6º e 4º×5º, 2 vagas (4 promovidos no total)');
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
section('Calendário da Série B 2026 — temporada encerrada');
{
  const cal = CALS['serie-b-2026'];
  let s = C.statusCalendario(cal, at('2026-10-06'));
  ok(s.estado === 'em-andamento' && s.foco.n === 32, '6 out: 32ª rodada da Série B em andamento');
  s = C.statusCalendario(cal, at('2026-10-09'));
  ok(s.estado === 'entre-rodadas' && s.foco.n === 33 && s.ultima.n === 32, '9 out: entre a 32 e a 33');
  s = C.statusCalendario(cal, at('2026-11-03'));
  ok(s.estado === 'entre-rodadas' && s.foco.n === 37 && s.ultima.n === 36, '3 nov: próxima é a 37');
  s = C.statusCalendario(cal, at('2026-11-14'));
  ok(s.estado === 'em-andamento' && s.foco.n === 38, '14 nov: última rodada em andamento');
  s = C.statusCalendario(cal, at('2026-11-20'));
  ok(s.estado === 'encerrada' && s.ultima.n === 38, '20 nov: 38ª rodada jogada → temporada encerrada');
  ok(cal.rodadas.length === 38 && cal.rodadas.every((r) => r.status === 'concluida'), 'as 38 rodadas estão concluídas');
  ok(cal.jogos.length === 0 && cal.pendentes.length === 0, 'sem jogos por vir nem pendentes');
  const csvB = path.join(ROOT, C.obter('serie-b').csv);
  if (fs.existsSync(csvB)) {
    const ls = fs.readFileSync(csvB, 'utf8').trim().split('\n').slice(1), n26 = ls.length - 19 * 380;
    ok(n26 === 380, 'Série B 2026: 380 jogos no dataset (temporada completa)');
    // todo jogo da tabela básica da CBF tem resultado no dataset, com a mesma rodada
    const cbf = fs.readFileSync(path.join(ROOT, 'datasets/serie-b-2026-tabela-cbf.csv'), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
    const rod = new Map(ls.slice(-n26).map((l) => { const c = l.split(','); return [M.normalizeTeam(c[2]) + '|' + M.normalizeTeam(c[3]), Number(c[1])]; }));
    ok(cbf.every((c) => rod.get(M.normalizeTeam(c[1]) + '|' + M.normalizeTeam(c[2])) === Number(c[0])), 'todos os 380 jogos da tabela da CBF estão no dataset, na mesma rodada');
  }
}

// ── playoff de acesso da Série B ────────────────────────────────────────────
section('Playoff de acesso da Série B 2026');
{
  const cal = CALS['serie-b-2026'], po = cal.playoff;
  ok(po && po.confrontos.length === 2, 'dois confrontos');
  ok(po.confrontos.every((c) => c.jogos.length === 2 && c.jogos[0].fase === 'ida' && c.jogos[1].fase === 'volta'), 'cada confronto: ida e volta');
  // o melhor colocado joga a volta em casa
  ok(po.confrontos.every((c) => c.jogos[1].mandante === c.melhor && c.jogos[0].mandante === c.pior && c.jogos[0].visitante === c.melhor && c.jogos[1].visitante === c.pior), 'o melhor colocado manda a volta; a ida é na casa do pior');
  ok(po.confrontos.every((c) => c.jogos[0].data < c.jogos[1].data), 'a ida vem antes da volta');
  ok(po.confrontos.every((c) => c.jogos.every((j) => /^\d{4}-\d\d-\d\d$/.test(j.data) && /^\d\d:\d\d$/.test(j.hora) && (j.placar === null || (Array.isArray(j.placar) && j.placar.length === 2 && j.placar.every(Number.isInteger))))), 'datas, horas e placares bem formados');
  ok(po.confrontos[0].pos.join() === '3,6' && po.confrontos[1].pos.join() === '4,5', 'chaves 3º × 6º e 4º × 5º');
  // os 4 clubes são mesmo o 3º–6º da classificação da fase regular do dataset
  const csvB = path.join(ROOT, C.obter('serie-b').csv);
  if (fs.existsSync(csvB)) {
    const ls = fs.readFileSync(csvB, 'utf8').trim().split('\n').slice(1), n26 = ls.length - 19 * 380;
    const pts = {};
    for (const l of ls.slice(-n26)) {
      const c = l.split(','), h = M.normalizeTeam(c[2]), a = M.normalizeTeam(c[3]), gh = +c[5], ga = +c[6];
      pts[h] = (pts[h] || 0) + (gh > ga ? 3 : gh === ga ? 1 : 0);
      pts[a] = (pts[a] || 0) + (ga > gh ? 3 : gh === ga ? 1 : 0);
    }
    const ord = Object.entries(pts).sort((x, y) => y[1] - x[1]).map((e) => e[0]);
    const nome = (c) => [M.normalizeTeam(c.melhor), M.normalizeTeam(c.pior)];
    ok(nome(po.confrontos[0]).join() === [ord[2], ord[5]].join() && nome(po.confrontos[1]).join() === [ord[3], ord[4]].join(),
      'confrontos = 3º×6º e 4º×5º da classificação final (pelo dataset)');
    ok(pts[ord[5]] > pts[ord[6]], 'a fase regular separa o 6º do 7º colocado (ninguém depende de desempate para entrar)');
  }
  // resumoPlayoff
  const mk = (p1, p2) => ({ melhor: 'M', pior: 'P', jogos: [{ fase: 'ida', mandante: 'P', visitante: 'M', placar: p1 }, { fase: 'volta', mandante: 'M', visitante: 'P', placar: p2 }] });
  let r = C.resumoPlayoff(mk(null, null));
  ok(r.estado === 'a-jogar' && r.classificado === null && r.agregado.M === 0, 'sem placares: a jogar');
  r = C.resumoPlayoff(mk([2, 0], null));
  ok(r.estado === 'em-andamento' && r.agregado.P === 2 && r.agregado.M === 0 && r.classificado === null, 'só a ida: agregado parcial, sem classificado');
  r = C.resumoPlayoff(mk([2, 0], [1, 0]));
  ok(r.estado === 'decidido' && r.classificado === 'P' && !r.porCriterio, 'pior colocado vira e sobe (agregado 2×1)');
  r = C.resumoPlayoff(mk([0, 1], [0, 0]));
  ok(r.classificado === 'M' && !r.porCriterio, 'melhor colocado vence no agregado');
  r = C.resumoPlayoff(mk([1, 1], [2, 2]));
  ok(r.agregado.M === 3 && r.agregado.P === 3 && r.classificado === 'M' && r.porCriterio, 'empate no agregado: sobe o melhor colocado (gols fora não contam)');
  r = C.resumoPlayoff(mk([0, 3], [0, 0]));
  ok(r.classificado === 'M', 'gol conta pelo clube, não pelo mando');
  // próximos jogos
  let pj = C.proximosJogosPlayoff(po);
  const pend = po.confrontos.flatMap((c) => c.jogos).filter((j) => !j.placar);
  ok(pj === null ? pend.length === 0 : pj.jogos.length >= 1 && pj.jogos.every((j) => j.fase === pj.fase && !j.placar), 'próximos jogos: só da fase mais próxima e sem placar');
  const fake = { confrontos: [mk([1, 0], null), mk(null, null)].map((c, i) => ({ id: 'XY'[i], melhor: 'M', pior: 'P', jogos: c.jogos.map((j) => Object.assign({ data: j.fase === 'ida' ? '2026-11-22' : '2026-11-27', hora: '20:00' }, j)) })) };
  pj = C.proximosJogosPlayoff(fake);
  ok(pj.fase === 'ida' && pj.jogos.length === 1 && pj.data === '2026-11-22', 'ida de uma chave ainda por jogar vem antes das voltas');
  fake.confrontos[1].jogos[0].placar = [0, 0];
  pj = C.proximosJogosPlayoff(fake);
  ok(pj.fase === 'volta' && pj.jogos.length === 2, 'idas jogadas: carrega as 2 voltas');
  fake.confrontos.forEach((c) => c.jogos.forEach((j) => { j.placar = [0, 0]; }));
  ok(C.proximosJogosPlayoff(fake) === null && C.proximosJogosPlayoff(undefined) === null, 'tudo jogado (ou sem playoff): nada a carregar');
}

// ── título garantido ────────────────────────────────────────────────────────
section('campeaoAntecipado — título garantido');
{
  const L = (t, pts, w, played) => ({ t, pts, w, played });
  // o caso real de 22/11/2026: Flamengo 80 pts/24 V, Palmeiras 74/21 V, ambos com 36 jogos → empata em 80, mas tem mais vitórias
  let r = C.campeaoAntecipado([L('fla', 80, 24, 36), L('pal', 74, 21, 36), L('cru', 66, 20, 36), L('flu', 60, 17, 35)], 38);
  ok(r && r.clube === 'fla' && !r.encerrada && r.faltam === 2 && r.vice === 'pal' && r.vantagem === 6, 'Flamengo: 80 pts/24 V × teto do Palmeiras (80 pts/23 V) → campeão com 2 rodadas por jogar');
  ok(C.campeaoAntecipado([L('a', 80, 22, 36), L('b', 74, 21, 36)], 38) === null, 'empate possível em pontos com vitórias iguais ou menos (22 × 23): ainda não é garantido');
  ok(C.campeaoAntecipado([L('a', 80, 23, 36), L('b', 74, 21, 36)], 38) === null, 'mesmas vitórias possíveis (23 × 23): saldo de gols decidiria → não é garantido');
  ok(C.campeaoAntecipado([L('a', 81, 22, 36), L('b', 74, 21, 36)], 38).clube === 'a', 'pontos à frente do teto do rival: campeão mesmo com menos vitórias');
  ok(C.campeaoAntecipado([L('a', 70, 20, 30), L('b', 69, 20, 30)], 38) === null, 'corrida aberta: null');
  // jogos a menos do rival contam: b tem um jogo atrasado
  ok(C.campeaoAntecipado([L('a', 80, 24, 36), L('b', 74, 21, 35)], 38) === null, 'rival com jogo a mais por disputar pode chegar a 83: não garantido');
  r = C.campeaoAntecipado([L('nov', 73, 21, 38), L('juv', 71, 20, 38), L('vil', 66, 18, 38)], 38);
  ok(r && r.clube === 'nov' && r.encerrada && r.faltam === 0 && r.vantagem === 2, 'temporada completa: o líder da tabela é o campeão');
  ok(C.campeaoAntecipado([], 38) === null && C.campeaoAntecipado(undefined, 38) === null, 'sem tabela: null');
}

// ── rodadas sobrepostas ─────────────────────────────────────────────────────
section('statusCalendario — rodadas que se sobrepõem');
{
  const cal = { rodadas: [
    { n: 1, inicio: '2026-11-21', fim: '2026-11-25', status: 'confirmada' },
    { n: 2, inicio: '2026-11-24', fim: '2026-11-29', status: 'confirmada' },
    { n: 3, inicio: '2026-12-02', fim: '2026-12-02', status: 'confirmada' }], jogos: [], pendentes: [] };
  let s = C.statusCalendario(cal, at('2026-11-24'));
  ok(s.atual.n === 1 && s.proxima.n === 2, 'dia comum às duas: a rodada 1 (menor) ainda está em andamento e a próxima é a 2, não a 3');
  s = C.statusCalendario(cal, at('2026-11-26'));
  ok(s.atual.n === 2 && s.proxima.n === 3, 'depois do fim da 1: a 2 em andamento, a 3 é a próxima');
}

section('Integridade do calendário 2026');
{
  const cal = CALS['serie-a-2026'];
  ok(cal.rodadas.length === 38 && cal.rodadas.every((r, i) => r.n === i + 1), '38 rodadas numeradas em sequência');
  const datadas = cal.rodadas.filter((r) => r.inicio);
  ok(datadas.every((r) => r.inicio <= r.fim), 'início ≤ fim em toda rodada');
  let ordenado = true;
  for (let i = 1; i < datadas.length; i++) if (datadas[i].inicio <= datadas[i - 1].inicio || datadas[i].fim < datadas[i - 1].fim) ordenado = false;
  ok(ordenado, 'rodadas datadas começam e terminam em ordem (a 36ª e a 37ª podem se sobrepor por um dia)');
  ok(cal.rodadas.filter((r) => r.status !== 'concluida').every((r) => r.inicio && r.fim), 'rodadas futuras sempre têm datas');
  const ultimaC = Math.max(...cal.rodadas.filter((r) => r.status === 'concluida').map((r) => r.n));
  ok(cal.rodadas.filter((r) => r.n <= ultimaC).every((r) => r.status === 'concluida'), `concluídas formam um bloco contínuo desde a 1ª (até a ${ultimaC}ª)`);

  // coerência com o dataset: os confrontos da rodada 30–34 existem e usam nomes que o modelo reconhece
  const csv = fs.readFileSync(path.join(ROOT, 'datasets/campeonato-brasileiro-limpo.csv'), 'utf8').split('\n').slice(1);
  const norm = new Set();
  const jogados = new Set();
  for (const l of csv.slice(-300)) {
    const p = l.split(',');
    if (p.length < 7) continue;
    norm.add(M.normalizeTeam(p[2])); norm.add(M.normalizeTeam(p[3]));
    jogados.add(M.normalizeTeam(p[2]) + '|' + M.normalizeTeam(p[3]));
  }
  const comJogos = [...new Set(cal.jogos.map((j) => j.rodada))].sort((a, b) => a - b);
  ok(comJogos.every((r) => r > ultimaC), 'calendário só guarda jogos de rodadas ainda não concluídas (apague os da rodada que acabou)');
  for (const r of comJogos) {
    const j = C.jogosDaRodada(cal, r);
    const times = new Set(j.flatMap((x) => [M.normalizeTeam(x.mandante), M.normalizeTeam(x.visitante)]));
    ok(j.length >= 1 && j.length <= 10 && times.size === 2 * j.length, `rodada ${r}: até 10 jogos, sem clube repetido`);
    ok([...times].every((t) => norm.has(t)), `rodada ${r}: todos os nomes batem com o dataset`);
    ok(j.every((x) => { const rd = cal.rodadas[r - 1]; return !x.data || (x.data >= rd.inicio && x.data <= rd.fim); }), `rodada ${r}: datas dos jogos dentro da janela da rodada`);
  }
  ok(cal.pendentes.every((pend) => !jogados.has(M.normalizeTeam(pend.mandante) + '|' + M.normalizeTeam(pend.visitante))),
    'nenhum jogo pendente já está no dataset — remova de "pendentes" quando for disputado');
}

// ── dataset da Série B ──────────────────────────────────────────────────────
section('Dataset da Série B (Wikipedia; rodadas sintéticas até 2025, reais da CBF em 2026)');
{
  const b = C.obter('serie-b');
  const file = path.join(ROOT, b.csv);
  if (!fs.existsSync(file)) {
    console.log('  – CSV da Série B ausente; seção ignorada');
  } else {
    const [cab, ...ls] = fs.readFileSync(file, 'utf8').trim().split('\n');
    const cols = cab.split(',');
    const rows = ls.map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v])));
    const n26 = rows.length - 19 * 380;
    ok(n26 > 0 && n26 <= 380, `19 temporadas completas + ${n26} jogos de 2026 = ${rows.length}`);
    ok(rows.slice(0, 19 * 380).every((r) => r.rodada_origem === 'sintetica'), '2007–2025: rodada marcada como sintética');
    const r26 = rows.slice(-n26), cont = {};
    ok(r26.every((r) => r.rodada_origem === 'cbf'), '2026: rodada real, da tabela básica da CBF');
    for (const r of r26) { cont[r.mandante] = (cont[r.mandante] || 0) + 1; cont[r.visitante] = (cont[r.visitante] || 0) + 1; }
    const nj = Object.values(cont);
    ok(nj.length === 20 && Math.max(...nj) - Math.min(...nj) <= 1, `2026: todo clube jogou ${Math.min(...nj)} ou ${Math.max(...nj)} vezes (rodadas completas + jogos adiados)`);
    // cada jogo de 2026 está na tabela da CBF, com o mando e a rodada certos, e nenhum clube joga duas vezes na mesma rodada
    const cbf = {};
    for (const l of fs.readFileSync(path.join(ROOT, 'datasets/serie-b-2026-tabela-cbf.csv'), 'utf8').trim().split('\n').slice(1)) { const c = l.split(','); cbf[c[1] + '|' + c[2]] = +c[0]; }
    ok(Object.keys(cbf).length === 380, 'tabela básica da CBF: 380 jogos');
    ok(r26.every((r) => cbf[r.mandante + '|' + r.visitante] === Math.round(+r.rodata)), '2026: cada jogo está na tabela da CBF com o mando e a rodada certos');
    const porRodada = {};
    let duplicado = false;
    for (const r of r26) for (const tm of [r.mandante, r.visitante]) { const k = r.rodata + '|' + tm; if (porRodada[k]) duplicado = true; porRodada[k] = true; }
    ok(!duplicado, '2026: nenhum clube joga duas vezes na mesma rodada');
    ok(!r26.some((r) => r.mandante === 'Fortaleza' && r.visitante === 'CRB' && r.mandante_Placar === '1' && r.visitante_Placar === '1'), '2026: sem o Fortaleza 1×1 CRB fantasma (o returno é só em 12 out)');
    // temporada 2025: os 4 primeiros são os promovidos que estão na Série A 2026
    const t25 = rows.slice(18 * 380, 19 * 380), pts = {}, sg = {};
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
    if (!py.error) ok(py.status === 0 && new RegExp(`20 temporadas, ${rows.length} jogos, 0 com problema`).test(py.stdout), 'scripts/dados_serie.py validar aprova o CSV da Série B');
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
