/* Calendário das competições — dados editados à mão a cada atualização.
 *
 * Por que um arquivo e não uma consulta ao ge.globo.com / Wikipedia: o navegador não consegue ler essas
 * páginas (CORS/bloqueio) e o app precisa funcionar offline. Os dados vêm da tabela detalhada da CBF
 * (divulgada em blocos de 4 rodadas), conferida em ge, valorfinal e Wikipedia. O app compara estas datas
 * com o relógio do dispositivo do visitante (ver modelos/competicoes.js → statusCalendario).
 *
 * status:  concluida   → rodada encerrada (datas só se forem confiáveis; rodadas com jogos adiados ficam sem data)
 *          confirmada  → datas detalhadas pela CBF
 *          provisoria  → datas ainda sujeitas a mudança (Copa do Brasil, Libertadores, Sul-Americana)
 *          semdata     → rodada por jogar cuja data ainda não foi divulgada
 * Datas em 'AAAA-MM-DD' (dia civil de Brasília; o app compara com o dia civil local do visitante).
 */
(function (root, factory) {
  var data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  if (root) root.CALENDARIOS = data;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  var C = 'concluida', K = 'confirmada', P = 'provisoria', S = 'semdata';
  return {
    'serie-a-2026': {
      competicao: 'serie-a',
      temporada: 2026,
      atualizadoEm: '2026-11-22',
      fonte: 'CBF (tabela detalhada), conferida em valorfinal.com.br e Wikipedia',
      rodadas: [
        { n: 1,  inicio: '2026-01-28', fim: '2026-01-29', status: C },
        { n: 2,  inicio: null, fim: null, status: C },   // inclui jogos adiados
        { n: 3,  inicio: '2026-02-10', fim: '2026-02-12', status: C },
        { n: 4,  inicio: null, fim: null, status: C },   // inclui jogos adiados
        { n: 5,  inicio: null, fim: null, status: C },   // inclui jogos adiados
        { n: 6,  inicio: '2026-03-14', fim: '2026-03-16', status: C },
        { n: 7,  inicio: '2026-03-18', fim: '2026-03-19', status: C },
        { n: 8,  inicio: '2026-03-21', fim: '2026-03-22', status: C },
        { n: 9,  inicio: '2026-04-01', fim: '2026-04-02', status: C },
        { n: 10, inicio: '2026-04-04', fim: '2026-04-05', status: C },
        { n: 11, inicio: '2026-04-11', fim: '2026-04-12', status: C },
        { n: 12, inicio: '2026-04-18', fim: '2026-04-19', status: C },
        { n: 13, inicio: '2026-04-25', fim: '2026-04-26', status: C },
        { n: 14, inicio: '2026-05-02', fim: '2026-05-03', status: C },
        { n: 15, inicio: '2026-05-09', fim: '2026-05-10', status: C },
        { n: 16, inicio: '2026-05-16', fim: '2026-05-17', status: C },
        { n: 17, inicio: '2026-05-23', fim: '2026-05-25', status: C },
        { n: 18, inicio: '2026-05-30', fim: '2026-05-31', status: C },
        { n: 19, inicio: '2026-07-16', fim: '2026-07-23', status: C },
        { n: 20, inicio: '2026-07-25', fim: '2026-07-26', status: C },
        { n: 21, inicio: null, fim: null, status: C },   // 3 jogos adiados jogados em set/out; 1 pendente
        { n: 22, inicio: '2026-08-08', fim: '2026-08-09', status: C },
        { n: 23, inicio: '2026-08-15', fim: '2026-08-16', status: C },
        { n: 24, inicio: '2026-08-22', fim: '2026-08-24', status: C },
        { n: 25, inicio: '2026-08-29', fim: '2026-08-31', status: C },
        { n: 26, inicio: '2026-09-05', fim: '2026-09-07', status: C },
        { n: 27, inicio: '2026-09-11', fim: '2026-09-14', status: C },
        { n: 28, inicio: '2026-09-19', fim: '2026-09-20', status: C },
        { n: 29, inicio: '2026-10-07', fim: '2026-10-08', status: C },
        { n: 30, inicio: '2026-10-10', fim: '2026-10-12', status: C },
        { n: 31, inicio: '2026-10-16', fim: '2026-10-19', status: C },
        { n: 32, inicio: '2026-10-23', fim: '2026-10-26', status: C },
        { n: 33, inicio: '2026-10-28', fim: '2026-10-31', status: C },
        { n: 34, inicio: '2026-11-02', fim: '2026-11-06', status: C },
        { n: 35, inicio: '2026-11-14', fim: '2026-11-19', status: C },
        { n: 36, inicio: '2026-11-21', fim: '2026-11-25', status: K },
        { n: 37, inicio: '2026-11-24', fim: '2026-11-29', status: K },
        { n: 38, inicio: '2026-12-02', fim: '2026-12-02', status: K },
      ],
      // jogos atrasados de rodadas já encerradas (nenhum: Chapecoense 0×2 Vasco, da 21ª, foi jogado)
      pendentes: [
      ],
      // jogos das próximas rodadas (horário de Brasília) — só as rodadas já detalhadas pela CBF
      // (36ª: tabela das rodadas 35 e 36, de 30/10; 37ª e 38ª: tabela de 06/11)
      jogos: [
        { rodada: 36, data: '2026-11-22', hora: '16:00', mandante: 'Athletico Paranaense', visitante: 'Remo' },
        { rodada: 36, data: '2026-11-22', hora: '18:30', mandante: 'Fluminense', visitante: 'Mirassol' },
        { rodada: 36, data: '2026-11-22', hora: '19:30', mandante: 'Bragantino', visitante: 'Vasco' },
        { rodada: 36, data: '2026-11-23', hora: '19:30', mandante: 'Internacional', visitante: 'Vitória' },
        { rodada: 36, data: '2026-11-23', hora: '20:00', mandante: 'Botafogo', visitante: 'São Paulo' },
        { rodada: 36, data: '2026-11-23', hora: '21:00', mandante: 'Santos', visitante: 'Grêmio' },
        { rodada: 36, data: '2026-11-25', hora: '20:00', mandante: 'Atlético Mineiro', visitante: 'Corinthians' },
        { rodada: 37, data: '2026-11-24', hora: '18:00', mandante: 'Chapecoense', visitante: 'Palmeiras' },
        { rodada: 37, data: '2026-11-26', hora: '20:00', mandante: 'São Paulo', visitante: 'Remo' },
        { rodada: 37, data: '2026-11-27', hora: '20:00', mandante: 'Fluminense', visitante: 'Cruzeiro' },
        { rodada: 37, data: '2026-11-28', hora: '21:00', mandante: 'Botafogo', visitante: 'Bahia' },
        { rodada: 37, data: '2026-11-29', hora: '16:00', mandante: 'Coritiba', visitante: 'Flamengo' },
        { rodada: 37, data: '2026-11-29', hora: '16:00', mandante: 'Vitória', visitante: 'Santos' },
        { rodada: 37, data: '2026-11-29', hora: '18:30', mandante: 'Corinthians', visitante: 'Grêmio' },
        { rodada: 37, data: '2026-11-29', hora: '18:30', mandante: 'Internacional', visitante: 'Bragantino' },
        { rodada: 37, data: '2026-11-29', hora: '18:30', mandante: 'Mirassol', visitante: 'Athletico Paranaense' },
        { rodada: 37, data: '2026-11-29', hora: '19:30', mandante: 'Atlético Mineiro', visitante: 'Vasco' },
        { rodada: 38, data: '2026-12-02', hora: '21:30', mandante: 'Athletico Paranaense', visitante: 'São Paulo' },
        { rodada: 38, data: '2026-12-02', hora: '21:30', mandante: 'Bahia', visitante: 'Atlético Mineiro' },
        { rodada: 38, data: '2026-12-02', hora: '21:30', mandante: 'Bragantino', visitante: 'Fluminense' },
        { rodada: 38, data: '2026-12-02', hora: '21:30', mandante: 'Cruzeiro', visitante: 'Internacional' },
        { rodada: 38, data: '2026-12-02', hora: '21:30', mandante: 'Flamengo', visitante: 'Chapecoense' },
        { rodada: 38, data: '2026-12-02', hora: '21:30', mandante: 'Grêmio', visitante: 'Mirassol' },
        { rodada: 38, data: '2026-12-02', hora: '21:30', mandante: 'Palmeiras', visitante: 'Coritiba' },
        { rodada: 38, data: '2026-12-02', hora: '21:30', mandante: 'Remo', visitante: 'Corinthians' },
        { rodada: 38, data: '2026-12-02', hora: '21:30', mandante: 'Santos', visitante: 'Botafogo' },
        { rodada: 38, data: '2026-12-02', hora: '21:30', mandante: 'Vasco', visitante: 'Vitória' },
      ],
    },
    'serie-b-2026': {
      competicao: 'serie-b',
      temporada: 2026,
      atualizadoEm: '2026-11-22',
      fonte: 'CBF (tabela básica); resultados conferidos na Wikipedia (pt e en)',
      rodadas: [
        { n: 1, inicio: null, fim: null, status: C },
        { n: 2, inicio: null, fim: null, status: C },
        { n: 3, inicio: null, fim: null, status: C },
        { n: 4, inicio: null, fim: null, status: C },
        { n: 5, inicio: null, fim: null, status: C },
        { n: 6, inicio: null, fim: null, status: C },
        { n: 7, inicio: null, fim: null, status: C },
        { n: 8, inicio: null, fim: null, status: C },
        { n: 9, inicio: null, fim: null, status: C },
        { n: 10, inicio: null, fim: null, status: C },
        { n: 11, inicio: null, fim: null, status: C },
        { n: 12, inicio: null, fim: null, status: C },
        { n: 13, inicio: null, fim: null, status: C },
        { n: 14, inicio: null, fim: null, status: C },
        { n: 15, inicio: null, fim: null, status: C },
        { n: 16, inicio: null, fim: null, status: C },
        { n: 17, inicio: null, fim: null, status: C },
        { n: 18, inicio: null, fim: null, status: C },
        { n: 19, inicio: null, fim: null, status: C },
        { n: 20, inicio: null, fim: null, status: C },
        { n: 21, inicio: null, fim: null, status: C },
        { n: 22, inicio: null, fim: null, status: C },
        { n: 23, inicio: null, fim: null, status: C },
        { n: 24, inicio: null, fim: null, status: C },
        { n: 25, inicio: null, fim: null, status: C },
        { n: 26, inicio: null, fim: null, status: C },
        { n: 27, inicio: null, fim: null, status: C },
        { n: 28, inicio: null, fim: null, status: C },
        { n: 29, inicio: null, fim: null, status: C },
        { n: 30, inicio: null, fim: null, status: C },
        { n: 31, inicio: null, fim: null, status: C },
        { n: 32, inicio: '2026-10-06', fim: '2026-10-08', status: C },
        { n: 33, inicio: '2026-10-11', fim: '2026-10-13', status: C },
        { n: 34, inicio: '2026-10-16', fim: '2026-10-19', status: C },
        { n: 35, inicio: '2026-10-23', fim: '2026-10-25', status: C },
        { n: 36, inicio: '2026-10-30', fim: '2026-11-01', status: C },
        { n: 37, inicio: '2026-11-07', fim: '2026-11-08', status: C },
        { n: 38, inicio: '2026-11-14', fim: '2026-11-14', status: C },
      ],
      pendentes: [
      ],
      // temporada regular encerrada em 14/11 (38 rodadas); o playoff de acesso (3º–6º) fica fora do CSV e do modelo de pontos corridos
      jogos: [
      ],
      // Playoff de acesso: 3º × 6º e 4º × 5º, ida e volta; o melhor colocado joga a volta em casa e, se empatar no
      // agregado, é ele quem sobe. Os dois vencedores completam os 4 promovidos.
      // COMO ATUALIZAR: depois de cada jogo, troque `placar: null` por `[gols do mandante, gols do visitante]`
      // (mandante = o clube da chave `mandante` daquele jogo). Rode `npm run test:competicoes` e bump o CACHE_VERSION.
      // `melhor`/`pior` = quem ficou à frente / atrás na classificação da fase regular (campo `pos` = colocações).
      playoff: {
        nome: 'Playoff de acesso',
        fonte: 'CBF (tabela dos playoffs, de 16/11); jogos conferidos na Wikipedia (en)',
        confrontos: [
          { id: 'A', pos: [3, 6], melhor: 'Vila Nova', pior: 'Atlético-GO', jogos: [
            { fase: 'ida',   data: '2026-11-22', hora: '18:30', mandante: 'Atlético-GO', visitante: 'Vila Nova', estadio: 'Antônio Accioly, Goiânia', placar: null },
            { fase: 'volta', data: '2026-11-27', hora: '20:00', mandante: 'Vila Nova', visitante: 'Atlético-GO', estadio: 'Onésio Brasileiro Alvarenga, Goiânia', placar: null },
          ] },
          { id: 'B', pos: [4, 5], melhor: 'Fortaleza', pior: 'Criciúma', jogos: [
            { fase: 'ida',   data: '2026-11-22', hora: '16:00', mandante: 'Criciúma', visitante: 'Fortaleza', estadio: 'Heriberto Hülse, Criciúma', placar: null },
            { fase: 'volta', data: '2026-11-28', hora: '20:00', mandante: 'Fortaleza', visitante: 'Criciúma', estadio: 'Castelão, Fortaleza', placar: null },
          ] },
        ],
      },
    },
  };
});
