// ═══════════════════════════════════════════════════════════════════════════
//  Simulação Monte Carlo do que falta da temporada (funções puras, sem DOM).
//
//  Serve ao navegador (apps/clubes.html) e aos testes em Node. Parte da tabela
//  real (`computeSeasonState`) e sorteia só os jogos por disputar, a partir da
//  grade de placares de `predictMatch` — a mesma ideia de simulateSeason() em
//  simulacoes/bench-brasileirao2026.html, mas sem depender da página e com
//  semente fixa, para o número não mudar a cada visita.
// ═══════════════════════════════════════════════════════════════════════════
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Simulacao = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /** Gerador pseudoaleatório com semente (mulberry32): mesma semente, mesma sequência. */
  function rngComSemente(semente) {
    var a = semente >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Distribuição acumulada de placares de cada jogo restante (λ é fixo: calcula uma vez, não por simulação). */
  function distribuicoes(Model, model, restantes) {
    return restantes.map(function (par) {
      var sa = Model.predictMatch(par[0], par[1], model).scoreAdj;
      var n = sa.size, cum = new Float64Array(n), hg = new Uint8Array(n), ag = new Uint8Array(n), acc = 0, i = 0;
      sa.forEach(function (p, k) {
        acc += p; cum[i] = acc;
        var c = k.indexOf(',');
        hg[i] = +k.slice(0, c); ag[i] = +k.slice(c + 1);
        i++;
      });
      cum[n - 1] = 1;   // evita cair fora da grade por erro de ponto flutuante
      return { home: par[0], away: par[1], cum: cum, hg: hg, ag: ag, n: n };
    });
  }

  /**
   * @param {object} Model  modelos/model.js (predictMatch)
   * @param {object} model  saída de buildModel
   * @param {object} estado saída de computeSeasonState (teams, standings, remaining)
   * @param {{n?:number, semente?:number, rng?:function}} [opts]
   * @returns {{n:number, times:Object<string,{hist:number[], pontos:number, posicao:number}>}}
   *   hist[i] = nº de simulações em que o clube terminou na posição i+1; pontos/posicao = médias finais.
   */
  function simularTemporada(Model, model, estado, opts) {
    opts = opts || {};
    var N = opts.n || 10000, rng = opts.rng || rngComSemente(opts.semente == null ? 2026 : opts.semente);
    var times = estado.teams, nT = times.length;
    var dist = distribuicoes(Model, model, estado.remaining);
    var idx = {}; times.forEach(function (t, i) { idx[t] = i; });
    var base = times.map(function (t) { var s = estado.standings.get(t); return { pts: s.pts, w: s.w || 0, gd: s.gd, gf: s.gf }; });
    var hist = times.map(function () { return new Array(nT).fill(0); });
    var somaPts = new Array(nT).fill(0), somaPos = new Array(nT).fill(0);
    var pts = new Array(nT), vit = new Array(nT), sg = new Array(nT), gp = new Array(nT), ordem = new Array(nT);

    for (var s = 0; s < N; s++) {
      for (var i = 0; i < nT; i++) { pts[i] = base[i].pts; vit[i] = base[i].w; sg[i] = base[i].gd; gp[i] = base[i].gf; ordem[i] = i; }
      for (var f = 0; f < dist.length; f++) {
        var d = dist[f], r = rng(), k = 0;
        while (k < d.n - 1 && r >= d.cum[k]) k++;
        var h = idx[d.home], a = idx[d.away], hg = d.hg[k], ag = d.ag[k];
        if (hg > ag) { pts[h] += 3; vit[h]++; } else if (hg < ag) { pts[a] += 3; vit[a]++; } else { pts[h]++; pts[a]++; }
        sg[h] += hg - ag; sg[a] += ag - hg; gp[h] += hg; gp[a] += ag;
      }
      // critérios da CBF: pontos, vitórias, saldo de gols, gols pró (empate total: sorteio)
      var sorteio = ordem.map(function () { return rng(); });
      ordem.sort(function (x, y) { return pts[y] - pts[x] || vit[y] - vit[x] || sg[y] - sg[x] || gp[y] - gp[x] || sorteio[x] - sorteio[y]; });
      for (var p = 0; p < nT; p++) { hist[ordem[p]][p]++; somaPos[ordem[p]] += p + 1; }
      for (var j = 0; j < nT; j++) somaPts[j] += pts[j];
    }
    var out = {};
    times.forEach(function (t, i) { out[t] = { hist: hist[i], pontos: somaPts[i] / N, posicao: somaPos[i] / N }; });
    return { n: N, times: out };
  }

  /** Probabilidade (0–1) de terminar entre as posições de..ate (1-indexado, inclusive). */
  function probabilidade(sim, time, de, ate) {
    var h = sim.times[time].hist, c = 0;
    for (var p = de; p <= ate; p++) c += h[p - 1];
    return c / sim.n;
  }

  return { rngComSemente: rngComSemente, simularTemporada: simularTemporada, probabilidade: probabilidade };
});
