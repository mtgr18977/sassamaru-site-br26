const assert = require("assert");
const { CONFIG, buildModel, predictMatch } = require("../model.js");

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

console.log("model.test.js: all checks passed");
