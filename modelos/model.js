/* eslint-disable no-var */
// ═══════════════════════════════════════════════════════════════════════════
//  Modelo do Brasileirão — Dixon-Coles / Poisson + Elo
//
//  Fonte única. Carregado por:
//    - apps/index.html                     (<script src="../modelos/model.js">)
//    - simulacoes/bench-brasileirao2026.html
//    - tests/*.test.js                     (via require)
//
//  Pipeline:
//    1. Parse CSV → normaliza nomes → detecta temporadas pelo número da rodada
//    2. Peso temporal exponencial (meia-vida em rodadas)
//    3. MLE conjunto (Adam + gradientes analíticos) para ataque α, defesa β,
//       vantagem de casa γ, taxa-base μ e correlação Dixon-Coles ρ
//    4. Elo com reset parcial por temporada → pequeno ajuste no λ
//    5. Grade de placares Poisson + correção τ de Dixon-Coles → probabilidades 1X2
//
//  NÃO existe fator de forma nem fator de descanso: ambos foram medidos no
//  backtest walk-forward e pioravam o log-loss. Ver tests/backtest.test.js.
// ═══════════════════════════════════════════════════════════════════════════
(() => {
  const CONFIG = {
    CSV_PATH: "../datasets/campeonato-brasileiro-limpo.csv",

    // ── Column mapping ──
    DATE_COL:       "rodata",          // round number (float), NOT a date
    HOME_TEAM_COL:  "mandante",
    AWAY_TEAM_COL:  "visitante",
    HOME_GOALS_COL: "mandante_Placar",
    AWAY_GOALS_COL: "visitante_Placar",

    // ── Temporal weights (expressed in ROUNDS, not days) ──
    HALF_LIFE_ELO_ROUNDS:     76,      // ~2 temporadas de 38 rodadas
    HALF_LIFE_POISSON_ROUNDS: 152,     // ~4 temporadas

    // ── Minimum weights ──
    // O piso não é cosmético: ele mantém o histórico antigo com um peso
    // residual e funciona como regularização. Removê-lo piora o log-loss.
    MIN_W_ELO:  0.15,
    MIN_W_POI:  0.30,

    // ── Elo settings ──
    ELO_INITIAL:        1500,
    ELO_K_BASE:         30,
    SEASON_RESET_ALPHA: 0.20,
    ELO_GAMMA:          0.08,
    ELO_LAMBDA_CLAMP:   0.18,

    // ── Poisson / Dixon–Coles ──
    POISSON_MAX_GOALS: 8,
    DC_RHO:            -0.05,   // apenas semente do otimizador; ρ é estimado

    // ── MLE (Adam) ──
    MLE_ITERATIONS: 400,
    MLE_LR:         0.05,
    MLE_PENALTY:    500,        // penalidade de identificabilidade (Σ log α = 0)

    // ── Odds ──
    OVERROUND: 0.06,

    // ── Season detection ──
    ROUND1_CLUSTER_MIN: 5,   // mínimo de jogos de rodada 1 seguidos para nova temporada

    // ── Backtest ──
    BACKTEST_SEASONS: 6,     // quantas temporadas finais usar como teste
    BACKTEST_REFIT_EVERY: 4, // refit a cada N rodadas (0 = uma vez por temporada)

    // ── Corte de dados históricos ──
    // Apenas temporadas >= este índice são usadas no treino.
    // 0 = todos os dados (2003+). 12 = a partir de 2015 (índice 0 = 2003).
    TRAIN_FROM_SEASON: 12,  // 2003 + 12 = 2015
  };

  // ────────────────────────────────────────────────
  //  Team name normalisation
  // ────────────────────────────────────────────────
  function normalizeTeam(name) {
    if (name === null || name === undefined) return "";
    let s = String(name).trim().toLowerCase();
    s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    s = s.replace(/-/g, " ");
    s = s.replace(/\s+/g, " ").trim();

    const aliases = new Map([
      ["atletico mg",             "atletico mineiro"],
      ["atletico mineiro mg",     "atletico mineiro"],
      ["athletico pr",            "athletico paranaense"],
      ["athetico parananese",     "athletico paranaense"],
      ["botafogo rj",             "botafogo"],
      ["botafogo fr",             "botafogo"],
      ["ceara sc",                "ceara"],
      ["fluminense fc",           "fluminense"],
      ["fortaleza esporte clube", "fortaleza"],
      ["sc internacional",        "internacional"],
      ["ec juventude",            "juventude"],
      ["mirassol futebol clube",  "mirassol"],
      ["red bull bragantino sp",  "bragantino"],
      ["santos fc",               "santos"],
      ["sport recife",            "sport"],
      ["vasco da gama",           "vasco"],
    ]);

    return aliases.get(s) || s;
  }

  // ────────────────────────────────────────────────
  //  Season detection from round structure
  // ────────────────────────────────────────────────

  /**
   * Detecta limites de temporada procurando clusters de jogos com rodada 1.
   * Retorna [{ seasonIndex, startIdx, endIdx, gameCount }].
   */
  function detectSeasons(rows) {
    const n = rows.length;
    const seasons = [];
    let i = 0;

    while (i < n) {
      const rod = rows[i]._rod;

      if (rod === 1) {
        let clusterEnd = i;
        while (clusterEnd < n && rows[clusterEnd]._rod === 1) clusterEnd++;
        const clusterSize = clusterEnd - i;

        if (clusterSize >= CONFIG.ROUND1_CLUSTER_MIN) {
          const seasonStart = i;
          let j = clusterEnd;
          while (j < n) {
            if (rows[j]._rod === 1) {
              let peek = j;
              let onesCount = 0;
              while (peek < n && peek < j + 15) {
                if (rows[peek]._rod === 1) onesCount++;
                peek++;
              }
              if (onesCount >= CONFIG.ROUND1_CLUSTER_MIN) break;
            }
            j++;
          }

          seasons.push({
            seasonIndex: seasons.length,
            startIdx: seasonStart,
            endIdx: j - 1,
            gameCount: j - seasonStart,
          });
          i = j;
        } else {
          i = clusterEnd;
        }
      } else {
        i++;
      }
    }

    return seasons;
  }

  /**
   * Atribui .season e .round a cada jogo. Para linhas sem rodata,
   * infere a rodada pela posição dentro da temporada.
   */
  function assignSeasonAndRound(rows, seasons) {
    const seasonMap = new Map();
    for (const s of seasons) {
      for (let i = s.startIdx; i <= s.endIdx; i++) seasonMap.set(i, s.seasonIndex);
    }

    for (let i = 0; i < rows.length; i++) {
      const si = seasonMap.get(i);
      if (si === undefined) {
        rows[i].season = -1;
        rows[i].round = 0;
        continue;
      }

      rows[i].season = si;

      if (rows[i]._rod > 0) {
        rows[i].round = rows[i]._rod;
      } else {
        const s = seasons[si];
        const posInSeason = i - s.startIdx;
        const gamesPerRound = 10;
        rows[i].round = Math.floor(posInSeason / gamesPerRound) + 1;
      }
    }
  }

  // ────────────────────────────────────────────────
  //  Temporal weight (round-based)
  // ────────────────────────────────────────────────

  function matchAgeInRounds(matchSeason, matchRound, refSeason, refRound, roundsPerSeason) {
    return (refSeason - matchSeason) * roundsPerSeason + (refRound - matchRound);
  }

  function temporalWeight(ageInRounds, halfLifeRounds, minW) {
    if (ageInRounds <= 0) return 1.0;
    const w = Math.pow(0.5, ageInRounds / halfLifeRounds);
    return Math.max(minW, w);
  }

  // ────────────────────────────────────────────────
  //  Math utilities
  // ────────────────────────────────────────────────

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  const LOG_FACT_CACHE = [0]; // log(0!) = 0
  function logFactorial(n) {
    while (LOG_FACT_CACHE.length <= n) {
      const k = LOG_FACT_CACHE.length;
      LOG_FACT_CACHE.push(LOG_FACT_CACHE[k - 1] + Math.log(k));
    }
    return LOG_FACT_CACHE[n];
  }

  function poissonProb(lambda, k) {
    if (lambda <= 0) return k === 0 ? 1 : 0;
    return Math.exp(k * Math.log(lambda) - lambda - logFactorial(k));
  }

  function oddsFromProbsOverround(ph, pd, pa, overround) {
    const eps = 1e-12;
    const safePh = Math.max(eps, ph);
    const safePd = Math.max(eps, pd);
    const safePa = Math.max(eps, pa);
    const scale = 1 + overround;
    return {
      oh: 1 / (safePh * scale),
      od: 1 / (safePd * scale),
      oa: 1 / (safePa * scale),
    };
  }

  /**
   * Correção τ de Dixon-Coles (1997), aplicada às 4 células de placar baixo.
   *
   *   τ(0,0) = 1 − λH·λA·ρ      τ(1,0) = 1 + λA·ρ
   *   τ(0,1) = 1 + λH·ρ          τ(1,1) = 1 − ρ
   *
   * λH e λA são obrigatórios: é exatamente o τ maximizado em fitDixonColes.
   * (A versão anterior usava 1±ρ, independente de λ — não era o τ ajustado.)
   */
  function applyDixonColes(scoreProbs, rho, lamH, lamA) {
    const adj = new Map(scoreProbs);

    function mult(gH, gA, m) {
      const key = `${gH},${gA}`;
      if (!adj.has(key)) return;
      adj.set(key, adj.get(key) * Math.max(1e-12, m));
    }

    mult(0, 0, 1 - lamH * lamA * rho);
    mult(1, 0, 1 + lamA * rho);
    mult(0, 1, 1 + lamH * rho);
    mult(1, 1, 1 - rho);

    let sum = 0;
    for (const p of adj.values()) sum += p;
    if (!(sum > 0)) return scoreProbs;

    for (const [k, p] of adj.entries()) adj.set(k, p / sum);
    return adj;
  }

  // ────────────────────────────────────────────────
  //  Handle duplicate 2025 data
  // ────────────────────────────────────────────────

  /**
   * O CSV contém dois blocos 2025 sobrepostos. Mantém o bloco com rodadas
   * e descarta o bloco sem rodata (detectado como um trecho contíguo >= 100
   * linhas com rodata vazia).
   */
  function removeDuplicateBlock(rows) {
    let blockStart = -1;
    let blockEnd = -1;
    let runStart = -1;

    for (let i = 0; i < rows.length; i++) {
      if (!rows[i]._rod) {
        if (runStart === -1) runStart = i;
      } else {
        if (runStart !== -1) {
          const runLen = i - runStart;
          if (runLen >= 100) {
            blockStart = runStart;
            blockEnd = i;
          }
          runStart = -1;
        }
      }
    }
    if (runStart !== -1) {
      const runLen = rows.length - runStart;
      if (runLen >= 100) {
        blockStart = runStart;
        blockEnd = rows.length;
      }
    }

    if (blockStart >= 0) {
      const removed = blockEnd - blockStart;
      rows.splice(blockStart, removed);
      return removed;
    }
    return 0;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  MLE completo de Dixon-Coles via gradientes analíticos + Adam
  //
  //  Vetor de parâmetros x (tamanho 2n + 3):
  //    x[i]      = log(α_i)   força de ataque,   i ∈ [0, n)
  //    x[n+i]    = log(β_i)   fragilidade defensiva
  //    x[2n]     = log(γ)     vantagem de casa (global)
  //    x[2n+1]   = log(μ)     taxa-base de gols da liga
  //    x[2n+2]   = ρ          correlação de placares baixos
  //
  //  Gols esperados:
  //    λ_H = exp( x[hi] + x[n+aj] + x[2n] + x[2n+1] )
  //    λ_A = exp( x[aj] + x[n+hi]           + x[2n+1] )
  //
  //  Identificabilidade: penaliza (Σ log α_i)² e (Σ log β_i)²
  //  ⇒ média geométrica de α e de β igual a 1.
  //
  //  Não há ridge sobre α/β: foi medido no backtest e piora o log-loss
  //  (ridge 25 → +0.0035; ridge 75 → +0.0092).
  // ═══════════════════════════════════════════════════════════════════════
  function fitDixonColes(games, leagueHomeAvg, leagueAwayAvg) {
    const PENALTY   = CONFIG.MLE_PENALTY;
    const LR        = CONFIG.MLE_LR;
    const MAX_ITER  = CONFIG.MLE_ITERATIONS;
    const MAX_GOALS = CONFIG.POISSON_MAX_GOALS;

    const teamIdx = new Map();
    const teams   = [];
    const matches = [];
    for (const p of games) {
      if (!teamIdx.has(p.home)) { teamIdx.set(p.home, teams.length); teams.push(p.home); }
      if (!teamIdx.has(p.away)) { teamIdx.set(p.away, teams.length); teams.push(p.away); }
      matches.push({
        hi: teamIdx.get(p.home),
        ai: teamIdx.get(p.away),
        hg: Math.min(p.hg, MAX_GOALS),
        ag: Math.min(p.ag, MAX_GOALS),
        w:  p.wPoi,
      });
    }
    const n = teams.length;

    const logFact = [0];
    for (let k = 1; k <= MAX_GOALS + 1; k++) logFact.push(logFact[k - 1] + Math.log(k));

    const DIM = 2 * n + 3;
    const x   = new Float64Array(DIM);

    const safeHome = leagueHomeAvg > 0 ? leagueHomeAvg : 1;
    const safeAway = leagueAwayAvg > 0 ? leagueAwayAvg : 1;
    x[2 * n]     = Math.log(safeHome / safeAway); // log(γ)
    x[2 * n + 1] = Math.log(safeAway);            // log(μ)
    x[2 * n + 2] = CONFIG.DC_RHO;                 // semente de ρ

    const m1 = new Float64Array(DIM);
    const m2 = new Float64Array(DIM);
    const B1 = 0.9, B2 = 0.999, EPS_ADAM = 1e-8;

    let bestX   = Float64Array.from(x);
    let bestNll = Infinity;

    const g = new Float64Array(DIM);
    let b1t = 1.0;
    let b2t = 1.0;

    for (let iter = 0; iter < MAX_ITER; iter++) {
      g.fill(0);
      let nll = 0;
      const logHome = x[2 * n];
      const logBase = x[2 * n + 1];
      const rho     = x[2 * n + 2];

      for (const m of matches) {
        const logLH = x[m.hi] + x[n + m.ai] + logHome + logBase;
        const logLA = x[m.ai] + x[n + m.hi]            + logBase;
        const lH    = Math.exp(logLH);
        const lA    = Math.exp(logLA);
        const hg    = m.hg;
        const ag    = m.ag;

        // τ de Dixon-Coles e derivadas parciais em relação a lH, lA e ρ
        let tau, dtH, dtA, dtR;
        if      (hg === 0 && ag === 0) { tau = 1 - lH * lA * rho; dtH = -lA * rho; dtA = -lH * rho; dtR = -lH * lA; }
        else if (hg === 1 && ag === 0) { tau = 1 + lA * rho;      dtH = 0;         dtA = rho;       dtR =  lA;     }
        else if (hg === 0 && ag === 1) { tau = 1 + lH * rho;      dtH = rho;       dtA = 0;         dtR =  lH;     }
        else if (hg === 1 && ag === 1) { tau = 1 - rho;           dtH = 0;         dtA = 0;         dtR = -1;      }
        else                           { tau = 1;                 dtH = 0;         dtA = 0;         dtR =  0;      }

        if (tau <= 1e-10) { nll += 1e10; continue; }

        nll -= m.w * (
          Math.log(tau) +
          hg * logLH - lH - logFact[hg] +
          ag * logLA - lA - logFact[ag]
        );

        // ∂log(τ)/∂logλ = (∂τ/∂λ)·λ / τ
        const dLogTau_lH = (dtH * lH) / tau;
        const dLogTau_lA = (dtA * lA) / tau;

        const dL_LH = m.w * (dLogTau_lH + hg - lH);
        const dL_LA = m.w * (dLogTau_lA + ag - lA);

        g[m.hi]      -= dL_LH;
        g[n + m.ai]  -= dL_LH;
        g[2 * n]     -= dL_LH;
        g[2 * n + 1] -= dL_LH;

        g[m.ai]      -= dL_LA;
        g[n + m.hi]  -= dL_LA;
        g[2 * n + 1] -= dL_LA;

        g[2 * n + 2] -= m.w * (dtR / tau);
      }

      // Penalidade de identificabilidade
      let sumA = 0, sumD = 0;
      for (let i = 0; i < n; i++) { sumA += x[i]; sumD += x[n + i]; }
      nll += PENALTY * (sumA * sumA + sumD * sumD);
      for (let i = 0; i < n; i++) {
        g[i]     += 2 * PENALTY * sumA;
        g[n + i] += 2 * PENALTY * sumD;
      }

      if (nll < bestNll) { bestNll = nll; bestX = Float64Array.from(x); }

      b1t *= B1;
      b2t *= B2;
      const inv1mb1t = 1 / (1 - b1t);
      const inv1mb2t = 1 / (1 - b2t);
      for (let j = 0; j < DIM; j++) {
        m1[j] = B1 * m1[j] + (1 - B1) * g[j];
        m2[j] = B2 * m2[j] + (1 - B2) * g[j] * g[j];
        const mh = m1[j] * inv1mb1t;
        const vh = m2[j] * inv1mb2t;
        x[j] -= LR * mh / (Math.sqrt(vh) + EPS_ADAM);
      }

      // Mantém ρ numa faixa em que τ > 0 para os placares baixos usuais
      x[2 * n + 2] = clamp(x[2 * n + 2], -0.20, 0.20);
    }

    const dcAtk = new Map();
    const dcDef = new Map();
    for (let i = 0; i < n; i++) {
      dcAtk.set(teams[i], Math.exp(bestX[i]));
      dcDef.set(teams[i], Math.exp(bestX[n + i]));
    }

    return {
      atk:     dcAtk,
      def:     dcDef,
      homeAdv: Math.exp(bestX[2 * n]),
      base:    Math.exp(bestX[2 * n + 1]),
      rho:     bestX[2 * n + 2],
      nll:     bestNll,
      teamCount: n,
    };
  }

  // ────────────────────────────────────────────────
  //  Build model
  // ────────────────────────────────────────────────

  /**
   * @param {object[]} rawRows – linhas do CSV (saída do PapaParse)
   * @param {object}   opts    – { trainFromSeason }
   *
   * trainFromSeason: índice mínimo de temporada a usar no treino. O padrão é
   * CONFIG.TRAIN_FROM_SEASON. O backtest passa 0 explicitamente porque ele já
   * recortou a janela de treino antes de chamar aqui — e detectSeasons
   * re-indexa as temporadas a partir de 0 no subconjunto, então aplicar o
   * corte duas vezes descartaria todos os jogos.
   */
  /**
   * Parse + normalização + remoção do bloco duplicado + atribuição de
   * temporada/rodada. Compartilhado por buildModel e computeSeasonState para
   * que os dois enxerguem exatamente os mesmos jogos.
   */
  function parseRows(rawRows) {
    const parsed = [];
    for (const r of rawRows) {
      const home = normalizeTeam(r[CONFIG.HOME_TEAM_COL]);
      const away = normalizeTeam(r[CONFIG.AWAY_TEAM_COL]);
      const hg = Number(r[CONFIG.HOME_GOALS_COL]);
      const ag = Number(r[CONFIG.AWAY_GOALS_COL]);
      const rodStr = String(r[CONFIG.DATE_COL] || "").trim();
      const rod = rodStr ? parseFloat(rodStr) : 0;

      if (!home || !away) continue;
      if (!Number.isFinite(hg) || !Number.isFinite(ag)) continue;

      parsed.push({
        home,
        away,
        hg: hg | 0,
        ag: ag | 0,
        _rod: Number.isFinite(rod) ? rod : 0,
        season: -1,
        round: 0,
      });
    }

    if (parsed.length < 50) {
      throw new Error(
        "Dataset insuficiente após limpeza. Verifique nomes das colunas e formato dos dados."
      );
    }

    const removedCount = removeDuplicateBlock(parsed);

    const seasons = detectSeasons(parsed);
    if (seasons.length === 0) {
      throw new Error("Nenhuma temporada detectada. Verifique se o CSV contém rodada 1.");
    }
    assignSeasonAndRound(parsed, seasons);

    return { parsed, seasons, removedCount };
  }

  function buildModel(rawRows, opts = {}) {
    const trainFromSeason = opts.trainFromSeason ?? CONFIG.TRAIN_FROM_SEASON;

    const { parsed, seasons, removedCount } = parseRows(rawRows);

    const valid = parsed.filter(p => p.season >= 0 && p.season >= trainFromSeason);

    if (valid.length < 50) {
      throw new Error(
        `Poucos jogos após o corte de temporada (${valid.length}). ` +
        `Reduza CONFIG.TRAIN_FROM_SEASON (atual: ${trainFromSeason}).`
      );
    }

    // ── 4. Ponto de referência (jogo mais recente) ──
    let refSeason = 0;
    let refRound = 0;
    for (const p of valid) {
      if (p.season > refSeason || (p.season === refSeason && p.round > refRound)) {
        refSeason = p.season;
        refRound = p.round;
      }
    }

    const roundsPerSeason = 38;

    // ── 5. Pesos temporais ──
    for (const p of valid) {
      const age = matchAgeInRounds(p.season, p.round, refSeason, refRound, roundsPerSeason);
      p.wElo = temporalWeight(age, CONFIG.HALF_LIFE_ELO_ROUNDS, CONFIG.MIN_W_ELO);
      p.wPoi = temporalWeight(age, CONFIG.HALF_LIFE_POISSON_ROUNDS, CONFIG.MIN_W_POI);
    }

    // ── 6. Médias da liga (ponderadas) — usadas como semente do MLE e na UI ──
    let leagueHomeGoalsW = 0;
    let leagueAwayGoalsW = 0;
    let leagueW = 0;
    for (const p of valid) {
      leagueHomeGoalsW += p.hg * p.wPoi;
      leagueAwayGoalsW += p.ag * p.wPoi;
      leagueW += p.wPoi;
    }
    const leagueHomeAvg = leagueW > 0 ? leagueHomeGoalsW / leagueW : 1.0;
    const leagueAwayAvg = leagueW > 0 ? leagueAwayGoalsW / leagueW : 1.0;
    const leagueGoalsPerTeam = (leagueHomeAvg + leagueAwayAvg) / 2;

    // ── 7. MLE conjunto: α, β, γ, μ e ρ estimados de uma vez ──
    const dc = fitDixonColes(valid, leagueHomeAvg, leagueAwayAvg);

    // Visão de compatibilidade para a UI e para o worker do Monte Carlo.
    // O MLE tem um α e um β por time (não separa casa/fora), então os quatro
    // campos derivam dos mesmos dois parâmetros.
    const forces = new Map();
    for (const t of dc.atk.keys()) {
      const a = dc.atk.get(t);
      const d = dc.def.get(t);
      forces.set(t, { atkH: a, defH: d, atkA: a, defA: d });
    }

    // Base de gols implícita pelo modelo (γ·μ em casa, μ fora)
    const homeBase = dc.homeAdv * dc.base;
    const awayBase = dc.base;

    // ── 8. Últimos jogos por time (usado pela UI para exibir a sequência) ──
    const recentMatches = new Map();
    function pushMatch(t, gf, ga, season, round) {
      if (!recentMatches.has(t)) recentMatches.set(t, []);
      recentMatches.get(t).push({ gf, ga, season, round });
    }
    for (const p of valid) {
      pushMatch(p.home, p.hg, p.ag, p.season, p.round);
      pushMatch(p.away, p.ag, p.hg, p.season, p.round);
    }
    const lastRound = new Map();
    for (const [t, list] of recentMatches.entries()) {
      list.sort((a, b) => a.season !== b.season ? a.season - b.season : a.round - b.round);
      const last = list[list.length - 1];
      lastRound.set(t, { season: last.season, round: last.round });
    }

    // ── 9. Elo com reset parcial por temporada ──
    valid.sort((a, b) => a.season !== b.season ? a.season - b.season : a.round - b.round);

    const elo = new Map();
    let currentSeason = null;

    function seasonReset() {
      for (const [t, r] of elo.entries()) {
        elo.set(
          t,
          r * (1 - CONFIG.SEASON_RESET_ALPHA) +
            CONFIG.ELO_INITIAL * CONFIG.SEASON_RESET_ALPHA
        );
      }
    }

    function getElo(t) {
      if (!elo.has(t)) elo.set(t, CONFIG.ELO_INITIAL);
      return elo.get(t);
    }

    for (const p of valid) {
      if (currentSeason === null) {
        currentSeason = p.season;
      } else if (p.season !== currentSeason) {
        seasonReset();
        currentSeason = p.season;
      }

      const rc = getElo(p.home);
      const rv = getElo(p.away);

      let result = 0.5;
      if (p.hg > p.ag) result = 1.0;
      else if (p.hg < p.ag) result = 0.0;

      const expC = 1 / (1 + Math.pow(10, (rv - rc) / 400));
      const diff = Math.abs(p.hg - p.ag);
      const kBase = CONFIG.ELO_K_BASE * (1 + 0.5 * Math.max(0, diff - 1));
      const k = kBase * p.wElo;

      elo.set(p.home, rc + k * (result - expC));
      elo.set(p.away, rv + k * ((1 - result) - (1 - expC)));
    }

    const teamNames = new Set(forces.keys());

    return {
      refSeason,
      refRound,
      roundsPerSeason,
      seasonCount: seasons.length,
      leagueHomeAvg,
      leagueAwayAvg,
      leagueGoalsPerTeam,
      homeBase,
      awayBase,
      dc,
      forces,
      elo,
      recentMatches,
      lastRound,
      teamNames,
      parsedCount: valid.length,
      teamCount: forces.size,
      removedDuplicates: removedCount,
    };
  }

  // ────────────────────────────────────────────────
  //  Predict match
  // ────────────────────────────────────────────────

  function predictMatch(homeRaw, awayRaw, model) {
    const home = normalizeTeam(homeRaw);
    const away = normalizeTeam(awayRaw);

    const warnings = [];
    if (!model.teamNames.has(home)) warnings.push(`"${homeRaw}" não encontrado no dataset`);
    if (!model.teamNames.has(away)) warnings.push(`"${awayRaw}" não encontrado no dataset`);

    const dc = model.dc;
    const atkHome = dc.atk.get(home) ?? 1;
    const defHome = dc.def.get(home) ?? 1;
    const atkAway = dc.atk.get(away) ?? 1;
    const defAway = dc.def.get(away) ?? 1;

    // λ_H = α_casa · β_fora · γ · μ        λ_A = α_fora · β_casa · μ
    let lamH = atkHome * defAway * model.homeBase;
    let lamA = atkAway * defHome * model.awayBase;

    // Pequeno ajuste de Elo: gira a razão λ_H/λ_A mantendo o produto constante
    const rH = model.elo.get(home) ?? CONFIG.ELO_INITIAL;
    const rA = model.elo.get(away) ?? CONFIG.ELO_INITIAL;
    let adj = ((rH - rA) / 400) * CONFIG.ELO_GAMMA;
    adj = clamp(adj, -CONFIG.ELO_LAMBDA_CLAMP, CONFIG.ELO_LAMBDA_CLAMP);

    lamH *= Math.exp(adj);
    lamA *= Math.exp(-adj);

    const score = new Map();
    for (let gh = 0; gh <= CONFIG.POISSON_MAX_GOALS; gh += 1) {
      for (let ga = 0; ga <= CONFIG.POISSON_MAX_GOALS; ga += 1) {
        score.set(`${gh},${ga}`, poissonProb(lamH, gh) * poissonProb(lamA, ga));
      }
    }

    const scoreAdj = applyDixonColes(score, dc.rho, lamH, lamA);

    let pH = 0;
    let pD = 0;
    let pA = 0;
    let bestP = -1;
    let bestGH = 0;
    let bestGA = 0;
    for (const [k, p] of scoreAdj.entries()) {
      const [gh, ga] = k.split(",").map(Number);
      if (gh > ga) pH += p;
      else if (gh === ga) pD += p;
      else pA += p;
      if (p > bestP) { bestP = p; bestGH = gh; bestGA = ga; }
    }
    const tot = pH + pD + pA || 1;
    pH /= tot;
    pD /= tot;
    pA /= tot;

    const odds = oddsFromProbsOverround(pH, pD, pA, CONFIG.OVERROUND);

    let pick = "Empate";
    const max = Math.max(pH, pD, pA);
    if (max === pH) pick = "Mandante";
    else if (max === pA) pick = "Visitante";

    return {
      home,
      away,
      lamH,
      lamA,
      pH,
      pD,
      pA,
      oh: odds.oh,
      od: odds.od,
      oa: odds.oa,
      pick,
      bestScore:  `${bestGH}–${bestGA}`,
      bestScoreP: bestP,
      scoreAdj,
      maxGoals:   CONFIG.POISSON_MAX_GOALS,
      warnings,
    };
  }

  // ────────────────────────────────────────────────
  //  Estado da temporada corrente
  // ────────────────────────────────────────────────

  /**
   * Classificação atual e jogos que faltam da última temporada do CSV.
   *
   * Existe porque simular uma temporada "virgem" de 380 jogos a partir de zero
   * ponto ignora tudo o que já aconteceu: um time a 23 pontos do líder com 18
   * jogos restantes aparecia com chance de título de time de meio de tabela.
   * A simulação tem que partir da tabela real e sortear só o que falta.
   *
   * Assume returno duplo (todo par se enfrenta em casa e fora), que é o
   * formato do Brasileirão.
   *
   * @param {object[]} rawRows – linhas do CSV (saída do PapaParse)
   * @returns {{season:number, roundsPlayed:number, teams:string[],
   *            standings:Map, remaining:Array<[string,string]>, excluded:Array}}
   */
  function computeSeasonState(rawRows) {
    const { parsed } = parseRows(rawRows);

    let season = -1;
    for (const p of parsed) if (p.season > season) season = p.season;
    const games = parsed.filter(p => p.season === season);

    const played = new Map();   // "casa|fora" já disputado
    const tally  = new Map();
    const get = (t) => {
      if (!tally.has(t)) tally.set(t, { pts: 0, gd: 0, gf: 0, ga: 0, played: 0, w: 0, d: 0, l: 0 });
      return tally.get(t);
    };

    let roundsPlayed = 0;
    for (const g of games) {
      roundsPlayed = Math.max(roundsPlayed, g.round);
      played.set(`${g.home}|${g.away}`, true);
      const H = get(g.home), A = get(g.away);
      H.played++; A.played++;
      H.gf += g.hg; H.ga += g.ag; H.gd += g.hg - g.ag;
      A.gf += g.ag; A.ga += g.hg; A.gd += g.ag - g.hg;
      if (g.hg > g.ag)      { H.pts += 3; H.w++; A.l++; }
      else if (g.hg < g.ag) { A.pts += 3; A.w++; H.l++; }
      else                  { H.pts++; A.pts++; H.d++; A.d++; }
    }

    // Uma linha errada no CSV (time trocado) cria um "21º time" com 1 jogo e
    // contamina a tabela. Mantém só quem tem participação compatível com a
    // temporada, e devolve os excluídos para a UI poder avisar.
    let maxPlayed = 0;
    for (const s of tally.values()) maxPlayed = Math.max(maxPlayed, s.played);
    const minPlayed = Math.max(3, Math.floor(maxPlayed * 0.5));

    const teams = [], excluded = [];
    for (const [t, s] of tally.entries()) {
      if (s.played >= minPlayed) teams.push(t);
      else excluded.push({ team: t, played: s.played });
    }
    teams.sort((a, b) => {
      const A = tally.get(a), B = tally.get(b);
      return B.pts - A.pts || B.gd - A.gd || B.gf - A.gf || a.localeCompare(b, "pt");
    });

    const standings = new Map(teams.map(t => [t, tally.get(t)]));

    const remaining = [];
    for (const h of teams) {
      for (const a of teams) {
        if (h === a) continue;
        if (!played.has(`${h}|${a}`)) remaining.push([h, a]);
      }
    }

    return { season, roundsPlayed, teams, standings, remaining, excluded };
  }

  // ────────────────────────────────────────────────
  //  Métricas de avaliação
  // ────────────────────────────────────────────────

  /**
   * Acumulador de métricas para um conjunto de previsões 1X2.
   * RPS (Ranked Probability Score) é a métrica correta para desfechos
   * ordinais (H < D < A) e é a que menos pune erro "por pouco".
   */
  function createScorer() {
    let n = 0, llSum = 0, brierSum = 0, rpsSum = 0, correct = 0;
    const calBins = Array.from({ length: 10 }, () => ({ predSum: 0, actualSum: 0, n: 0 }));

    return {
      add(pred, result) {
        const probs = [pred.pH, pred.pD, pred.pA];
        const yi = result === "H" ? 0 : result === "D" ? 1 : 2;

        llSum += -Math.log(Math.max(1e-15, probs[yi]));

        for (let i = 0; i < 3; i++) brierSum += (probs[i] - (i === yi ? 1 : 0)) ** 2;

        // RPS: soma dos quadrados das diferenças de CDF (2 pontos de corte)
        let cumP = 0, cumY = 0, s = 0;
        for (let i = 0; i < 2; i++) {
          cumP += probs[i];
          cumY += (i === yi ? 1 : 0);
          s += (cumP - cumY) ** 2;
        }
        rpsSum += s / 2;

        if (probs[yi] === Math.max(probs[0], probs[1], probs[2])) correct++;

        for (let i = 0; i < 3; i++) {
          const b = Math.min(9, Math.floor(probs[i] * 10));
          calBins[b].predSum += probs[i];
          calBins[b].actualSum += (i === yi ? 1 : 0);
          calBins[b].n++;
        }
        n++;
      },
      get n() { return n; },
      result() {
        return {
          n,
          logLoss:  n ? llSum / n : NaN,
          brier:    n ? brierSum / n : NaN,
          rps:      n ? rpsSum / n : NaN,
          accuracy: n ? correct / n : NaN,
          calBins,
        };
      },
    };
  }

  // ────────────────────────────────────────────────
  //  Walk-forward backtest
  // ────────────────────────────────────────────────

  /**
   * Backtest walk-forward. Para cada uma das últimas CONFIG.BACKTEST_SEASONS
   * temporadas, treina só com jogos anteriores e prevê os jogos seguintes.
   *
   * Com refitEvery > 0 o modelo é re-treinado a cada N rodadas DENTRO da
   * temporada de teste — é o cenário real de uso (prever a próxima rodada) e
   * o único justo com features que dependem de recência.
   * Com refitEvery = 0 treina uma vez por temporada (mais rápido, mais
   * pessimista).
   *
   * @param {object[]} rawRows    – saída do PapaParse (a mesma de buildModel)
   * @param {function} onProgress – callback(done, total), opcional
   * @param {object}   opts       – { refitEvery, seasons, yield }
   */
  async function runBacktest(rawRows, onProgress, opts = {}) {
    const refitEvery = opts.refitEvery ?? CONFIG.BACKTEST_REFIT_EVERY;
    const numSeasonsWanted = opts.seasons ?? CONFIG.BACKTEST_SEASONS;
    const shouldYield = opts.yield !== false;

    // Parse rápido só para atribuir temporadas
    const qp = [];
    for (const r of rawRows) {
      const home = normalizeTeam(r[CONFIG.HOME_TEAM_COL]);
      const away = normalizeTeam(r[CONFIG.AWAY_TEAM_COL]);
      const hg   = Number(r[CONFIG.HOME_GOALS_COL]);
      const ag   = Number(r[CONFIG.AWAY_GOALS_COL]);
      const rod  = parseFloat(String(r[CONFIG.DATE_COL] || "").trim()) || 0;
      if (!home || !away || !Number.isFinite(hg) || !Number.isFinite(ag)) continue;
      qp.push({ home, away, hg: hg | 0, ag: ag | 0, _rod: Number.isFinite(rod) ? rod : 0, season: -1, round: 0 });
    }
    removeDuplicateBlock(qp);
    const seasons = detectSeasons(qp);
    assignSeasonAndRound(qp, seasons);
    const valid = qp.filter(p => p.season >= 0);

    const N = seasons.length;
    const numTest   = Math.min(numSeasonsWanted, N - 2);
    const firstTest = N - numTest;
    const currentYear = new Date().getFullYear();
    const yearOf = (si) => currentYear - (N - 1 - si);

    const toRows = (games) => games.map(g => ({
      [CONFIG.DATE_COL]:       String(g.round),
      [CONFIG.HOME_TEAM_COL]:  g.home,
      [CONFIG.AWAY_TEAM_COL]:  g.away,
      [CONFIG.HOME_GOALS_COL]: String(g.hg),
      [CONFIG.AWAY_GOALS_COL]: String(g.ag),
    }));

    const seasonResults = [];
    const overall  = createScorer();
    // Referência: prever sempre a taxa-base histórica do Brasileirão.
    // Se o modelo não vencer isto, ele não tem valor preditivo nenhum.
    const baseline = createScorer();
    const BASE_RATES = { pH: 0.47, pD: 0.27, pA: 0.26 };

    for (let si = firstTest; si < N; si++) {
      const priorGames = valid.filter(p => p.season < si && p.season >= CONFIG.TRAIN_FROM_SEASON);
      const testGames  = valid.filter(p => p.season === si);
      if (priorGames.length < 100 || testGames.length === 0) continue;

      if (shouldYield) await new Promise(res => setTimeout(res, 0));
      if (onProgress) onProgress(si - firstTest, numTest);

      const scorer = createScorer();
      const rounds = [...new Set(testGames.map(g => g.round))].sort((a, b) => a - b);

      let model = null;
      let lastFitRound = -Infinity;

      for (const rd of rounds) {
        const batch = testGames.filter(g => g.round === rd);

        if (model === null || (refitEvery > 0 && rd - lastFitRound >= refitEvery)) {
          const train = refitEvery > 0
            ? priorGames.concat(testGames.filter(g => g.round < rd))
            : priorGames;
          // trainFromSeason: 0 porque a janela já foi recortada em priorGames
          model = buildModel(toRows(train), { trainFromSeason: 0 });
          lastFitRound = rd;
          if (shouldYield) await new Promise(res => setTimeout(res, 0));
        }

        for (const g of batch) {
          const pred   = predictMatch(g.home, g.away, model);
          const result = g.hg > g.ag ? "H" : g.hg < g.ag ? "A" : "D";
          scorer.add(pred, result);
          overall.add(pred, result);
          baseline.add(BASE_RATES, result);
        }
      }

      const r = scorer.result();
      seasonResults.push({
        seasonIdx: si,
        year:      yearOf(si),
        n:         r.n,
        brier:     r.brier,
        logLoss:   r.logLoss,
        rps:       r.rps,
        accuracy:  r.accuracy,
        calBins:   r.calBins,
      });
    }

    if (onProgress) onProgress(numTest, numTest);

    const overallResult  = overall.result();
    const baselineResult = baseline.result();

    return {
      seasonResults,
      calBins: overallResult.calBins,
      numTest,
      overall:  overallResult,
      baseline: baselineResult,
    };
  }

  // ────────────────────────────────────────────────
  //  Exports
  // ────────────────────────────────────────────────

  const exported = {
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
    parseRows,
    computeSeasonState,
    fitDixonColes,
    createScorer,
    buildModel,
    predictMatch,
    runBacktest,
  };

  if (typeof window !== "undefined") {
    window.BenchModel = exported;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = exported;
  }
})();
