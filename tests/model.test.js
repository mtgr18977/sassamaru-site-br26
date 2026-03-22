const assert = require("assert");
const { CONFIG, buildModel, predictMatch } = require("../modelos/model.js");

function makeRow(date, home, away, hg, ag) {
  return {
    [CONFIG.DATE_COL]: date,
    [CONFIG.HOME_TEAM_COL]: home,
    [CONFIG.AWAY_TEAM_COL]: away,
    [CONFIG.HOME_GOALS_COL]: hg,
    [CONFIG.AWAY_GOALS_COL]: ag,
  };
}

function isoDay(offset) {
  const d = new Date(Date.UTC(2024, 0, 1 + offset));
  return d.toISOString().slice(0, 10);
}

const rows = [];
for (let i = 0; i < 55; i += 1) {
  rows.push(makeRow(isoDay(i), "time a", "time b", 1, 1));
}
for (let i = 55; i < 60; i += 1) {
  rows.push(makeRow(isoDay(i), "time a", "time b", 0, 3));
}

const model = buildModel(rows);
assert.ok(model.form.has("time a"));
assert.ok(model.form.has("time b"));

const prediction = predictMatch("time a", "time b", model);
const probSum = prediction.pH + prediction.pD + prediction.pA;

assert.ok(Number.isFinite(prediction.lamH));
assert.ok(Number.isFinite(prediction.lamA));
assert.ok(Math.abs(probSum - 1) < 1e-6);
assert.ok(
  prediction.pA > prediction.pH,
  "Away team with strong recent form should not be underdog."
);

// ── homeAdv: boost applied when above threshold ──────────────────────────────
// "forte" scores 3 at home and 0 away; "medio" is a neutral reference.
// Both sides of the fixture need ≥ 10 weighted games for homeAdv to be set.
const rows2 = [];
for (let i = 0; i < 40; i++) rows2.push(makeRow(isoDay(i),      "forte", "medio", 3, 0));
for (let i = 40; i < 80; i++) rows2.push(makeRow(isoDay(i + 80), "medio", "forte", 1, 0));
const model2 = buildModel(rows2);

assert.ok(
  model2.homeAdv.has("forte"),
  "forte should have a homeAdv entry (well above 10 weighted games)"
);
assert.ok(
  model2.homeAdv.get("forte") > 1.0,
  "forte homeAdv should exceed 1.0 given dominant home scoring"
);

const pred2WithAdv    = predictMatch("forte", "medio", model2);
const pred2WithoutAdv = predictMatch("forte", "medio", { ...model2, homeAdv: new Map() });
assert.ok(
  pred2WithAdv.lamH > pred2WithoutAdv.lamH,
  "lamH for forte should be boosted by homeAdv factor"
);

// ── homeAdv: fallback to 1.0 when below threshold ────────────────────────────
// "novo" plays only 4 home games → homeW < 10 → should NOT appear in homeAdv.
const rows3 = [];
for (let i = 0; i < 50; i++) rows3.push(makeRow(isoDay(i), "alpha", "beta", 1, 1));
for (let i = 50; i < 54; i++) rows3.push(makeRow(isoDay(i), "novo",  "alpha", 2, 0));
const model3 = buildModel(rows3);

assert.ok(
  !model3.homeAdv.has("novo"),
  "novo should NOT have a homeAdv entry (below 10 weighted home games)"
);
const pred3WithAdv    = predictMatch("novo", "alpha", model3);
const pred3WithoutAdv = predictMatch("novo", "alpha", { ...model3, homeAdv: new Map() });
assert.strictEqual(
  pred3WithAdv.lamH,
  pred3WithoutAdv.lamH,
  "lamH for novo should be identical with or without homeAdv map (fallback to 1.0)"
);

console.log("model.test.js: all checks passed");
