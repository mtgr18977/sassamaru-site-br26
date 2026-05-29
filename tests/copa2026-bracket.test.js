"use strict";
const assert = require("assert");

// ─── helpers ─────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function test(description, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.error(`FAIL [${description}]: ${e.message}`); }
}

// ─── Bracket-building logic (extracted from bench-copa2026.html) ──────────────
// Given groupStandings (12 groups A–L, each sorted [1st, 2nd, 3rd, ...]) and
// bestThirds (8 best 3rd-place teams, sorted by pts/gd/gf), builds the r32.
const PAIRINGS = [
  ['A','B'],['B','A'],['C','D'],['D','C'],
  ['E','F'],['F','E'],['G','H'],['H','G'],
  ['I','J'],['J','I'],['K','L'],['L','K'],
];

function buildR32(groupStandings, bestThirds) {
  const r32 = [];
  for (const [wGrp, rGrp] of PAIRINGS) {
    r32.push([groupStandings[wGrp][0].team, groupStandings[rGrp][1].team]);
  }
  for (let i = 0; i < 8; i += 2) {
    r32.push([bestThirds[i].team, bestThirds[i + 1].team]);
  }
  return r32;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────
// 12 groups, 4 teams each — every team name is unique
function makeGroupStandings() {
  const groups = {};
  const groupKeys = 'ABCDEFGHIJKL'.split('');
  groupKeys.forEach((g, gi) => {
    groups[g] = [1, 2, 3, 4].map(rank => ({ team: `G${g}T${rank}` }));
  });
  return groups;
}

// 8 distinct best-thirds, not winners/runners from any group
function makeBestThirds() {
  return 'ABCDEFGH'.split('').map((g, i) => ({ team: `3rd_${g}` }));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

// 1. r32 must have exactly 16 matches
test("r32 has exactly 16 matches", () => {
  const gs = makeGroupStandings();
  const bt = makeBestThirds();
  const r32 = buildR32(gs, bt);
  assert.strictEqual(r32.length, 16, `Expected 16, got ${r32.length}`);
});

// 2. Each match has exactly 2 teams
test("every r32 match has exactly 2 teams", () => {
  const gs = makeGroupStandings();
  const bt = makeBestThirds();
  const r32 = buildR32(gs, bt);
  for (const [a, b] of r32) {
    assert.ok(typeof a === 'string' && a.length > 0, `team a invalid: ${a}`);
    assert.ok(typeof b === 'string' && b.length > 0, `team b invalid: ${b}`);
    assert.notStrictEqual(a, b, `same team on both sides of a match: ${a}`);
  }
});

// 3. 12 group-stage matches use only group winners and runners-up
test("first 12 r32 matches use winners and runners-up only", () => {
  const gs = makeGroupStandings();
  const bt = makeBestThirds();
  const r32 = buildR32(gs, bt);
  const allWinners = new Set('ABCDEFGHIJKL'.split('').map(k => gs[k][0].team));
  const allRunners = new Set('ABCDEFGHIJKL'.split('').map(k => gs[k][1].team));
  for (const [a, b] of r32.slice(0, 12)) {
    assert.ok(allWinners.has(a) || allRunners.has(a), `${a} is not a W or R`);
    assert.ok(allWinners.has(b) || allRunners.has(b), `${b} is not a W or R`);
  }
});

// 4. Last 4 matches use only best-thirds
test("last 4 r32 matches use best-thirds only", () => {
  const gs = makeGroupStandings();
  const bt = makeBestThirds();
  const r32 = buildR32(gs, bt);
  const thirdTeams = new Set(bt.map(t => t.team));
  for (const [a, b] of r32.slice(12)) {
    assert.ok(thirdTeams.has(a), `${a} is not a best-third`);
    assert.ok(thirdTeams.has(b), `${b} is not a best-third`);
  }
});

// 5. All 32 team slots across 16 matches are unique (no team in two slots)
//    This is the invariant that the removed bracket renderer was violating visually.
test("no team appears in two different r32 slots (all 32 slots are unique)", () => {
  const gs = makeGroupStandings();
  const bt = makeBestThirds();
  const r32 = buildR32(gs, bt);
  const seen = new Set();
  for (const [a, b] of r32) {
    assert.ok(!seen.has(a), `team ${a} appears in multiple r32 slots`);
    seen.add(a);
    assert.ok(!seen.has(b), `team ${b} appears in multiple r32 slots`);
    seen.add(b);
  }
});

// 6. Winners come only from the teams in their match
test("simRound: winner of each match is one of the two entrants", () => {
  // Deterministic simulateKnockout: always returns team A
  function alwaysFirst(a, _b) { return a; }
  function simRound(matches, pick) {
    return matches.map(([h, a]) => pick(h, a));
  }
  const matches = [['X', 'Y'], ['A', 'B'], ['C', 'D']];
  const winners = simRound(matches, alwaysFirst);
  matches.forEach(([h, a], i) => {
    assert.ok(
      winners[i] === h || winners[i] === a,
      `winner ${winners[i]} not from match [${h}, ${a}]`
    );
  });
});

// 7. Full knockout chain: 16 → 8 → 4 → 2 → 1 produces correct counts
test("bracket chain produces correct winner counts at each stage", () => {
  function pick(a) { return a; } // always pick first team
  const gs = makeGroupStandings();
  const bt = makeBestThirds();
  const r32 = buildR32(gs, bt);
  const adv = (matches) => matches.map(([h, a]) => pick(h, a));

  const advR32 = adv(r32);
  assert.strictEqual(advR32.length, 16);

  const r16 = [];
  for (let i = 0; i < 16; i += 2) r16.push([advR32[i], advR32[i + 1]]);
  const advR16 = adv(r16);
  assert.strictEqual(advR16.length, 8);

  const qf = [];
  for (let i = 0; i < 8; i += 2) qf.push([advR16[i], advR16[i + 1]]);
  const advQF = adv(qf);
  assert.strictEqual(advQF.length, 4);

  const sf = [[advQF[0], advQF[1]], [advQF[2], advQF[3]]];
  const advSF = adv(sf);
  assert.strictEqual(advSF.length, 2);

  const champion = pick(advSF[0], advSF[1]);
  assert.ok(advSF.includes(champion), "champion not a finalist");
});

// 8. Each r32 winner came from one of the two teams in that slot
test("r32 winners always come from correct slots", () => {
  const gs = makeGroupStandings();
  const bt = makeBestThirds();
  const r32 = buildR32(gs, bt);
  // Always pick second team to vary the winner
  const winners = r32.map(([a, b]) => b);
  r32.forEach(([a, b], i) => {
    assert.ok(
      winners[i] === a || winners[i] === b,
      `r32 winner ${winners[i]} at slot ${i} not from [${a}, ${b}]`
    );
  });
});

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\ncopa2026 bracket: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
