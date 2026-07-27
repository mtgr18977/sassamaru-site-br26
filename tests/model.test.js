// ═══════════════════════════════════════════════════════════════════════════
//  Testes unitários do modelo do Brasileirão.
//
//  Cobrem a matemática (Poisson, τ de Dixon-Coles, pesos, MLE) sobre dados
//  sintéticos. A qualidade preditiva sobre dados reais é medida em
//  tests/backtest.test.js — os dois são complementares.
// ═══════════════════════════════════════════════════════════════════════════
const assert = require("assert");
const {
  CONFIG,
  normalizeTeam,
  detectSeasons,
  assignSeasonAndRound,
  matchAgeInRounds,
  temporalWeight,
  clamp,
  poissonProb,
  logFactorial,
  oddsFromProbsOverround,
  applyDixonColes,
  removeDuplicateBlock,
  fitDixonColes,
  createScorer,
  buildModel,
  predictMatch,
} = require("../modelos/model.js");

let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(`${name}: ${err.message}`);
  }
}

// ── helpers ────────────────────────────────────────────────────────────────
function makeRow(round, home, away, hg, ag) {
  return {
    [CONFIG.DATE_COL]: String(round),
    [CONFIG.HOME_TEAM_COL]: home,
    [CONFIG.AWAY_TEAM_COL]: away,
    [CONFIG.HOME_GOALS_COL]: String(hg),
    [CONFIG.AWAY_GOALS_COL]: String(ag),
  };
}

/**
 * Gera uma temporada de returno duplo com `teams` times.
 * scoreFn(home, away) → [gh, ga]. A rodada 1 sempre tem >= 5 jogos,
 * o mínimo para detectSeasons reconhecer o início de temporada.
 */
function makeSeason(teams, scoreFn) {
  const rows = [];
  let round = 0;
  for (let leg = 0; leg < 2; leg++) {
    for (let i = 0; i < teams.length; i++) {
      round++;
      for (let j = 0; j < teams.length / 2; j++) {
        const a = teams[(i + j) % teams.length];
        const b = teams[(i + teams.length - 1 - j) % teams.length];
        if (a === b) continue;
        const [home, away] = leg === 0 ? [a, b] : [b, a];
        const [gh, ga] = scoreFn(home, away);
        rows.push(makeRow(round, home, away, gh, ga));
      }
    }
  }
  return rows;
}

const TEAMS = ["alfa", "bravo", "charlie", "delta", "echo", "foxtrot",
               "golf", "hotel", "india", "juliett"];

// ═══════════════════════════════ normalizeTeam ═════════════════════════════
test("normalizeTeam: acentos e caixa", () => {
  assert.strictEqual(normalizeTeam("Atlético-MG"), "atletico mineiro");
  assert.strictEqual(normalizeTeam("São Paulo"), "sao paulo");
  assert.strictEqual(normalizeTeam("Grêmio"), "gremio");
  assert.strictEqual(normalizeTeam("  FLAMENGO  "), "flamengo");
});

test("normalizeTeam: aliases", () => {
  assert.strictEqual(normalizeTeam("Athletico-PR"), "athletico paranaense");
  assert.strictEqual(normalizeTeam("Athletico Paranaense"), "athletico paranaense");
  assert.strictEqual(normalizeTeam("Botafogo-RJ"), "botafogo");
  assert.strictEqual(normalizeTeam("Botafogo FR"), "botafogo");
  assert.strictEqual(normalizeTeam("Vasco da Gama"), "vasco");
  assert.strictEqual(normalizeTeam("Red Bull Bragantino SP"), "bragantino");
});

test("normalizeTeam: entradas vazias", () => {
  assert.strictEqual(normalizeTeam(null), "");
  assert.strictEqual(normalizeTeam(undefined), "");
  assert.strictEqual(normalizeTeam("   "), "");
});

// ═══════════════════════════════ clamp / pesos ═════════════════════════════
test("clamp", () => {
  assert.strictEqual(clamp(5, 0, 10), 5);
  assert.strictEqual(clamp(-1, 0, 10), 0);
  assert.strictEqual(clamp(99, 0, 10), 10);
});

test("matchAgeInRounds", () => {
  assert.strictEqual(matchAgeInRounds(2, 10, 2, 15, 38), 5);
  assert.strictEqual(matchAgeInRounds(1, 30, 2, 5, 38), 13);
  assert.strictEqual(matchAgeInRounds(0, 1, 2, 1, 38), 76);
});

test("temporalWeight: decaimento por meia-vida", () => {
  assert.strictEqual(temporalWeight(0, 76, 0), 1.0);
  assert.strictEqual(temporalWeight(-5, 76, 0), 1.0, "jogo futuro tem peso 1");
  assert.ok(Math.abs(temporalWeight(76, 76, 0) - 0.5) < 1e-12, "1 meia-vida = 0.5");
  assert.ok(Math.abs(temporalWeight(152, 76, 0) - 0.25) < 1e-12, "2 meias-vidas = 0.25");
});

test("temporalWeight: piso mínimo", () => {
  assert.strictEqual(temporalWeight(100000, 76, 0.30), 0.30);
  assert.ok(temporalWeight(10, 76, 0.30) > 0.30, "peso recente fica acima do piso");
});

// ═══════════════════════════════ Poisson ═══════════════════════════════════
test("logFactorial", () => {
  assert.strictEqual(logFactorial(0), 0);
  assert.ok(Math.abs(logFactorial(1) - 0) < 1e-12);
  assert.ok(Math.abs(logFactorial(5) - Math.log(120)) < 1e-12);
  assert.ok(Math.abs(logFactorial(8) - Math.log(40320)) < 1e-9);
});

test("poissonProb: valores conhecidos", () => {
  // P(0; λ) = e^-λ
  assert.ok(Math.abs(poissonProb(1.5, 0) - Math.exp(-1.5)) < 1e-12);
  // P(1; λ) = λ e^-λ
  assert.ok(Math.abs(poissonProb(1.5, 1) - 1.5 * Math.exp(-1.5)) < 1e-12);
  // P(2; 2) = 2 e^-2
  assert.ok(Math.abs(poissonProb(2, 2) - 2 * Math.exp(-2)) < 1e-12);
});

test("poissonProb: λ <= 0", () => {
  assert.strictEqual(poissonProb(0, 0), 1);
  assert.strictEqual(poissonProb(0, 3), 0);
  assert.strictEqual(poissonProb(-1, 0), 1);
});

test("poissonProb: soma da distribuição ≈ 1", () => {
  let s = 0;
  for (let k = 0; k <= 30; k++) s += poissonProb(1.4, k);
  assert.ok(Math.abs(s - 1) < 1e-9, `soma = ${s}`);
});

// ═══════════════════════════════ odds ══════════════════════════════════════
test("oddsFromProbsOverround", () => {
  const o = oddsFromProbsOverround(0.5, 0.25, 0.25, 0);
  assert.ok(Math.abs(o.oh - 2) < 1e-12);
  assert.ok(Math.abs(o.od - 4) < 1e-12);

  const o2 = oddsFromProbsOverround(0.5, 0.25, 0.25, 0.06);
  const implied = 1 / o2.oh + 1 / o2.od + 1 / o2.oa;
  assert.ok(Math.abs(implied - 1.06) < 1e-9, `margem implícita = ${implied}`);
});

test("oddsFromProbsOverround: probabilidade zero não explode", () => {
  const o = oddsFromProbsOverround(0, 0.5, 0.5, 0.06);
  assert.ok(Number.isFinite(o.oh) && o.oh > 1e9);
});

// ═══════════════════════════ Dixon-Coles τ ═════════════════════════════════
test("applyDixonColes: usa o τ dependente de λ", () => {
  const lamH = 1.6, lamA = 1.1, rho = -0.08;
  const raw = new Map();
  for (let gh = 0; gh <= 8; gh++) {
    for (let ga = 0; ga <= 8; ga++) {
      raw.set(`${gh},${ga}`, poissonProb(lamH, gh) * poissonProb(lamA, ga));
    }
  }
  const adj = applyDixonColes(raw, rho, lamH, lamA);

  // Cada célula baixa deve ter sido multiplicada pelo τ correto (a menos da
  // constante de renormalização, que é a mesma para todas as células).
  const scale = adj.get("2,2") / raw.get("2,2");   // célula com τ = 1
  const expect = (key, tau) => {
    const got = adj.get(key) / raw.get(key);
    assert.ok(Math.abs(got - tau * scale) < 1e-12,
      `${key}: esperado τ=${tau}, obtido ${got / scale}`);
  };
  expect("0,0", 1 - lamH * lamA * rho);
  expect("1,0", 1 + lamA * rho);
  expect("0,1", 1 + lamH * rho);
  expect("1,1", 1 - rho);
});

test("applyDixonColes: renormaliza para 1", () => {
  const raw = new Map();
  for (let gh = 0; gh <= 8; gh++) {
    for (let ga = 0; ga <= 8; ga++) raw.set(`${gh},${ga}`, poissonProb(1.4, gh) * poissonProb(1.1, ga));
  }
  const adj = applyDixonColes(raw, -0.1, 1.4, 1.1);
  let s = 0;
  for (const p of adj.values()) s += p;
  assert.ok(Math.abs(s - 1) < 1e-12, `soma = ${s}`);
});

test("applyDixonColes: ρ negativo aumenta 0-0 e reduz 1-0", () => {
  const raw = new Map();
  for (let gh = 0; gh <= 8; gh++) {
    for (let ga = 0; ga <= 8; ga++) raw.set(`${gh},${ga}`, poissonProb(1.4, gh) * poissonProb(1.1, ga));
  }
  const adj = applyDixonColes(raw, -0.1, 1.4, 1.1);
  const scale = adj.get("2,2") / raw.get("2,2");
  assert.ok(adj.get("0,0") / raw.get("0,0") > scale, "0-0 deve subir");
  assert.ok(adj.get("1,0") / raw.get("1,0") < scale, "1-0 deve cair");
});

test("applyDixonColes: ρ = 0 é identidade", () => {
  const raw = new Map([["0,0", 0.25], ["1,0", 0.25], ["0,1", 0.25], ["1,1", 0.25]]);
  const adj = applyDixonColes(raw, 0, 1.3, 1.2);
  for (const [k, v] of raw.entries()) {
    assert.ok(Math.abs(adj.get(k) - v) < 1e-12, `${k} mudou com ρ=0`);
  }
});

// ═════════════════════ detecção de temporada / rodada ══════════════════════
test("detectSeasons: encontra duas temporadas", () => {
  const rows = makeSeason(TEAMS, () => [1, 1]).concat(makeSeason(TEAMS, () => [1, 1]));
  const parsed = rows.map(r => ({ _rod: Number(r[CONFIG.DATE_COL]), season: -1, round: 0 }));
  const seasons = detectSeasons(parsed);
  assert.strictEqual(seasons.length, 2, `detectou ${seasons.length}`);
  assert.strictEqual(seasons[0].seasonIndex, 0);
  assert.strictEqual(seasons[1].seasonIndex, 1);
});

test("assignSeasonAndRound: atribui índices corretos", () => {
  const rows = makeSeason(TEAMS, () => [1, 1]).concat(makeSeason(TEAMS, () => [1, 1]));
  const parsed = rows.map(r => ({ _rod: Number(r[CONFIG.DATE_COL]), season: -1, round: 0 }));
  const seasons = detectSeasons(parsed);
  assignSeasonAndRound(parsed, seasons);
  assert.strictEqual(parsed[0].season, 0);
  assert.strictEqual(parsed[0].round, 1);
  assert.strictEqual(parsed[parsed.length - 1].season, 1);
  assert.ok(parsed.every(p => p.season >= 0), "todo jogo recebeu temporada");
});

test("removeDuplicateBlock: remove trecho longo sem rodada", () => {
  const rows = [];
  for (let i = 0; i < 50; i++) rows.push({ _rod: 1 });
  for (let i = 0; i < 150; i++) rows.push({ _rod: 0 });   // bloco duplicado
  for (let i = 0; i < 50; i++) rows.push({ _rod: 2 });
  const removed = removeDuplicateBlock(rows);
  assert.strictEqual(removed, 150);
  assert.strictEqual(rows.length, 100);
  assert.ok(rows.every(r => r._rod > 0));
});

test("removeDuplicateBlock: não remove lacunas curtas", () => {
  const rows = [];
  for (let i = 0; i < 50; i++) rows.push({ _rod: 1 });
  for (let i = 0; i < 5; i++) rows.push({ _rod: 0 });
  const removed = removeDuplicateBlock(rows);
  assert.strictEqual(removed, 0);
  assert.strictEqual(rows.length, 55);
});

// ═══════════════════════════════ MLE ═══════════════════════════════════════
test("fitDixonColes: recupera a ordem de força", () => {
  // "forte" marca muito e sofre pouco; "fraco" o oposto.
  const games = [];
  for (let i = 0; i < 120; i++) {
    games.push({ home: "forte", away: "fraco", hg: 3, ag: 0, wPoi: 1 });
    games.push({ home: "fraco", away: "forte", hg: 0, ag: 3, wPoi: 1 });
    games.push({ home: "medio", away: "fraco", hg: 2, ag: 1, wPoi: 1 });
    games.push({ home: "forte", away: "medio", hg: 2, ag: 1, wPoi: 1 });
  }
  const dc = fitDixonColes(games, 1.75, 1.25);

  assert.ok(dc.atk.get("forte") > dc.atk.get("medio"), "ataque forte > médio");
  assert.ok(dc.atk.get("medio") > dc.atk.get("fraco"), "ataque médio > fraco");
  assert.ok(dc.def.get("forte") < dc.def.get("fraco"), "defesa forte melhor que fraca");
  assert.ok(Number.isFinite(dc.homeAdv) && dc.homeAdv > 0);
  assert.ok(Number.isFinite(dc.base) && dc.base > 0);
});

test("fitDixonColes: respeita a identificabilidade (média geométrica ≈ 1)", () => {
  const games = [];
  for (let i = 0; i < 60; i++) {
    games.push({ home: "a", away: "b", hg: 2, ag: 1, wPoi: 1 });
    games.push({ home: "b", away: "c", hg: 1, ag: 1, wPoi: 1 });
    games.push({ home: "c", away: "a", hg: 0, ag: 2, wPoi: 1 });
  }
  const dc = fitDixonColes(games, 1.4, 1.1);
  let sumLogA = 0, sumLogB = 0;
  for (const v of dc.atk.values()) sumLogA += Math.log(v);
  for (const v of dc.def.values()) sumLogB += Math.log(v);
  assert.ok(Math.abs(sumLogA) < 0.05, `Σ log α = ${sumLogA}`);
  assert.ok(Math.abs(sumLogB) < 0.05, `Σ log β = ${sumLogB}`);
});

test("fitDixonColes: ρ fica na faixa válida", () => {
  const games = [];
  for (let i = 0; i < 80; i++) {
    games.push({ home: "a", away: "b", hg: i % 3, ag: (i + 1) % 3, wPoi: 1 });
    games.push({ home: "b", away: "a", hg: (i + 2) % 3, ag: i % 2, wPoi: 1 });
  }
  const dc = fitDixonColes(games, 1.4, 1.1);
  assert.ok(dc.rho >= -0.20 && dc.rho <= 0.20, `ρ = ${dc.rho} fora da faixa`);
});

test("fitDixonColes: pesos temporais influenciam o ajuste", () => {
  // mesmos confrontos, mas o resultado recente é o oposto do antigo
  const old = [], recent = [];
  for (let i = 0; i < 60; i++) {
    old.push({ home: "a", away: "b", hg: 0, ag: 3, wPoi: 0.05 });
    recent.push({ home: "a", away: "b", hg: 3, ag: 0, wPoi: 1.0 });
  }
  const dc = fitDixonColes(old.concat(recent), 1.5, 1.5);
  assert.ok(dc.atk.get("a") > dc.atk.get("b"),
    "o resultado recente, com peso maior, deve dominar");
});

// ═══════════════════════════ buildModel ════════════════════════════════════
const balanced = makeSeason(TEAMS, () => [1, 1]);
const model = buildModel(balanced, { trainFromSeason: 0 });

test("buildModel: estrutura de retorno", () => {
  assert.ok(model.dc, "expõe os parâmetros do MLE");
  assert.ok(model.dc.atk instanceof Map);
  assert.ok(model.dc.def instanceof Map);
  assert.ok(model.forces instanceof Map, "visão de compatibilidade para a UI");
  assert.ok(model.elo instanceof Map);
  assert.ok(model.teamNames instanceof Set);
  assert.ok(Number.isFinite(model.homeBase) && model.homeBase > 0);
  assert.ok(Number.isFinite(model.awayBase) && model.awayBase > 0);
  assert.strictEqual(model.teamCount, TEAMS.length);
});

test("buildModel: forces deriva de dc (α e β)", () => {
  for (const t of TEAMS) {
    const f = model.forces.get(t);
    assert.ok(f, `${t} ausente em forces`);
    assert.strictEqual(f.atkH, model.dc.atk.get(t));
    assert.strictEqual(f.atkA, model.dc.atk.get(t));
    assert.strictEqual(f.defH, model.dc.def.get(t));
    assert.strictEqual(f.defA, model.dc.def.get(t));
  }
});

test("buildModel: Elo permanece próximo do inicial em liga equilibrada", () => {
  for (const t of TEAMS) {
    const e = model.elo.get(t);
    assert.ok(Math.abs(e - CONFIG.ELO_INITIAL) < 60,
      `${t} Elo = ${e}, esperado perto de ${CONFIG.ELO_INITIAL}`);
  }
});

test("buildModel: rejeita dataset pequeno", () => {
  assert.throws(() => buildModel([makeRow(1, "a", "b", 1, 0)]), /insuficiente/i);
});

test("buildModel: trainFromSeason corta temporadas antigas", () => {
  const two = makeSeason(TEAMS, () => [1, 1]).concat(makeSeason(TEAMS, () => [2, 0]));
  const all  = buildModel(two, { trainFromSeason: 0 });
  const last = buildModel(two, { trainFromSeason: 1 });
  assert.ok(last.parsedCount < all.parsedCount, "o corte reduz o número de jogos");
  assert.strictEqual(last.parsedCount, two.length / 2);
});

// ═══════════════════════════ predictMatch ══════════════════════════════════
test("predictMatch: probabilidades somam 1", () => {
  const p = predictMatch("alfa", "bravo", model);
  assert.ok(Math.abs(p.pH + p.pD + p.pA - 1) < 1e-9);
  assert.ok(Number.isFinite(p.lamH) && p.lamH > 0);
  assert.ok(Number.isFinite(p.lamA) && p.lamA > 0);
});

test("predictMatch: sem vantagem de casa nos dados, o modelo fica simétrico", () => {
  // Em `balanced` todo jogo termina 1-1, então mandante e visitante marcam
  // igual: γ ≈ 1 e as probabilidades de vitória devem coincidir.
  assert.ok(Math.abs(model.dc.homeAdv - 1) < 1e-6, `γ = ${model.dc.homeAdv}`);
  const p = predictMatch("alfa", "bravo", model);
  assert.ok(Math.abs(p.pH - p.pA) < 1e-9, `pH=${p.pH} vs pA=${p.pA}`);
});

test("predictMatch: vantagem de casa presente nos dados favorece o mandante", () => {
  // Mandante marca 2, visitante marca 1, em todos os jogos.
  const rows = makeSeason(TEAMS, () => [2, 1]);
  const m = buildModel(rows, { trainFromSeason: 0 });
  assert.ok(m.dc.homeAdv > 1.5, `γ = ${m.dc.homeAdv}, esperado ≈ 2`);

  const p = predictMatch("alfa", "bravo", m);
  assert.ok(p.pH > p.pA, `pH=${p.pH} deveria superar pA=${p.pA}`);
  assert.ok(p.lamH > p.lamA, `λH=${p.lamH} deveria superar λA=${p.lamA}`);
});

test("predictMatch: time mais forte é favorito", () => {
  // "alfa" vence todo mundo por 3-0; "juliett" perde de todo mundo.
  const rows = makeSeason(TEAMS, (h, a) => {
    if (h === "alfa") return [3, 0];
    if (a === "alfa") return [0, 3];
    if (h === "juliett") return [0, 2];
    if (a === "juliett") return [2, 0];
    return [1, 1];
  });
  const m = buildModel(rows, { trainFromSeason: 0 });

  const forte = predictMatch("alfa", "juliett", m);
  assert.ok(forte.pH > 0.7, `alfa em casa deveria ser forte favorito, pH=${forte.pH}`);

  const fora = predictMatch("juliett", "alfa", m);
  assert.ok(fora.pA > fora.pH, "alfa deveria ser favorito mesmo fora de casa");

  assert.ok(m.dc.atk.get("alfa") > m.dc.atk.get("juliett"));
  assert.ok(m.dc.def.get("alfa") < m.dc.def.get("juliett"));
});

test("predictMatch: time desconhecido gera aviso e não quebra", () => {
  const p = predictMatch("time inexistente xyz", "alfa", model);
  assert.strictEqual(p.warnings.length, 1);
  assert.ok(Math.abs(p.pH + p.pD + p.pA - 1) < 1e-9);
  assert.ok(Number.isFinite(p.lamH));
});

test("predictMatch: scoreAdj é uma distribuição completa", () => {
  const p = predictMatch("alfa", "bravo", model);
  const cells = (CONFIG.POISSON_MAX_GOALS + 1) ** 2;
  assert.strictEqual(p.scoreAdj.size, cells);
  let s = 0;
  for (const v of p.scoreAdj.values()) s += v;
  assert.ok(Math.abs(s - 1) < 1e-9, `soma de scoreAdj = ${s}`);
});

test("predictMatch: pick coincide com a maior probabilidade", () => {
  const p = predictMatch("alfa", "bravo", model);
  const max = Math.max(p.pH, p.pD, p.pA);
  const expected = max === p.pH ? "Mandante" : max === p.pA ? "Visitante" : "Empate";
  assert.strictEqual(p.pick, expected);
});

test("predictMatch: odds são consistentes com as probabilidades", () => {
  const p = predictMatch("alfa", "bravo", model);
  const implied = 1 / p.oh + 1 / p.od + 1 / p.oa;
  assert.ok(Math.abs(implied - (1 + CONFIG.OVERROUND)) < 1e-9);
});

// ═══════════════════════════ createScorer ══════════════════════════════════
test("createScorer: previsão perfeita zera as métricas", () => {
  const s = createScorer();
  s.add({ pH: 1, pD: 0, pA: 0 }, "H");
  s.add({ pH: 0, pD: 0, pA: 1 }, "A");
  const r = s.result();
  assert.ok(r.logLoss < 1e-9, `logLoss = ${r.logLoss}`);
  assert.ok(r.brier < 1e-9);
  assert.ok(r.rps < 1e-9);
  assert.strictEqual(r.accuracy, 1);
  assert.strictEqual(r.n, 2);
});

test("createScorer: log-loss do palpite uniforme = ln 3", () => {
  const s = createScorer();
  for (const out of ["H", "D", "A"]) s.add({ pH: 1 / 3, pD: 1 / 3, pA: 1 / 3 }, out);
  assert.ok(Math.abs(s.result().logLoss - Math.log(3)) < 1e-12);
});

test("createScorer: RPS pune menos o erro adjacente", () => {
  // Prever mandante quando deu empate erra "por pouco";
  // prever mandante quando deu visitante erra por completo.
  const perto = createScorer();
  perto.add({ pH: 0.7, pD: 0.2, pA: 0.1 }, "D");
  const longe = createScorer();
  longe.add({ pH: 0.7, pD: 0.2, pA: 0.1 }, "A");
  assert.ok(perto.result().rps < longe.result().rps,
    "erro adjacente deve ter RPS menor que erro extremo");
});

// ═══════════════ guarda de regressão: features removidas ═══════════════════
test("CONFIG: fator de forma e de descanso continuam removidos", () => {
  // Medidos no backtest walk-forward: ambos pioravam o log-loss.
  // Se voltarem, tests/backtest.test.js deve justificar.
  for (const key of ["FORM_MATCHES", "FORM_FACTOR_MIN", "FORM_FACTOR_MAX",
                     "HALF_LIFE_FORM_ROUNDS", "MIN_W_FORM",
                     "REST_COEF", "REST_FACTOR_MIN", "REST_FACTOR_MAX",
                     "REST_ROUNDS_BASELINE"]) {
    assert.ok(!(key in CONFIG), `CONFIG.${key} voltou a existir`);
  }
});

test("modelo não expõe mais form nem homeAdv por time", () => {
  assert.strictEqual(model.form, undefined, "model.form deveria ter sido removido");
  assert.strictEqual(model.homeAdv, undefined, "model.homeAdv deveria ter sido removido");
});

test("predictMatch não expõe mais fatores de descanso", () => {
  const p = predictMatch("alfa", "bravo", model);
  assert.strictEqual(p.restFactorH, undefined);
  assert.strictEqual(p.restGapH, undefined);
});

// ═══════════════════════════════ resumo ════════════════════════════════════
if (failures.length) {
  console.error(`model.test.js: ${failures.length} falha(s), ${passed} ok\n`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`model.test.js: all checks passed (${passed} testes)`);
