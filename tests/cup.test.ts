import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import {
  advanceDay, challengeOptions, closeSeason, completeRound, isCupDay, isMatchDay, myClubId, myShootout, newWorld,
  prepareRound, simulateRound, startCareer, type Career,
} from '../src/game/career';
import { CUP_PRIZE, CUP_ROUNDS, aliveInCup, cupStatus, shootout } from '../src/game/cup';
import { createMatch, runToEnd, toOutcome } from '../src/sports/football/engine';

function start(seed: number, type: 'baixo' | 'crescimento' | 'pressao' = 'baixo') {
  const c0 = newWorld(seed);
  const o = challengeOptions(c0, type)[0]!;
  return startCareer(seed, 'Teste', type, o.clubId);
}

/** Joga até o encerramento, simulando tudo. */
function playSeason(c: Career) {
  let guard = 0;
  while (c.phase !== 'encerramento' && guard++ < 2000) {
    if (isMatchDay(c)) simulateRound(c); else advanceDay(c);
  }
}

describe('copa', () => {
  it('todos os 48 clubes entram; 16 direto na 2ª fase; mando do menor', () => {
    const c = newWorld(3);
    const cup = c.cup!;
    const first = cup.ties[0]!;
    expect(first).toHaveLength(16);
    expect(cup.byes).toHaveLength(16);
    const ids = new Set([...first.flatMap((t) => [t.home, t.away]), ...cup.byes]);
    expect(ids.size).toBe(48);
    const div = (id: string) => c.season.divisions.findIndex((d) => d.teamIds.includes(id));
    for (const t of first) expect(div(t.home)).toBeGreaterThanOrEqual(div(t.away));
    for (const id of c.season.divisions[0]!.teamIds) expect(cup.byes).toContain(id);
    // as fases caem em quartas-feiras, entre as rodadas
    for (const d of cup.dates) expect(new Date(d + 'T00:00:00Z').getUTCDay()).toBe(3);
    expect(cup.dates).toEqual([...cup.dates].sort());
  });

  it('a temporada inteira tem campeão, prêmios e títulos', () => {
    const c = start(5);
    const me = myClubId(c);
    playSeason(c);
    const cup = c.cup!;
    expect(cup.round).toBe(CUP_ROUNDS.length);
    expect(cup.ties.map((r) => r.length)).toEqual([16, 16, 8, 4, 2, 1]);
    for (const r of cup.ties) for (const t of r) {
      expect(t.winner).toBeDefined();
      if (t.hs === t.as) { expect(t.pens).toBeDefined(); expect(t.pens![0]).not.toBe(t.pens![1]); }
    }
    const champ = c.clubs[cup.championId!]!;
    expect(champ.titles.some((x) => x.competition === 'Copa Mestres' && x.year === cup.year)).toBe(true);
    const st = cupStatus(cup, me)!;
    expect(st).not.toBeNull();
    expect(c.news.some((n) => n.text.includes('Copa Mestres'))).toBe(true);
    // não deixa a copa no meio do caminho e cria a do ano seguinte
    closeSeason(c);
    expect(c.cup!.year).toBe(cup.year + 1);
    expect(c.cup!.round).toBe(0);
  });

  it('dia de copa para o seu jogo; eliminado, a copa segue sozinha', () => {
    const c = start(7);
    const me = myClubId(c);
    let cupDays = 0;
    let guard = 0;
    while (c.phase !== 'encerramento' && guard++ < 2000) {
      if (isCupDay(c)) {
        cupDays++;
        const before = c.clubs[me]!.budget;
        const ledger = c.ledger.prizes;
        const prep = prepareRound(c);
        expect(prep.cup).toBe(c.cup!.round);
        expect(prep.others.every((m) => m.divisionIndex === -1)).toBe(true);
        runToEnd(prep.match, new Rng(prep.matchRngState));
        const o = toOutcome(prep.match);
        const sh = myShootout(prep, o);
        const phase = c.cup!.round;
        const rec = completeRound(c, prep, o);
        expect(rec.cup).toBe(phase);
        const mine = rec.matches.find((m) => m.home === me || m.away === me)!;
        if (sh) expect(mine.pens).toEqual([sh.home, sh.away]);
        if (aliveInCup(c.cup, me) || c.cup!.championId === me) expect(c.ledger.prizes - ledger).toBe(CUP_PRIZE[phase]);
        void before;
      } else if (isMatchDay(c)) simulateRound(c);
      else advanceDay(c);
    }
    expect(cupDays).toBeGreaterThan(0);
    expect(c.cup!.championId).toBeDefined();
  });

  it('copa não conta na artilharia nem nos jogos do campeonato', () => {
    const c = start(9);
    const me = myClubId(c);
    let guard = 0;
    while (!isCupDay(c) && guard++ < 400) { if (isMatchDay(c)) simulateRound(c); else advanceDay(c); }
    expect(isCupDay(c)).toBe(true);
    const apps = () => c.clubs[me]!.players.reduce((a, p) => a + p.stats.apps, 0);
    const before = apps();
    simulateRound(c);
    expect(apps()).toBe(before);
  });

  it('pênaltis: alguém sempre vence e a série é coerente', () => {
    const c = newWorld(11);
    const [a, b] = Object.values(c.clubs);
    for (let s = 0; s < 40; s++) {
      const m = createMatch(a!, b!, new Rng(s));
      const r = shootout(m, new Rng(1000 + s));
      expect(r.home).not.toBe(r.away);
      expect(r.kicks.filter((k) => k.side === 'home' && k.scored)).toHaveLength(r.home);
      expect(r.kicks.filter((k) => k.side === 'away' && k.scored)).toHaveLength(r.away);
    }
  });
});
