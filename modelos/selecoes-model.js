/* eslint-disable no-var */
// Selections (national teams) prediction model — extracted from bench-selecoes.html
// Exports for Node.js (tests) and browser (window.SelecoesModel)

(() => {
  const CFG = {
    // column names (Mart Jürisoo dataset)
    COL_DATE:       'date',
    COL_HOME:       'home_team',
    COL_AWAY:       'away_team',
    COL_HG:         'home_score',
    COL_AG:         'away_score',
    COL_NEUTRAL:    'neutral',

    // temporal decay (days)
    HL_ELO:         730,
    HL_POISSON:     1460,
    HL_FORM:        120,
    MIN_W_ELO:      0.10,
    MIN_W_POI:      0.25,
    MIN_W_FORM:     0.35,

    // Elo
    ELO_INITIAL:    1500,
    ELO_K_BASE:     20,
    ELO_GAMMA:      0.06,
    ELO_LAMBDA_CLAMP: 0.15,

    // Poisson / DC
    MAX_GOALS:      8,
    DC_RHO:         -0.10,  // default; overwritten by MLE in buildModel

    // form
    FORM_N:         8,
    FORM_MIN:       0.75,
    FORM_MAX:       1.25,

    // odds
    OVERROUND:      0.06,

    // training window: ignore matches before this date (empty = use all)
    TRAIN_FROM:     '1990-01-01',
  };

  // ═══════════════════════════════════════════════
  //  Team name normalisation
  // ═══════════════════════════════════════════════
  function norm(s) {
    if (!s) return '';
    let t = String(s).trim().toLowerCase()
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[-_]/g, ' ')
      .replace(/\s+/g, ' ').trim();
    const aliases = new Map([
      ['brasil',       'brazil'],
      ['usa',          'united states'],
      ['us',           'united states'],
      ['uae',          'united arab emirates'],
      ['ir iran',      'iran'],
      ['korea republic', 'south korea'],
      ['republic of korea', 'south korea'],
      ['dpr korea',    'north korea'],
      ['czech republic', 'czechia'],
      ['bosnia',       'bosnia and herzegovina'],
      ['trinidad',     'trinidad and tobago'],
    ]);
    return aliases.get(t) || t;
  }

  // ═══════════════════════════════════════════════
  //  Math utilities
  // ═══════════════════════════════════════════════
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  const LFC = [0];
  function logFact(n) {
    while (LFC.length <= n) { const k = LFC.length; LFC.push(LFC[k-1] + Math.log(k)); }
    return LFC[n];
  }

  function poissonP(lam, k) {
    if (lam <= 0) return k === 0 ? 1 : 0;
    return Math.exp(k * Math.log(lam) - lam - logFact(k));
  }

  function oddsFromProbs(ph, pd, pa, or_) {
    const s = 1 + or_, e = 1e-12;
    return { oh: 1/(Math.max(e,ph)*s), od: 1/(Math.max(e,pd)*s), oa: 1/(Math.max(e,pa)*s) };
  }

  function applyDC(scoreMap, rho) {
    const adj = new Map(scoreMap);
    const mult = (gh, ga, m) => { const k=`${gh},${ga}`; adj.set(k,(adj.get(k)||0)*m); };
    mult(0,0,1-rho); mult(1,1,1-rho); mult(1,0,1+rho); mult(0,1,1+rho);
    let sum = 0; for (const v of adj.values()) sum += v;
    if (sum <= 0) return scoreMap;
    for (const [k,v] of adj.entries()) adj.set(k, v/sum);
    return adj;
  }

  // ═══════════════════════════════════════════════
  //  Date utilities
  // ═══════════════════════════════════════════════
  function parseDate(s) {
    if (!s) return null;
    const d = new Date(String(s).trim());
    return isNaN(d) ? null : d;
  }

  function daysBetween(older, newer) {
    return Math.round((newer - older) / 86400000);
  }

  function temporalWeight(ageDays, halfLifeDays, minW) {
    if (ageDays <= 0) return 1.0;
    return Math.max(minW, Math.pow(0.5, ageDays / halfLifeDays));
  }

  // ═══════════════════════════════════════════════
  //  MLE for Dixon-Coles rho
  // ═══════════════════════════════════════════════
  function estimateRho(games, leagueHomeAvg, leagueAwayAvg, forces) {
    function llAtRho(rho) {
      let ll = 0;
      for (const g of games) {
        const fH = forces.get(g.home) || {atkH:1,defH:1,atkA:1,defA:1};
        const fA = forces.get(g.away) || {atkH:1,defH:1,atkA:1,defA:1};
        const lamH = fH.atkH * fA.defA * (g.neutral ? (leagueHomeAvg+leagueAwayAvg)/2 : leagueHomeAvg);
        const lamA = fA.atkA * fH.defH * (g.neutral ? (leagueHomeAvg+leagueAwayAvg)/2 : leagueAwayAvg);
        const p = poissonP(lamH, g.hg) * poissonP(lamA, g.ag);
        if (p <= 0) continue;
        let tau = 1;
        if      (g.hg===0 && g.ag===0) tau = 1 - lamH*lamA*rho;
        else if (g.hg===1 && g.ag===0) tau = 1 + lamA*rho;
        else if (g.hg===0 && g.ag===1) tau = 1 + lamH*rho;
        else if (g.hg===1 && g.ag===1) tau = 1 - rho;
        if (tau <= 0) continue;
        ll += Math.log(p) + Math.log(tau);
      }
      return ll;
    }
    // Grid search over [-0.5, 0.5] in steps of 0.01
    let bestRho = -0.10, bestLL = -Infinity;
    for (let r = -50; r <= 50; r++) {
      const rho = r / 100;
      const ll = llAtRho(rho);
      if (ll > bestLL) { bestLL = ll; bestRho = rho; }
    }
    return bestRho;
  }

  // ═══════════════════════════════════════════════
  //  Build model
  // ═══════════════════════════════════════════════
  function buildModel(rawRows, refDateOverride) {
    const trainFrom = CFG.TRAIN_FROM ? new Date(CFG.TRAIN_FROM) : new Date(0);
    const refDate = refDateOverride instanceof Date ? refDateOverride : new Date();

    const parsed = [];
    for (const r of rawRows) {
      const home = norm(r[CFG.COL_HOME]);
      const away = norm(r[CFG.COL_AWAY]);
      const hg   = Number(r[CFG.COL_HG]);
      const ag   = Number(r[CFG.COL_AG]);
      const date = parseDate(r[CFG.COL_DATE]);
      const neutral = String(r[CFG.COL_NEUTRAL]||'').toLowerCase() === 'true';

      if (!home || !away) continue;
      if (!Number.isFinite(hg) || !Number.isFinite(ag)) continue;
      if (!date || isNaN(date)) continue;
      if (date < trainFrom) continue;
      if (hg < 0 || ag < 0) continue;

      const ageDays = daysBetween(date, refDate);
      if (ageDays < 0) continue;

      parsed.push({
        home, away,
        hg: hg|0, ag: ag|0,
        date, ageDays, neutral,
        wElo: temporalWeight(ageDays, CFG.HL_ELO,     CFG.MIN_W_ELO),
        wPoi: temporalWeight(ageDays, CFG.HL_POISSON,  CFG.MIN_W_POI),
      });
    }

    if (parsed.length < 100) {
      throw new Error(`Dataset insuficiente após filtros (${parsed.length} jogos). Verifique as colunas.`);
    }

    // ── League averages (weighted) ──
    let lhgW=0, lagW=0, lW=0;
    const team = new Map();
    function getTeam(t) {
      if (!team.has(t)) team.set(t,{homeGFw:0,homeGAw:0,homeW:0,awayGFw:0,awayGAw:0,awayW:0});
      return team.get(t);
    }

    for (const p of parsed) {
      const w = p.wPoi;
      if (!p.neutral) {
        lhgW += p.hg * w; lagW += p.ag * w; lW += w;
        getTeam(p.home).homeGFw += p.hg*w; getTeam(p.home).homeGAw += p.ag*w; getTeam(p.home).homeW += w;
        getTeam(p.away).awayGFw += p.ag*w; getTeam(p.away).awayGAw += p.hg*w; getTeam(p.away).awayW += w;
      } else {
        const wh = w*0.5, wa = w*0.5;
        lhgW += (p.hg+p.ag)*0.5*w; lagW += (p.hg+p.ag)*0.5*w; lW += w;
        getTeam(p.home).awayGFw += p.hg*wh; getTeam(p.home).awayGAw += p.ag*wh; getTeam(p.home).awayW += wh;
        getTeam(p.away).awayGFw += p.ag*wa; getTeam(p.away).awayGAw += p.hg*wa; getTeam(p.away).awayW += wa;
      }
    }

    const leagueHomeAvg = lW > 0 ? lhgW / lW : 1.3;
    const leagueAwayAvg = lW > 0 ? lagW / lW : 1.1;
    const leagueGoalsPerTeam = (leagueHomeAvg + leagueAwayAvg) / 2;

    // ── Attack / defence forces ──
    const forces = new Map();
    for (const [t, st] of team.entries()) {
      const hGF = st.homeW > 0 ? st.homeGFw/st.homeW : NaN;
      const hGA = st.homeW > 0 ? st.homeGAw/st.homeW : NaN;
      const aGF = st.awayW > 0 ? st.awayGFw/st.awayW : NaN;
      const aGA = st.awayW > 0 ? st.awayGAw/st.awayW : NaN;

      forces.set(t, {
        atkH: (Number.isFinite(hGF) && leagueHomeAvg>0) ? hGF/leagueHomeAvg : 1.0,
        defH: (Number.isFinite(hGA) && leagueAwayAvg>0) ? hGA/leagueAwayAvg : 1.0,
        atkA: (Number.isFinite(aGF) && leagueAwayAvg>0) ? aGF/leagueAwayAvg : 1.0,
        defA: (Number.isFinite(aGA) && leagueHomeAvg>0) ? aGA/leagueHomeAvg : 1.0,
      });
    }

    // ── Recent form ──
    const recentMap = new Map();
    function pushForm(t, gf, ga, date) {
      if (!recentMap.has(t)) recentMap.set(t, []);
      recentMap.get(t).push({gf, ga, date});
    }
    for (const p of parsed) {
      pushForm(p.home, p.hg, p.ag, p.date);
      pushForm(p.away, p.ag, p.hg, p.date);
    }
    const form = new Map();
    for (const [t, list] of recentMap.entries()) {
      list.sort((a,b) => a.date - b.date);
      const recent = list.slice(-CFG.FORM_N);
      let gf=0, ga=0, ws=0;
      for (const m of recent) {
        const age = daysBetween(m.date, refDate);
        const w   = temporalWeight(age, CFG.HL_FORM, CFG.MIN_W_FORM);
        gf += m.gf*w; ga += m.ga*w; ws += w;
      }
      if (ws > 0) form.set(t, {gf:gf/ws, ga:ga/ws});
    }

    // ── Elo ──
    parsed.sort((a,b) => a.date - b.date);
    const elo = new Map();
    function getElo(t) { if (!elo.has(t)) elo.set(t, CFG.ELO_INITIAL); return elo.get(t); }

    for (const p of parsed) {
      const rc = getElo(p.home), rv = getElo(p.away);
      let result = p.hg > p.ag ? 1.0 : p.hg < p.ag ? 0.0 : 0.5;
      const expC = 1 / (1 + Math.pow(10, (rv - rc) / 400));
      const diff = Math.abs(p.hg - p.ag);
      const kBase = CFG.ELO_K_BASE * (1 + 0.5 * Math.max(0, diff-1));
      const k = kBase * p.wElo;
      elo.set(p.home, rc + k*(result - expC));
      elo.set(p.away, rv + k*((1-result) - (1-expC)));
    }

    // ── Estimate rho ──
    const dcRho = estimateRho(parsed, leagueHomeAvg, leagueAwayAvg, forces);

    // ── Per-team home advantage ──
    const homeAdv = new Map();
    for (const [t, st] of team.entries()) {
      if (st.homeW > 10 && st.awayW > 10) {
        const hRate = (st.homeGFw/st.homeW) / Math.max(0.01, leagueHomeAvg);
        const aRate = (st.awayGFw/st.awayW) / Math.max(0.01, leagueAwayAvg);
        homeAdv.set(t, clamp(hRate / Math.max(0.1, aRate), 0.85, 1.15));
      }
    }

    const teamNames = new Set(forces.keys());

    return {
      leagueHomeAvg, leagueAwayAvg, leagueGoalsPerTeam,
      forces, elo, form, homeAdv,
      dcRho,
      teamNames,
      parsedCount: parsed.length,
      teamCount:   forces.size,
      refDate,
      earliest:    parsed[0]?.date,
      latest:      parsed[parsed.length-1]?.date,
    };
  }

  // ═══════════════════════════════════════════════
  //  Predict match
  // ═══════════════════════════════════════════════
  function predict(homeRaw, awayRaw, model, neutral) {
    if (neutral === undefined) neutral = false;
    const home = norm(homeRaw), away = norm(awayRaw);
    const warnings = [];
    if (!model.teamNames.has(home)) warnings.push(`"${homeRaw}" não encontrado`);
    if (!model.teamNames.has(away)) warnings.push(`"${awayRaw}" não encontrado`);

    const fH = model.forces.get(home) || {atkH:1,defH:1,atkA:1,defA:1};
    const fA = model.forces.get(away) || {atkH:1,defH:1,atkA:1,defA:1};

    const baseH = neutral ? (model.leagueHomeAvg + model.leagueAwayAvg)/2 : model.leagueHomeAvg;
    const baseA = neutral ? (model.leagueHomeAvg + model.leagueAwayAvg)/2 : model.leagueAwayAvg;

    let lamH = fH.atkH * fA.defA * baseH;
    let lamA = fA.atkA * fH.defH * baseA;

    const avg = model.leagueGoalsPerTeam || 1;
    const fmH = model.form.get(home) || {gf:avg, ga:avg};
    const fmA = model.form.get(away) || {gf:avg, ga:avg};
    lamH *= clamp(fmH.gf/avg, CFG.FORM_MIN, CFG.FORM_MAX) * clamp(fmA.ga/avg, CFG.FORM_MIN, CFG.FORM_MAX);
    lamA *= clamp(fmA.gf/avg, CFG.FORM_MIN, CFG.FORM_MAX) * clamp(fmH.ga/avg, CFG.FORM_MIN, CFG.FORM_MAX);

    const rH = model.elo.get(home) !== undefined ? model.elo.get(home) : CFG.ELO_INITIAL;
    const rA = model.elo.get(away) !== undefined ? model.elo.get(away) : CFG.ELO_INITIAL;
    const adj = clamp((rH-rA)/400 * CFG.ELO_GAMMA, -CFG.ELO_LAMBDA_CLAMP, CFG.ELO_LAMBDA_CLAMP);
    lamH *= Math.exp(adj);
    lamA *= Math.exp(-adj);

    const score = new Map();
    for (let gh=0; gh<=CFG.MAX_GOALS; gh++)
      for (let ga=0; ga<=CFG.MAX_GOALS; ga++)
        score.set(`${gh},${ga}`, poissonP(lamH,gh)*poissonP(lamA,ga));

    const scoreAdj = applyDC(score, model.dcRho);

    let pH=0, pD=0, pA=0, bestP=-1, bestGH=0, bestGA=0;
    for (const [k,p] of scoreAdj.entries()) {
      const [gh,ga] = k.split(',').map(Number);
      if (gh>ga) pH+=p; else if (gh===ga) pD+=p; else pA+=p;
      if (p>bestP) { bestP=p; bestGH=gh; bestGA=ga; }
    }
    const tot = pH+pD+pA || 1;
    pH/=tot; pD/=tot; pA/=tot;

    const odds = oddsFromProbs(pH, pD, pA, CFG.OVERROUND);
    const max  = Math.max(pH, pD, pA);
    const pick = max===pH ? 'home' : max===pA ? 'away' : 'draw';

    return { home, away, lamH, lamA, pH, pD, pA,
      oh:odds.oh, od:odds.od, oa:odds.oa,
      pick, bestGH, bestGA, bestP,
      scoreAdj, warnings, neutral };
  }

  // ═══════════════════════════════════════════════
  //  Parse fixture input
  // ═══════════════════════════════════════════════
  function parseLine(line) {
    const raw = line.trim();
    if (!raw || raw.startsWith('#')) return null;
    const neutral = /\(neutral\)/i.test(raw);
    const clean = raw.replace(/\(neutral\)/gi, '').trim();
    const m = clean.match(/^(.+?)\s+(?:vs\.?|x|[-–—])\s+(.+)$/i);
    if (!m) return { error: true, raw };
    return { home: m[1].trim(), away: m[2].trim(), neutral, raw };
  }

  function parseFixtures(text) {
    return text.split('\n').map(parseLine).filter(Boolean);
  }

  // ═══════════════════════════════════════════════
  //  Exports
  // ═══════════════════════════════════════════════
  const exported = {
    CFG,
    norm,
    clamp,
    logFact,
    poissonP,
    oddsFromProbs,
    applyDC,
    parseDate,
    daysBetween,
    temporalWeight,
    estimateRho,
    buildModel,
    predict,
    parseLine,
    parseFixtures,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  } else if (typeof window !== 'undefined') {
    window.SelecoesModel = exported;
  }
})();
