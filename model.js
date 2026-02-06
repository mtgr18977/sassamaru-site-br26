/* eslint-disable no-var */
(() => {
  const CONFIG = {
    CSV_PATH: "./campeonato-brasileiro-full_ate_2025.csv",
    DATE_COL: "data",
    HOME_TEAM_COL: "mandante",
    AWAY_TEAM_COL: "visitante",
    HOME_GOALS_COL: "mandante_Placar",
    AWAY_GOALS_COL: "visitante_Placar",
    HALF_LIFE_ELO_DAYS: 365 * 2,
    HALF_LIFE_POISSON_DAYS: 365 * 4,
    ELO_INITIAL: 1500,
    ELO_K_BASE: 30,
    SEASON_RESET_ALPHA: 0.20,
    ELO_GAMMA: 0.08,
    ELO_LAMBDA_CLAMP: 0.18,
    POISSON_MAX_GOALS: 8,
    DC_RHO: -0.10,
    FORM_MATCHES: 5,
    HALF_LIFE_FORM_DAYS: 120,
    MIN_W_FORM: 0.40,
    FORM_FACTOR_MIN: 0.75,
    FORM_FACTOR_MAX: 1.25,
    OVERROUND: 0.06,
    MIN_W_ELO: 0.15,
    MIN_W_POI: 0.30,
  };

  function normalizeTeam(name) {
    if (name === null || name === undefined) return "";
    let s = String(name).trim().toLowerCase();
    s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    s = s.replace(/-/g, " ");
    s = s.replace(/\s+/g, " ").trim();

    const aliases = new Map([
      ["atletico mg", "atletico mineiro"],
      ["atletico mineiro mg", "atletico mineiro"],
      ["botafogo rj", "botafogo"],
      ["vasco da gama", "vasco"],
      ["athetico parananese", "athletico paranaense"],
    ]);
    return aliases.get(s) || s;
  }

  function parseDateBR(s) {
    if (!s) return null;
    const str = String(s).trim();
    const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      const dd = Number(m[1]);
      const mm = Number(m[2]);
      const yy = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
      const d = new Date(Date.UTC(yy, mm - 1, dd));
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const d2 = new Date(str);
    return Number.isNaN(d2.getTime()) ? null : d2;
  }

  function daysBetween(a, b) {
    const ms = b.getTime() - a.getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
  }

  function temporalWeight(matchDate, refDate, halfLifeDays, minW) {
    if (!matchDate || !refDate) return 1.0;
    const age = daysBetween(matchDate, refDate);
    if (age <= 0) return 1.0;
    const w = Math.pow(0.5, age / halfLifeDays);
    return Math.max(minW, w);
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function poissonProb(lambda, k) {
    if (lambda <= 0) return k === 0 ? 1 : 0;
    let fact = 1;
    for (let i = 2; i <= k; i += 1) fact *= i;
    return Math.exp(-lambda) * Math.pow(lambda, k) / fact;
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

  function applyDixonColes(scoreProbs, rho) {
    const adj = new Map(scoreProbs);

    function mult(gH, gA, m) {
      const key = `${gH},${gA}`;
      adj.set(key, (adj.get(key) || 0) * m);
    }

    mult(0, 0, 1 - rho);
    mult(1, 1, 1 - rho);
    mult(1, 0, 1 + rho);
    mult(0, 1, 1 + rho);

    let sum = 0;
    for (const p of adj.values()) sum += p;
    if (sum <= 0) return scoreProbs;

    for (const [k, p] of adj.entries()) {
      adj.set(k, p / sum);
    }
    return adj;
  }

  function buildModel(rows) {
    const parsed = [];
    for (const r of rows) {
      const home = normalizeTeam(r[CONFIG.HOME_TEAM_COL]);
      const away = normalizeTeam(r[CONFIG.AWAY_TEAM_COL]);
      const hg = Number(r[CONFIG.HOME_GOALS_COL]);
      const ag = Number(r[CONFIG.AWAY_GOALS_COL]);
      const dt = parseDateBR(r[CONFIG.DATE_COL]);

      if (!home || !away) continue;
      if (!Number.isFinite(hg) || !Number.isFinite(ag)) continue;
      if (!dt) continue;

      parsed.push({
        home,
        away,
        hg: hg | 0,
        ag: ag | 0,
        dt,
      });
    }

    if (parsed.length < 50) {
      throw new Error(
        "Dataset insuficiente após limpeza. Verifique nomes das colunas e formato de data."
      );
    }

    let ref = parsed[0].dt;
    for (const p of parsed) if (p.dt > ref) ref = p.dt;

    for (const p of parsed) {
      p.wElo = temporalWeight(
        p.dt,
        ref,
        CONFIG.HALF_LIFE_ELO_DAYS,
        CONFIG.MIN_W_ELO
      );
      p.wPoi = temporalWeight(
        p.dt,
        ref,
        CONFIG.HALF_LIFE_POISSON_DAYS,
        CONFIG.MIN_W_POI
      );
    }

    let leagueHomeGoalsW = 0;
    let leagueAwayGoalsW = 0;
    let leagueW = 0;
    const team = new Map();

    function getTeam(t) {
      if (!team.has(t)) {
        team.set(t, {
          homeGFw: 0,
          homeGAw: 0,
          homeW: 0,
          awayGFw: 0,
          awayGAw: 0,
          awayW: 0,
        });
      }
      return team.get(t);
    }

    for (const p of parsed) {
      const w = p.wPoi;
      leagueHomeGoalsW += p.hg * w;
      leagueAwayGoalsW += p.ag * w;
      leagueW += w;

      const th = getTeam(p.home);
      th.homeGFw += p.hg * w;
      th.homeGAw += p.ag * w;
      th.homeW += w;

      const ta = getTeam(p.away);
      ta.awayGFw += p.ag * w;
      ta.awayGAw += p.hg * w;
      ta.awayW += w;
    }

    const leagueHomeAvg = leagueW > 0 ? leagueHomeGoalsW / leagueW : 1.0;
    const leagueAwayAvg = leagueW > 0 ? leagueAwayGoalsW / leagueW : 1.0;
    const leagueGoalsPerTeam = (leagueHomeAvg + leagueAwayAvg) / 2;

    const forces = new Map();
    for (const [t, st] of team.entries()) {
      const homeGF = st.homeW > 0 ? st.homeGFw / st.homeW : NaN;
      const homeGA = st.homeW > 0 ? st.homeGAw / st.homeW : NaN;
      const awayGF = st.awayW > 0 ? st.awayGFw / st.awayW : NaN;
      const awayGA = st.awayW > 0 ? st.awayGAw / st.awayW : NaN;

      const atkH =
        Number.isFinite(homeGF) && leagueHomeAvg > 0
          ? homeGF / leagueHomeAvg
          : 1.0;
      const defH =
        Number.isFinite(homeGA) && leagueAwayAvg > 0
          ? homeGA / leagueAwayAvg
          : 1.0;
      const atkA =
        Number.isFinite(awayGF) && leagueAwayAvg > 0
          ? awayGF / leagueAwayAvg
          : 1.0;
      const defA =
        Number.isFinite(awayGA) && leagueHomeAvg > 0
          ? awayGA / leagueHomeAvg
          : 1.0;

      forces.set(t, { atkH, defH, atkA, defA });
    }

    parsed.sort((a, b) => a.dt - b.dt);

    const recentMatches = new Map();
    function pushMatch(t, gf, ga, dt) {
      if (!recentMatches.has(t)) recentMatches.set(t, []);
      recentMatches.get(t).push({ dt, gf, ga });
    }
    for (const p of parsed) {
      pushMatch(p.home, p.hg, p.ag, p.dt);
      pushMatch(p.away, p.ag, p.hg, p.dt);
    }
    const form = new Map();
    for (const [t, list] of recentMatches.entries()) {
      list.sort((a, b) => a.dt - b.dt);
      const recent = list.slice(-CONFIG.FORM_MATCHES);
      let gf = 0;
      let ga = 0;
      let wsum = 0;
      for (const m of recent) {
        const w = temporalWeight(
          m.dt,
          ref,
          CONFIG.HALF_LIFE_FORM_DAYS,
          CONFIG.MIN_W_FORM
        );
        gf += m.gf * w;
        ga += m.ga * w;
        wsum += w;
      }
      if (wsum > 0) {
        form.set(t, { gf: gf / wsum, ga: ga / wsum });
      }
    }

    const elo = new Map();
    let currentYear = null;

    function seasonReset() {
      for (const [t, r] of elo.entries()) {
        elo.set(t, r * (1 - CONFIG.SEASON_RESET_ALPHA) + CONFIG.ELO_INITIAL * CONFIG.SEASON_RESET_ALPHA);
      }
    }

    function getElo(t) {
      if (!elo.has(t)) elo.set(t, CONFIG.ELO_INITIAL);
      return elo.get(t);
    }

    for (const p of parsed) {
      const y = p.dt.getUTCFullYear();
      if (currentYear === null) currentYear = y;
      else if (y !== currentYear) {
        seasonReset();
        currentYear = y;
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

      const newC = rc + k * (result - expC);
      const newV = rv + k * ((1 - result) - (1 - expC));

      elo.set(p.home, newC);
      elo.set(p.away, newV);
    }

    return {
      refDate: ref,
      leagueHomeAvg,
      leagueAwayAvg,
      leagueGoalsPerTeam,
      forces,
      elo,
      form,
      parsedCount: parsed.length,
      teamCount: forces.size,
    };
  }

  function predictMatch(homeRaw, awayRaw, model) {
    const home = normalizeTeam(homeRaw);
    const away = normalizeTeam(awayRaw);

    const fH = model.forces.get(home) || { atkH: 1, defH: 1, atkA: 1, defA: 1 };
    const fA = model.forces.get(away) || { atkH: 1, defH: 1, atkA: 1, defA: 1 };

    const lambdaH = fH.atkH * fA.defA * model.leagueHomeAvg;
    const lambdaA = fA.atkA * fH.defH * model.leagueAwayAvg;

    const avgGoals = model.leagueGoalsPerTeam || 1;
    const formH = model.form.get(home) || { gf: avgGoals, ga: avgGoals };
    const formA = model.form.get(away) || { gf: avgGoals, ga: avgGoals };

    const atkHForm = clamp(
      formH.gf / avgGoals,
      CONFIG.FORM_FACTOR_MIN,
      CONFIG.FORM_FACTOR_MAX
    );
    const defHForm = clamp(
      formH.ga / avgGoals,
      CONFIG.FORM_FACTOR_MIN,
      CONFIG.FORM_FACTOR_MAX
    );
    const atkAForm = clamp(
      formA.gf / avgGoals,
      CONFIG.FORM_FACTOR_MIN,
      CONFIG.FORM_FACTOR_MAX
    );
    const defAForm = clamp(
      formA.ga / avgGoals,
      CONFIG.FORM_FACTOR_MIN,
      CONFIG.FORM_FACTOR_MAX
    );

    let lamH = lambdaH * atkHForm * defAForm;
    let lamA = lambdaA * atkAForm * defHForm;

    const rH = model.elo.get(home) ?? CONFIG.ELO_INITIAL;
    const rA = model.elo.get(away) ?? CONFIG.ELO_INITIAL;
    const eloDiff = rH - rA;

    let adj = (eloDiff / 400) * CONFIG.ELO_GAMMA;
    adj = Math.max(-CONFIG.ELO_LAMBDA_CLAMP, Math.min(CONFIG.ELO_LAMBDA_CLAMP, adj));

    lamH *= Math.exp(adj);
    lamA *= Math.exp(-adj);

    const score = new Map();
    for (let gh = 0; gh <= CONFIG.POISSON_MAX_GOALS; gh += 1) {
      for (let ga = 0; ga <= CONFIG.POISSON_MAX_GOALS; ga += 1) {
        const p = poissonProb(lamH, gh) * poissonProb(lamA, ga);
        score.set(`${gh},${ga}`, p);
      }
    }

    const scoreAdj = applyDixonColes(score, CONFIG.DC_RHO);

    let pH = 0;
    let pD = 0;
    let pA = 0;
    for (const [k, p] of scoreAdj.entries()) {
      const [gh, ga] = k.split(",").map(Number);
      if (gh > ga) pH += p;
      else if (gh === ga) pD += p;
      else pA += p;
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
    };
  }

  const exported = {
    CONFIG,
    normalizeTeam,
    parseDateBR,
    temporalWeight,
    clamp,
    poissonProb,
    oddsFromProbsOverround,
    applyDixonColes,
    buildModel,
    predictMatch,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exported;
  } else if (typeof window !== "undefined") {
    window.BenchModel = exported;
  }
})();
