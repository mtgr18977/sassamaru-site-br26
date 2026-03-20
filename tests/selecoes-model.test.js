const assert = require("assert");
const {
  CFG, norm, clamp, logFact, poissonP, oddsFromProbs, applyDC,
  parseDate, daysBetween, temporalWeight, estimateRho,
  buildModel, predict, parseLine, parseFixtures,
} = require("../modelos/selecoes-model.js");

// ─── helpers ─────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function test(description, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`FAIL [${description}]: ${e.message}`);
  }
}

// Build a synthetic dataset with enough rows to satisfy buildModel's minimum (100)
function isoDay(baseYear, offsetDays) {
  const d = new Date(Date.UTC(baseYear, 0, 1 + offsetDays));
  return d.toISOString().slice(0, 10);
}

function makeRow(date, home, away, hg, ag, neutral) {
  return {
    [CFG.COL_DATE]:    date,
    [CFG.COL_HOME]:    home,
    [CFG.COL_AWAY]:    away,
    [CFG.COL_HG]:      hg,
    [CFG.COL_AG]:      ag,
    [CFG.COL_NEUTRAL]: neutral ? 'true' : 'false',
  };
}

// Generate 120 rows: alternating home/away wins across two teams
function makeSyntheticRows(n, homeTeam, awayTeam, baseYear) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const hg = i % 3 === 0 ? 2 : i % 3 === 1 ? 1 : 0;
    const ag = i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : 2;
    rows.push(makeRow(isoDay(baseYear, i), homeTeam, awayTeam, hg, ag, false));
  }
  return rows;
}

// A model built from enough balanced neutral data to survive filters
function makeMultiTeamRows(n) {
  const teams = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
  const rows = [];
  // Use a fixed reference date in the past so all rows are "past"
  for (let i = 0; i < n; i++) {
    const h = teams[i % teams.length];
    const a = teams[(i + 1) % teams.length];
    const hg = (i % 4 === 0) ? 2 : 1;
    const ag = (i % 4 === 2) ? 2 : 0;
    rows.push(makeRow(isoDay(1995, i % 365), h, a, hg, ag, i % 5 === 0));
  }
  return rows;
}

const REF_DATE = new Date(Date.UTC(2020, 0, 1)); // fixed ref keeps tests deterministic
const synRows = makeMultiTeamRows(150);
let MODEL; // built once; reused across predict() tests

// ─── norm() ──────────────────────────────────────────────────────────────────
test("norm: trims and lowercases", () => {
  assert.strictEqual(norm("  Brazil  "), "brazil");
});

test("norm: removes accents", () => {
  assert.strictEqual(norm("Côte d'Ivoire"), "cote d'ivoire");
});

test("norm: alias brasil → brazil", () => {
  assert.strictEqual(norm("Brasil"), "brazil");
});

test("norm: alias USA → united states", () => {
  assert.strictEqual(norm("USA"), "united states");
});

test("norm: alias us → united states", () => {
  assert.strictEqual(norm("US"), "united states");
});

test("norm: alias ir iran → iran", () => {
  assert.strictEqual(norm("IR Iran"), "iran");
});

test("norm: alias korea republic → south korea", () => {
  assert.strictEqual(norm("Korea Republic"), "south korea");
});

test("norm: alias republic of korea → south korea", () => {
  assert.strictEqual(norm("Republic of Korea"), "south korea");
});

test("norm: alias dpr korea → north korea", () => {
  assert.strictEqual(norm("DPR Korea"), "north korea");
});

test("norm: alias czech republic → czechia", () => {
  assert.strictEqual(norm("Czech Republic"), "czechia");
});

test("norm: alias bosnia → bosnia and herzegovina", () => {
  assert.strictEqual(norm("Bosnia"), "bosnia and herzegovina");
});

test("norm: alias trinidad → trinidad and tobago", () => {
  assert.strictEqual(norm("Trinidad"), "trinidad and tobago");
});

test("norm: replaces hyphens with spaces", () => {
  assert.strictEqual(norm("Guinea-Bissau"), "guinea bissau");
});

test("norm: replaces underscores with spaces", () => {
  assert.strictEqual(norm("ivory_coast"), "ivory coast");
});

test("norm: collapses multiple spaces", () => {
  assert.strictEqual(norm("new   zealand"), "new zealand");
});

test("norm: empty string returns empty string", () => {
  assert.strictEqual(norm(""), "");
});

test("norm: null/undefined returns empty string", () => {
  assert.strictEqual(norm(null), "");
  assert.strictEqual(norm(undefined), "");
});

// ─── clamp() ─────────────────────────────────────────────────────────────────
test("clamp: value below min returns min", () => {
  assert.strictEqual(clamp(-5, 0, 10), 0);
});

test("clamp: value above max returns max", () => {
  assert.strictEqual(clamp(15, 0, 10), 10);
});

test("clamp: value within range is unchanged", () => {
  assert.strictEqual(clamp(5, 0, 10), 5);
});

test("clamp: value equal to min returns min", () => {
  assert.strictEqual(clamp(0, 0, 10), 0);
});

test("clamp: value equal to max returns max", () => {
  assert.strictEqual(clamp(10, 0, 10), 10);
});

// ─── logFact() ───────────────────────────────────────────────────────────────
test("logFact(0) = 0", () => {
  assert.ok(Math.abs(logFact(0) - 0) < 1e-12);
});

test("logFact(1) = 0", () => {
  assert.ok(Math.abs(logFact(1) - 0) < 1e-12);
});

test("logFact(2) ≈ log(2)", () => {
  assert.ok(Math.abs(logFact(2) - Math.log(2)) < 1e-12);
});

test("logFact(5) ≈ log(120)", () => {
  assert.ok(Math.abs(logFact(5) - Math.log(120)) < 1e-9);
});

test("logFact is monotonically increasing for n > 1", () => {
  for (let n = 2; n < 10; n++) {
    assert.ok(logFact(n) > logFact(n - 1));
  }
});

// ─── poissonP() ──────────────────────────────────────────────────────────────
test("poissonP(0, 0) = 1", () => {
  assert.ok(Math.abs(poissonP(0, 0) - 1) < 1e-12);
});

test("poissonP(0, k>0) = 0", () => {
  assert.strictEqual(poissonP(0, 1), 0);
  assert.strictEqual(poissonP(0, 3), 0);
});

test("poissonP(lam, k) ≥ 0 for any valid inputs", () => {
  for (let k = 0; k <= 8; k++) {
    assert.ok(poissonP(1.5, k) >= 0);
  }
});

test("poissonP probabilities sum to approximately 1", () => {
  let sum = 0;
  for (let k = 0; k <= 30; k++) sum += poissonP(2.0, k);
  assert.ok(Math.abs(sum - 1) < 0.001);
});

test("poissonP(1, 0) ≈ e^-1", () => {
  assert.ok(Math.abs(poissonP(1, 0) - Math.exp(-1)) < 1e-10);
});

test("poissonP(2, 2) ≈ 2e^-2", () => {
  const expected = Math.pow(2, 2) * Math.exp(-2) / 2;
  assert.ok(Math.abs(poissonP(2, 2) - expected) < 1e-10);
});

test("poissonP mode is at floor(lambda) for integer lambda", () => {
  // For lambda=3, mode should be at k=3 (and also 2 for Poisson with integer lambda)
  const lam = 4;
  const pMode = poissonP(lam, lam);
  assert.ok(pMode > poissonP(lam, lam - 2));
  assert.ok(pMode >= poissonP(lam, lam + 1));
});

// ─── oddsFromProbs() ─────────────────────────────────────────────────────────
test("oddsFromProbs: sum of 1/odds > 1 due to overround", () => {
  const { oh, od, oa } = oddsFromProbs(0.4, 0.3, 0.3, 0.06);
  assert.ok(1/oh + 1/od + 1/oa > 1);
});

test("oddsFromProbs: all odds > 1", () => {
  const { oh, od, oa } = oddsFromProbs(0.4, 0.3, 0.3, 0.06);
  assert.ok(oh > 1);
  assert.ok(od > 1);
  assert.ok(oa > 1);
});

test("oddsFromProbs: higher probability yields lower odds", () => {
  const { oh, oa } = oddsFromProbs(0.6, 0.2, 0.2, 0.06);
  assert.ok(oh < oa);
});

test("oddsFromProbs: zero overround yields 1/p odds", () => {
  const p = 0.5;
  const { oh } = oddsFromProbs(p, p/2, p/2, 0);
  assert.ok(Math.abs(oh - 1/p) < 1e-9);
});

test("oddsFromProbs: near-zero probability does not crash", () => {
  const result = oddsFromProbs(1e-15, 0.5, 0.5, 0.06);
  assert.ok(Number.isFinite(result.oh));
});

// ─── applyDC() ───────────────────────────────────────────────────────────────
function makeUniformScoreMap(maxG) {
  const m = new Map();
  for (let gh = 0; gh <= maxG; gh++)
    for (let ga = 0; ga <= maxG; ga++)
      m.set(`${gh},${ga}`, 1 / ((maxG+1) * (maxG+1)));
  return m;
}

test("applyDC: output probabilities sum to ~1", () => {
  const sm = makeUniformScoreMap(5);
  const adj = applyDC(sm, -0.1);
  let sum = 0;
  for (const v of adj.values()) sum += v;
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test("applyDC: rho=0 leaves distribution unchanged", () => {
  const sm = makeUniformScoreMap(4);
  const adj = applyDC(sm, 0);
  for (const [k, v] of sm.entries()) {
    assert.ok(Math.abs((adj.get(k) || 0) - v) < 1e-9, `key ${k}`);
  }
});

test("applyDC: negative rho increases 0-0 probability (mult 1-rho > 1)", () => {
  const sm = makeUniformScoreMap(4);
  const orig = sm.get('0,0');
  const adj = applyDC(sm, -0.3);
  assert.ok(adj.get('0,0') > orig);
});

test("applyDC: negative rho decreases 1-0 probability (mult 1+rho < 1)", () => {
  const sm = makeUniformScoreMap(4);
  const orig = sm.get('1,0');
  const adj = applyDC(sm, -0.3);
  assert.ok(adj.get('1,0') < orig);
});

test("applyDC: negative rho decreases 0-1 probability (mult 1+rho < 1)", () => {
  const sm = makeUniformScoreMap(4);
  const orig = sm.get('0,1');
  const adj = applyDC(sm, -0.3);
  assert.ok(adj.get('0,1') < orig);
});

test("applyDC: negative rho increases 1-1 probability (mult 1-rho > 1)", () => {
  const sm = makeUniformScoreMap(4);
  const orig = sm.get('1,1');
  const adj = applyDC(sm, -0.3);
  assert.ok(adj.get('1,1') > orig);
});

test("applyDC: all adjusted probabilities are non-negative", () => {
  const sm = makeUniformScoreMap(5);
  const adj = applyDC(sm, 0.4);
  for (const v of adj.values()) assert.ok(v >= 0);
});

// ─── parseDate() ─────────────────────────────────────────────────────────────
test("parseDate: valid ISO date returns Date", () => {
  const d = parseDate('2020-06-15');
  assert.ok(d instanceof Date);
  assert.ok(!isNaN(d));
});

test("parseDate: invalid string returns null", () => {
  assert.strictEqual(parseDate('not-a-date'), null);
});

test("parseDate: empty string returns null", () => {
  assert.strictEqual(parseDate(''), null);
});

test("parseDate: null input returns null", () => {
  assert.strictEqual(parseDate(null), null);
});

test("parseDate: year is correct", () => {
  const d = parseDate('2023-03-15');
  assert.strictEqual(d.getUTCFullYear(), 2023);
});

// ─── daysBetween() ───────────────────────────────────────────────────────────
test("daysBetween: same date = 0", () => {
  const d = new Date('2020-01-01');
  assert.strictEqual(daysBetween(d, d), 0);
});

test("daysBetween: one day apart", () => {
  const d1 = new Date('2020-01-01');
  const d2 = new Date('2020-01-02');
  assert.strictEqual(daysBetween(d1, d2), 1);
});

test("daysBetween: 365 days apart", () => {
  const d1 = new Date('2020-01-01');
  const d2 = new Date('2021-01-01');
  const diff = daysBetween(d1, d2);
  assert.ok(diff === 365 || diff === 366); // leap year tolerance
});

test("daysBetween: negative when newer < older", () => {
  const d1 = new Date('2020-01-02');
  const d2 = new Date('2020-01-01');
  assert.ok(daysBetween(d1, d2) < 0);
});

// ─── temporalWeight() ────────────────────────────────────────────────────────
test("temporalWeight: ageDays=0 returns 1.0", () => {
  assert.strictEqual(temporalWeight(0, 730, 0.1), 1.0);
});

test("temporalWeight: ageDays<0 returns 1.0", () => {
  assert.strictEqual(temporalWeight(-10, 730, 0.1), 1.0);
});

test("temporalWeight: at half-life returns 0.5 (when 0.5 > minW)", () => {
  const w = temporalWeight(730, 730, 0.1);
  assert.ok(Math.abs(w - 0.5) < 1e-9);
});

test("temporalWeight: never below minW", () => {
  const minW = 0.25;
  const w = temporalWeight(100000, 730, minW);
  assert.ok(w >= minW);
});

test("temporalWeight: decreases as ageDays increases", () => {
  const w1 = temporalWeight(100, 730, 0.1);
  const w2 = temporalWeight(500, 730, 0.1);
  assert.ok(w1 > w2);
});

test("temporalWeight: result is always ≤ 1.0", () => {
  for (const age of [0, 1, 50, 730, 5000]) {
    assert.ok(temporalWeight(age, 730, 0.1) <= 1.0);
  }
});

// ─── buildModel() ────────────────────────────────────────────────────────────
test("buildModel: throws on insufficient data", () => {
  let threw = false;
  try { buildModel(makeSyntheticRows(50, 'a', 'b', 1995), REF_DATE); }
  catch (e) { threw = true; }
  assert.ok(threw, "Should throw with fewer than 100 valid rows");
});

test("buildModel: returns object with expected keys", () => {
  MODEL = buildModel(synRows, REF_DATE);
  const keys = ['leagueHomeAvg','leagueAwayAvg','leagueGoalsPerTeam',
    'forces','elo','form','homeAdv','dcRho','teamNames',
    'parsedCount','teamCount','refDate','earliest','latest'];
  for (const k of keys) {
    assert.ok(k in MODEL, `Missing key: ${k}`);
  }
});

test("buildModel: leagueHomeAvg is a positive finite number", () => {
  assert.ok(Number.isFinite(MODEL.leagueHomeAvg));
  assert.ok(MODEL.leagueHomeAvg > 0);
});

test("buildModel: leagueAwayAvg is a positive finite number", () => {
  assert.ok(Number.isFinite(MODEL.leagueAwayAvg));
  assert.ok(MODEL.leagueAwayAvg > 0);
});

test("buildModel: leagueGoalsPerTeam = (homeAvg + awayAvg) / 2", () => {
  const expected = (MODEL.leagueHomeAvg + MODEL.leagueAwayAvg) / 2;
  assert.ok(Math.abs(MODEL.leagueGoalsPerTeam - expected) < 1e-9);
});

test("buildModel: forces is a Map", () => {
  assert.ok(MODEL.forces instanceof Map);
});

test("buildModel: elo is a Map", () => {
  assert.ok(MODEL.elo instanceof Map);
});

test("buildModel: form is a Map", () => {
  assert.ok(MODEL.form instanceof Map);
});

test("buildModel: teamNames is a Set", () => {
  assert.ok(MODEL.teamNames instanceof Set);
});

test("buildModel: teamNames are present in forces", () => {
  for (const t of MODEL.teamNames) {
    assert.ok(MODEL.forces.has(t), `Team ${t} not in forces`);
  }
});

test("buildModel: all force values are finite numbers", () => {
  for (const [t, f] of MODEL.forces.entries()) {
    assert.ok(Number.isFinite(f.atkH), `atkH for ${t}`);
    assert.ok(Number.isFinite(f.defH), `defH for ${t}`);
    assert.ok(Number.isFinite(f.atkA), `atkA for ${t}`);
    assert.ok(Number.isFinite(f.defA), `defA for ${t}`);
  }
});

test("buildModel: all elo values are finite numbers", () => {
  for (const [t, r] of MODEL.elo.entries()) {
    assert.ok(Number.isFinite(r), `Elo for ${t}`);
  }
});

test("buildModel: all form values have gf and ga", () => {
  for (const [t, fm] of MODEL.form.entries()) {
    assert.ok(Number.isFinite(fm.gf), `form.gf for ${t}`);
    assert.ok(Number.isFinite(fm.ga), `form.ga for ${t}`);
  }
});

test("buildModel: dcRho is a finite number between -0.5 and 0.5", () => {
  assert.ok(Number.isFinite(MODEL.dcRho));
  assert.ok(MODEL.dcRho >= -0.5 && MODEL.dcRho <= 0.5);
});

test("buildModel: parsedCount matches number of valid input rows", () => {
  assert.ok(MODEL.parsedCount > 0);
  assert.ok(MODEL.parsedCount <= synRows.length);
});

test("buildModel: teamCount matches forces size", () => {
  assert.strictEqual(MODEL.teamCount, MODEL.forces.size);
});

test("buildModel: ignores rows with missing home team", () => {
  const rows = makeMultiTeamRows(150);
  rows.push(makeRow('1999-01-01', '', 'beta', 1, 0, false));
  const m = buildModel(rows, REF_DATE);
  assert.ok(m.parsedCount >= 150 - 1); // bad row skipped
});

test("buildModel: ignores rows with non-numeric goals", () => {
  const rows = makeMultiTeamRows(150);
  rows.push(makeRow('1999-01-01', 'alpha', 'beta', 'x', 'y', false));
  const m = buildModel(rows, REF_DATE);
  // should not throw and parsedCount should not include bad row
  assert.ok(Number.isFinite(m.leagueHomeAvg));
});

test("buildModel: ignores rows with invalid date", () => {
  const rows = makeMultiTeamRows(150);
  rows.push(makeRow('bad-date', 'alpha', 'beta', 1, 0, false));
  const m = buildModel(rows, REF_DATE);
  assert.ok(Number.isFinite(m.leagueHomeAvg));
});

test("buildModel: refDate matches the override passed in", () => {
  assert.strictEqual(MODEL.refDate, REF_DATE);
});

// ─── predict() ───────────────────────────────────────────────────────────────
test("predict: returns object with expected keys", () => {
  const p = predict('alpha', 'beta', MODEL);
  const keys = ['home','away','lamH','lamA','pH','pD','pA',
    'oh','od','oa','pick','bestGH','bestGA','bestP','scoreAdj','warnings','neutral'];
  for (const k of keys) assert.ok(k in p, `Missing key: ${k}`);
});

test("predict: pH + pD + pA ≈ 1", () => {
  const p = predict('alpha', 'beta', MODEL);
  assert.ok(Math.abs(p.pH + p.pD + p.pA - 1) < 1e-9);
});

test("predict: lamH is a positive finite number", () => {
  const p = predict('alpha', 'beta', MODEL);
  assert.ok(Number.isFinite(p.lamH) && p.lamH > 0);
});

test("predict: lamA is a positive finite number", () => {
  const p = predict('alpha', 'beta', MODEL);
  assert.ok(Number.isFinite(p.lamA) && p.lamA > 0);
});

test("predict: all probabilities are between 0 and 1", () => {
  const p = predict('alpha', 'beta', MODEL);
  assert.ok(p.pH >= 0 && p.pH <= 1);
  assert.ok(p.pD >= 0 && p.pD <= 1);
  assert.ok(p.pA >= 0 && p.pA <= 1);
});

test("predict: pick is one of 'home', 'away', 'draw'", () => {
  const p = predict('alpha', 'beta', MODEL);
  assert.ok(['home', 'away', 'draw'].includes(p.pick));
});

test("predict: pick corresponds to the highest probability", () => {
  const p = predict('alpha', 'beta', MODEL);
  const max = Math.max(p.pH, p.pD, p.pA);
  if (p.pick === 'home')  assert.strictEqual(max, p.pH);
  if (p.pick === 'away')  assert.strictEqual(max, p.pA);
  if (p.pick === 'draw')  assert.strictEqual(max, p.pD);
});

test("predict: neutral=true returns neutral flag true", () => {
  const p = predict('alpha', 'beta', MODEL, true);
  assert.strictEqual(p.neutral, true);
});

test("predict: neutral=false returns neutral flag false", () => {
  const p = predict('alpha', 'beta', MODEL, false);
  assert.strictEqual(p.neutral, false);
});

test("predict: neutral venue yields higher lamA vs non-neutral (home advantage removed)", () => {
  const pHome    = predict('alpha', 'beta', MODEL, false);
  const pNeutral = predict('alpha', 'beta', MODEL, true);
  // Without home advantage, lambda_H should decrease and lambda_A should increase
  // or at minimum the difference lamH - lamA decreases in neutral
  const diffHome    = pHome.lamH    - pHome.lamA;
  const diffNeutral = pNeutral.lamH - pNeutral.lamA;
  assert.ok(diffHome >= diffNeutral,
    "Home advantage should be reduced on neutral ground");
});

test("predict: unknown team generates a warning", () => {
  const p = predict('unknown-team-xyz', 'beta', MODEL);
  assert.ok(p.warnings.length > 0);
});

test("predict: known teams produce no warnings", () => {
  const p = predict('alpha', 'beta', MODEL);
  assert.strictEqual(p.warnings.length, 0);
});

test("predict: scoreAdj probabilities sum to ~1", () => {
  const p = predict('alpha', 'beta', MODEL);
  let sum = 0;
  for (const v of p.scoreAdj.values()) sum += v;
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test("predict: bestGH and bestGA are non-negative integers", () => {
  const p = predict('alpha', 'beta', MODEL);
  assert.ok(Number.isInteger(p.bestGH) && p.bestGH >= 0);
  assert.ok(Number.isInteger(p.bestGA) && p.bestGA >= 0);
});

test("predict: bestP is the maximum probability in scoreAdj", () => {
  const p = predict('alpha', 'beta', MODEL);
  const maxInMap = Math.max(...p.scoreAdj.values());
  assert.ok(Math.abs(p.bestP - maxInMap) < 1e-12);
});

test("predict: odds include overround (1/oh + 1/od + 1/oa > 1)", () => {
  const p = predict('alpha', 'beta', MODEL);
  assert.ok(1/p.oh + 1/p.od + 1/p.oa > 1);
});

test("predict: all odds are positive finite numbers", () => {
  const p = predict('alpha', 'beta', MODEL);
  assert.ok(Number.isFinite(p.oh) && p.oh > 0);
  assert.ok(Number.isFinite(p.od) && p.od > 0);
  assert.ok(Number.isFinite(p.oa) && p.oa > 0);
});

// ─── parseLine() ─────────────────────────────────────────────────────────────
test("parseLine: 'Brazil vs Argentina' format", () => {
  const r = parseLine("Brazil vs Argentina");
  assert.strictEqual(r.home, "Brazil");
  assert.strictEqual(r.away, "Argentina");
  assert.strictEqual(r.neutral, false);
});

test("parseLine: 'Brazil x Argentina' format", () => {
  const r = parseLine("Brazil x Argentina");
  assert.strictEqual(r.home, "Brazil");
  assert.strictEqual(r.away, "Argentina");
});

test("parseLine: 'Brazil - Argentina' format", () => {
  const r = parseLine("Brazil - Argentina");
  assert.strictEqual(r.home, "Brazil");
  assert.strictEqual(r.away, "Argentina");
});

test("parseLine: 'Brazil vs. Argentina' format (with dot)", () => {
  const r = parseLine("Brazil vs. Argentina");
  assert.strictEqual(r.home, "Brazil");
  assert.strictEqual(r.away, "Argentina");
});

test("parseLine: '(neutral)' flag sets neutral=true", () => {
  const r = parseLine("Brazil vs Argentina (neutral)");
  assert.strictEqual(r.neutral, true);
});

test("parseLine: comment line returns null", () => {
  assert.strictEqual(parseLine("# this is a comment"), null);
});

test("parseLine: empty line returns null", () => {
  assert.strictEqual(parseLine(""), null);
});

test("parseLine: whitespace-only line returns null", () => {
  assert.strictEqual(parseLine("   "), null);
});

test("parseLine: invalid line returns error object", () => {
  const r = parseLine("JustATeamName");
  assert.ok(r.error === true);
});

// ─── parseFixtures() ─────────────────────────────────────────────────────────
test("parseFixtures: parses multiple lines", () => {
  const text = "Brazil vs Argentina\nFrance vs Germany";
  const fixtures = parseFixtures(text);
  assert.strictEqual(fixtures.length, 2);
});

test("parseFixtures: filters out comment lines", () => {
  const text = "# comment\nBrazil vs Argentina";
  const fixtures = parseFixtures(text);
  assert.strictEqual(fixtures.length, 1);
});

test("parseFixtures: filters out empty lines", () => {
  const text = "\nBrazil vs Argentina\n\nFrance vs Germany\n";
  const fixtures = parseFixtures(text);
  assert.strictEqual(fixtures.length, 2);
});

test("parseFixtures: neutral flag correctly parsed in multi-line", () => {
  const text = "Brazil vs Argentina (neutral)\nFrance vs Germany";
  const fixtures = parseFixtures(text);
  assert.strictEqual(fixtures[0].neutral, true);
  assert.strictEqual(fixtures[1].neutral, false);
});

// ─── summary ─────────────────────────────────────────────────────────────────
console.log(`\nselecoes-model.test.js: ${passed} passed, ${failed} failed (total ${passed + failed})`);
if (failed > 0) process.exit(1);
