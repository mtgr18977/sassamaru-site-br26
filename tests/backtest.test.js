// ═══════════════════════════════════════════════════════════════════════════
//  Backtest walk-forward — trava de regressão de acurácia
//
//  Roda o modelo de verdade contra o dataset de verdade, rodada a rodada,
//  treinando só com jogos anteriores. Falha se o log-loss piorar do limiar.
//
//  Contexto: antes desta trava existir, o modelo em produção tinha log-loss
//  1.0975 — pior do que chutar a taxa-base fixa 47/27/26 (1.0577). Nada no
//  repositório media isso, então a regressão passou despercebida.
//
//  npm run test:backtest
// ═══════════════════════════════════════════════════════════════════════════
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { runBacktest, CONFIG } = require("../modelos/model.js");

// Limiar de regressão. O modelo atual fica em ~1.023; a folga cobre variação
// de dados quando novas rodadas entram no CSV.
const MAX_LOG_LOSS = 1.035;
const TEST_SEASONS = 3;
const REFIT_EVERY = 4;

const CSV_PATH = path.join(__dirname, "..", "datasets", "campeonato-brasileiro-limpo.csv");

function parseCsv(text) {
  const lines = text.split("\n");
  const header = lines[0].split(",").map(s => s.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = lines[i].split(",");
    const row = {};
    header.forEach((h, j) => { row[h] = cells[j]; });
    rows.push(row);
  }
  return rows;
}

function fmt(n, d = 4) {
  return Number.isFinite(n) ? n.toFixed(d) : "—";
}

(async () => {
  assert.ok(fs.existsSync(CSV_PATH), `dataset não encontrado: ${CSV_PATH}`);
  const rows = parseCsv(fs.readFileSync(CSV_PATH, "utf8"));
  assert.ok(rows.length > 1000, `dataset pequeno demais: ${rows.length} linhas`);

  console.log(`backtest: ${rows.length} linhas, ${TEST_SEASONS} temporadas de teste, ` +
              `refit a cada ${REFIT_EVERY} rodadas`);
  console.log(`config: HALF_LIFE_POISSON_ROUNDS=${CONFIG.HALF_LIFE_POISSON_ROUNDS} ` +
              `MIN_W_POI=${CONFIG.MIN_W_POI} TRAIN_FROM_SEASON=${CONFIG.TRAIN_FROM_SEASON}\n`);

  const started = Date.now();
  const res = await runBacktest(rows, null, {
    refitEvery: REFIT_EVERY,
    seasons: TEST_SEASONS,
    yield: false,
  });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  // ── Por temporada ──
  console.log("temporada     n   log-loss     RPS   Brier   acurácia");
  for (const s of res.seasonResults) {
    console.log(
      `${String(s.year).padEnd(9)} ${String(s.n).padStart(4)}   ` +
      `${fmt(s.logLoss)}  ${fmt(s.rps)}  ${fmt(s.brier)}   ${(100 * s.accuracy).toFixed(1)}%`
    );
  }

  const o = res.overall;
  const b = res.baseline;
  console.log("");
  console.log(`modelo         ${String(o.n).padStart(4)}   ${fmt(o.logLoss)}  ${fmt(o.rps)}  ${fmt(o.brier)}   ${(100 * o.accuracy).toFixed(1)}%`);
  console.log(`taxa-base fixa ${String(b.n).padStart(4)}   ${fmt(b.logLoss)}  ${fmt(b.rps)}  ${fmt(b.brier)}   ${(100 * b.accuracy).toFixed(1)}%`);
  console.log(`ganho                  ${fmt(b.logLoss - o.logLoss)}  ${fmt(b.rps - o.rps)}`);

  // ── Calibração ──
  console.log("\ncalibração (todos os desfechos 1X2)");
  console.log("  faixa      n   previsto   observado");
  res.calBins.forEach((bin, i) => {
    if (!bin.n) return;
    console.log(
      `  ${(i / 10).toFixed(1)}-${((i + 1) / 10).toFixed(1)} ${String(bin.n).padStart(5)}      ` +
      `${(bin.predSum / bin.n).toFixed(3)}       ${(bin.actualSum / bin.n).toFixed(3)}`
    );
  });
  console.log(`\n(${elapsed}s)\n`);

  // ── Asserções ──
  assert.ok(
    res.seasonResults.length === TEST_SEASONS,
    `esperava ${TEST_SEASONS} temporadas testadas, veio ${res.seasonResults.length}`
  );
  assert.ok(o.n > 800, `poucas partidas avaliadas: ${o.n}`);

  assert.ok(
    o.logLoss < MAX_LOG_LOSS,
    `REGRESSÃO: log-loss ${fmt(o.logLoss)} acima do limiar ${MAX_LOG_LOSS}`
  );

  assert.ok(
    o.logLoss < b.logLoss,
    `REGRESSÃO: modelo (${fmt(o.logLoss)}) não vence a taxa-base fixa (${fmt(b.logLoss)})`
  );

  assert.ok(
    o.rps < b.rps,
    `REGRESSÃO: RPS do modelo (${fmt(o.rps)}) não vence a taxa-base fixa (${fmt(b.rps)})`
  );

  // Probabilidades bem formadas
  for (const s of res.seasonResults) {
    assert.ok(Number.isFinite(s.logLoss) && s.logLoss > 0, "log-loss inválido");
    assert.ok(s.rps >= 0 && s.rps <= 1, "RPS fora de [0,1]");
    assert.ok(s.accuracy >= 0 && s.accuracy <= 1, "acurácia fora de [0,1]");
  }

  console.log("backtest.test.js: all checks passed");
})().catch(err => {
  console.error("\nbacktest.test.js FALHOU:\n" + err.message);
  process.exit(1);
});
