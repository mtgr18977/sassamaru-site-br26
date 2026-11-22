// ═══════════════════════════════════════════════════════════════════════════
//  Competições suportadas + lógica de calendário (funções puras, sem DOM).
//
//  Serve ao navegador e aos testes em Node. Para acrescentar uma competição,
//  basta uma entrada em COMPETICOES e um CSV no formato do Brasileirão
//  (ID,rodata,mandante,visitante,vencedor,mandante_Placar,visitante_Placar,
//  em ordem cronológica) — o modelo (modelos/model.js) não sabe qual é a
//  divisão; tudo que muda de uma para outra mora aqui.
// ═══════════════════════════════════════════════════════════════════════════
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Competicoes = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var COMPETICOES = {
    'serie-a': {
      id: 'serie-a',
      nome: 'Série A',
      pontosCorridosDesde: 2003,   // índice 0 do dataset = 2003
      treinarAPartirDe: 2015,      // temporadas anteriores têm peso residual demais para valer o custo
      ultimaTemporadaNoCsv: 2026,  // temporada em andamento
      nTimes: 20,
      rodadas: 38,
      csv: 'datasets/campeonato-brasileiro-limpo.csv',
      dados: 'embutido',           // CSV já embutido na página (window.__EMBEDDED_CSV__)
      calendario: 'serie-a-2026',
      // faixas de posição final (1-indexado, inclusive) usadas na simulação de temporada
      zonas: { libertadores: [1, 6], sulamericana: [7, 12], rebaixamento: [17, 20] },
      promocao: null,
      // linhas do modal de cada clube (apps/clubes.html): probabilidade de terminar entre as posições de..ate (1-indexado).
      // G4/G8 são cumulativos (1º–4º, 1º–8º); Sul-Americana é a faixa 7º–12º de `zonas`.
      faixasClube: [
        { id: 'titulo', de: 1, ate: 1 }, { id: 'g4', de: 1, ate: 4 }, { id: 'g8', de: 1, ate: 8 },
        { id: 'sul', de: 7, ate: 12 }, { id: 'rebaixamento', de: 17, ate: 20 },
      ],
      taxaBase: { pH: 0.47, pD: 0.27, pA: 0.26 },   // referência do backtest: prever sempre isto não pode ganhar do modelo
      limiteLogLoss: 1.035,                          // trava de regressão (tests/backtest.test.js)
    },
    'serie-b': {
      id: 'serie-b',
      nome: 'Série B',
      pontosCorridosDesde: 2006,   // 20 clubes × 38 rodadas desde 2006
      primeiraTemporadaNoCsv: 2007, // 2006 não tem fonte com os 380 resultados
      treinarAPartirDe: 2007,      // todo o histórico (no backtest a janela muda pouco: 1,042–1,044 entre 2007 e 2020)
      rodadasSinteticas: true,     // a fonte (Wikipedia) não traz data/rodada: a ordem dos jogos na temporada é inventada
      ultimaTemporadaNoCsv: 2026,  // 2026 parcial: só os jogos já disputados
      nTimes: 20,
      rodadas: 38,
      csv: 'datasets/campeonato-brasileiro-serie-b.csv',  // gerado por scripts/importar_wikipedia_serie_b.py
      dados: 'disponivel',         // 'pendente' = CSV ainda não importado → a UI mostra o passo a passo;
                                   // 'disponivel' = CSV existe e é lido por fetch (lembre de pô-lo no precache do service-worker.js)
      calendario: 'serie-b-2026',
      zonas: { acesso: [1, 2], playoff: [3, 6], rebaixamento: [17, 20] },   // 1º–2º sobem direto; 3º–6º disputam o playoff de acesso
      // playoff (a partir de 2026): cruzamento olímpico, ida e volta; os 2 vencedores sobem → 4 promovidos no total
      playoffAcesso: { cruzamentos: [[3, 6], [4, 5]], idaEVolta: true, vagas: 2 },
      taxaBase: { pH: 0.49, pD: 0.27, pA: 0.24 },   // frequência histórica 2007–2025 (7 220 jogos)
      limiteLogLoss: 1.050,                          // medido: 1.044 (2007+); a Série B é mais parelha, o ganho sobre a taxa-base é pequeno
      promocao: 'serie-a',
      // G2 = acesso direto; G6 = acesso direto ou playoff (3º–6º); só 4 sobem no total (ver playoffAcesso)
      faixasClube: [
        { id: 'g2', de: 1, ate: 2 }, { id: 'g6', de: 1, ate: 6 }, { id: 'rebaixamento', de: 17, ate: 20 },
      ],
      // Elenco muda muito mais que na Série A (4 sobem, 4 caem, 4 chegam da C todo ano): times sem
      // histórico entram na média da liga (α=β=1, Elo 1500) com aviso. Ver ToDo.md.
      rotatividade: 'alta',
    },
  };

  var PADRAO = 'serie-a';

  function obter(id) { return COMPETICOES[id] || COMPETICOES[PADRAO]; }
  function lista() { return Object.keys(COMPETICOES).map(function (k) { return COMPETICOES[k]; }); }
  /** Índice (0 = primeira temporada do CSV) a partir do qual o modelo treina — vai em buildModel({trainFromSeason}). */
  function indiceTreino(comp) { return comp.treinarAPartirDe - (comp.primeiraTemporadaNoCsv || comp.pontosCorridosDesde); }

  // ── datas ────────────────────────────────────────────────────────────────
  /** 'AAAA-MM-DD' → Date à meia-noite LOCAL (comparar dias civis sem depender do fuso/horário de verão). */
  function dia(s) {
    if (!s) return null;
    var p = String(s).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function diaDe(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
  function diasEntre(a, b) { return Math.round((b - a) / 86400000); }

  /**
   * Situação do calendário num dado dia (o "hoje" do visitante).
   *   estado: 'em-andamento' (hoje cai dentro de uma rodada) | 'entre-rodadas' | 'antes' | 'encerrada'
   *           | 'sem-calendario' (acabaram as datas conhecidas, mas ainda há rodadas por jogar sem data)
   *   atual:   rodada em andamento hoje (ou null)
   *   proxima: primeira rodada que ainda não começou (ou null)
   *   ultima:  última rodada já encerrada com data conhecida (ou null)
   * Rodadas 'concluida' sem datas são ignoradas; "dias" usa dias civis (hoje→início = 0 significa hoje).
   */
  function statusCalendario(cal, hoje) {
    var h = diaDe(hoje || new Date());
    var datadas = cal.rodadas.filter(function (r) { return r.inicio && r.fim; }).map(function (r) {
      return { n: r.n, status: r.status, inicio: dia(r.inicio), fim: dia(r.fim), inicioStr: r.inicio, fimStr: r.fim };
    });
    var atual = null, proxima = null, ultima = null;
    datadas.forEach(function (r) {
      // rodadas podem se sobrepor (ex.: a 36ª termina 25/11 e a 37ª começa 24/11): vale a de menor número, que ainda tem jogo
      if (r.inicio <= h && h <= r.fim) { if (!atual || r.n < atual.n) atual = r; }
      else if (r.inicio > h && (!proxima || r.inicio < proxima.inicio)) proxima = r;
      else if (r.fim < h && (!ultima || r.fim > ultima.fim)) ultima = r;
    });
    var seguinte = null; // a rodada depois da atual (quando há uma em andamento)
    if (atual) datadas.forEach(function (r) { if (r.n > atual.n && (!seguinte || r.n < seguinte.n)) seguinte = r; });
    var alvo = atual ? seguinte : proxima;
    var estado = atual ? 'em-andamento' : proxima ? (ultima ? 'entre-rodadas' : 'antes') : 'encerrada';
    // acabaram as rodadas COM data, mas o calendário ainda lista rodadas por jogar sem data (a CBF divulga em blocos)
    if (estado === 'encerrada' && cal.rodadas.some(function (r) { return r.status !== 'concluida' && !(r.inicio && r.fim); })) estado = 'sem-calendario';
    return {
      estado: estado,
      hoje: h,
      atual: atual,
      ultima: ultima,
      proxima: alvo,                                         // próxima rodada a começar
      diasAteProxima: alvo ? diasEntre(h, alvo.inicio) : null,
      diasParaFimAtual: atual ? diasEntre(h, atual.fim) : null,
      // rodada em foco para a interface: a que está rolando; senão a próxima
      foco: atual || alvo,
      diasAteFoco: (atual || alvo) ? Math.max(0, diasEntre(h, (atual || alvo).inicio)) : null,
    };
  }

  function jogosDaRodada(cal, n) { return cal.jogos.filter(function (j) { return j.rodada === n; }); }

  // ── Título garantido ───────────────────────────────────────────────────────
  // `tabela`: classificação JÁ ordenada pelos critérios da CBF (pontos, vitórias, saldo, gols pró), cada linha { t, pts, w, played }.
  // O líder é campeão se nenhum rival consegue alcançá-lo nem empatar com vantagem: o rival termina, no máximo, com
  // pts + 3×jogos que faltam; empatando em pontos, o líder só está a salvo se já tem MAIS vitórias do que o rival pode somar
  // (vitórias é o 1º desempate; saldo de gols nunca é garantido). Conservador: ignora que o próprio líder ainda vai pontuar.
  function campeaoAntecipado(tabela, rodadas) {
    if (!tabela || !tabela.length) return null;
    var l = tabela[0], faltam = function (r) { return Math.max(0, rodadas - r.played); };
    if (tabela.every(function (r) { return faltam(r) === 0; })) return { clube: l.t, encerrada: true, faltam: 0, vice: tabela[1] ? tabela[1].t : null, vantagem: tabela[1] ? l.pts - tabela[1].pts : null };
    for (var i = 1; i < tabela.length; i++) {
      var r = tabela[i], maxPts = r.pts + 3 * faltam(r), maxV = r.w + faltam(r);
      if (!(l.pts > maxPts || (l.pts === maxPts && l.w > maxV))) return null;
    }
    return { clube: l.t, encerrada: false, faltam: faltam(l), vice: tabela[1] ? tabela[1].t : null, vantagem: tabela[1] ? l.pts - tabela[1].pts : null };
  }

  // ── Playoff de acesso (mata-mata de ida e volta) ───────────────────────────
  // confronto = { melhor, pior, jogos: [{ fase, mandante, visitante, placar: null | [golsMandante, golsVisitante] }] }
  // O melhor colocado joga a volta em casa; empate no agregado → sobe o melhor colocado (não há prorrogação nem pênaltis).
  function resumoPlayoff(conf) {
    var gols = {}; gols[conf.melhor] = 0; gols[conf.pior] = 0;
    var jogados = 0;
    conf.jogos.forEach(function (j) {
      if (!j.placar) return;
      jogados++;
      gols[j.mandante] += j.placar[0];
      gols[j.visitante] += j.placar[1];
    });
    var total = conf.jogos.length, decidido = jogados === total;
    var classificado = null, porCriterio = false;
    if (decidido) {
      if (gols[conf.melhor] === gols[conf.pior]) { classificado = conf.melhor; porCriterio = true; }
      else classificado = gols[conf.melhor] > gols[conf.pior] ? conf.melhor : conf.pior;
    }
    return {
      estado: decidido ? 'decidido' : jogados === 0 ? 'a-jogar' : 'em-andamento',
      jogados: jogados, total: total,
      agregado: gols,                       // { [clube]: gols no agregado até agora }
      classificado: classificado,           // quem sobe (null enquanto não decidido)
      porCriterio: porCriterio,             // true se subiu só por ser o melhor colocado (empate no agregado)
    };
  }

  // Jogos do playoff ainda sem placar, da fase (ida ou volta) mais próxima — é o que o campo de jogos da Série B carrega.
  // Devolve null quando todos os jogos já têm placar.
  function proximosJogosPlayoff(playoff) {
    if (!playoff) return null;
    var pend = [];
    playoff.confrontos.forEach(function (c) { c.jogos.forEach(function (j) { if (!j.placar) pend.push(j); }); });
    if (!pend.length) return null;
    var primeira = pend.map(function (j) { return j.data; }).sort()[0];
    var fase = pend.filter(function (j) { return j.data === primeira; })[0].fase;
    var jogos = pend.filter(function (j) { return j.fase === fase; });
    jogos.sort(function (a, b) { return (a.data + (a.hora || '')) < (b.data + (b.hora || '')) ? -1 : 1; });
    return { fase: fase, data: jogos[0].data, jogos: jogos };
  }

  return {
    COMPETICOES: COMPETICOES, PADRAO: PADRAO, obter: obter, lista: lista, indiceTreino: indiceTreino,
    dia: dia, diasEntre: diasEntre, statusCalendario: statusCalendario, jogosDaRodada: jogosDaRodada,
    resumoPlayoff: resumoPlayoff, proximosJogosPlayoff: proximosJogosPlayoff, campeaoAntecipado: campeaoAntecipado,
  };
});
