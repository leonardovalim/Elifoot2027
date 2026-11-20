import { afterEach, describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { newWorld } from '../src/game/career';
import { applyMatch, endOfSeason } from '../src/sports/football/development';
import { TUNING, createMatch, runToEnd, toOutcome } from '../src/sports/football/engine';
import { pickLineup, starters } from '../src/sports/football/lineup';
import { narrate } from '../src/sports/football/narration';

const BASE = TUNING.injuryPerMinute;
afterEach(() => { TUNING.injuryPerMinute = BASE; });

function twoClubs(seed = 1) {
  const clubs = Object.values(newWorld(seed).clubs);
  return [clubs[0]!, clubs[1]!] as const;
}

describe('lesões', () => {
  it('lesionado sai de campo com substituição forçada e entra no resultado', () => {
    TUNING.injuryPerMinute = 0.002;
    const [a, b] = twoClubs(2);
    const m = createMatch(a, b, new Rng(5));
    runToEnd(m, new Rng(6));
    const o = toOutcome(m);
    const inj = m.events.filter((e) => e.type === 'injury');
    expect(inj.length).toBeGreaterThan(0);
    for (const e of inj) {
      if (e.type !== 'injury') continue;
      expect(e.rounds).toBeGreaterThanOrEqual(1);
      expect(e.rounds).toBeLessThanOrEqual(6);
      expect(o.injuries[e.playerId]).toBe(e.rounds);
      // não termina a partida em campo
      const s = m[e.side];
      expect([s.GK, ...s.DF, ...s.MF, ...s.FW].some((p) => p.id === e.playerId)).toBe(false);
      expect(narrate(e)).toMatch(/Fora por \d/);
    }
    expect(m.events.some((e) => e.type === 'sub' && e.reason === 'lesão')).toBe(true);
  });

  it('fica fora exatamente as rodadas sorteadas', () => {
    const [club] = twoClubs(3);
    const star = starters(pickLineup(club))[5]!;
    applyMatch(club, [star.id], {}, {}, [], {}, new Rng(1), { [star.id]: 3 });
    for (let r = 0; r < 3; r++) {
      expect(starters(pickLineup(club)).some((p) => p.id === star.id)).toBe(false);
      expect(pickLineup(club).bench.some((p) => p.id === star.id)).toBe(false);
      applyMatch(club, [], {}, {}, [], {}, new Rng(1));
    }
    expect(star.injured).toBe(0);
    expect([...starters(pickLineup(club)), ...pickLineup(club).bench].some((p) => p.id === star.id)).toBe(true);
  });

  it('as férias curam todo mundo', () => {
    const [club] = twoClubs(4);
    const p = club.players.find((x) => x.age < 30)!;
    p.injured = 5;
    endOfSeason(club, 60, 2027, new Rng(1));
    expect(p.injured).toBe(0);
  });
});
