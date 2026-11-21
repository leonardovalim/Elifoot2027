import { describe, expect, it } from 'vitest';
import { activeBond, advanceDay, challengeOptions, isMatchDay, newWorld, pendingDecision, decide, simulateRound, startCareer } from '../src/game/career';
import { BID_GRACE_DAYS, RAISE_GRACE_DAYS } from '../src/game/market';

const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86400000;

describe('carência ao assumir o clube', () => {
  it('sem proposta nos primeiros 60 dias nem pedido de aumento nos primeiros 45', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const w = newWorld(seed);
      const c = startCareer(seed, 'T', 'crescimento', challengeOptions(w, 'crescimento')[0]!.clubId);
      const since = activeBond(c)!.since;
      let firstBid: number | null = null;
      for (let g = 0; g < 400 && firstBid === null; g++) {
        let d = pendingDecision(c);
        while (d) {
          const age = days(since, d.date);
          if (d.kind === 'bid') { expect(age).toBeGreaterThanOrEqual(BID_GRACE_DAYS); firstBid ??= age; }
          if (d.kind === 'raise') expect(age).toBeGreaterThanOrEqual(RAISE_GRACE_DAYS);
          decide(c, d.id, d.kind === 'bid' ? 'refuse' : 'accept');
          d = pendingDecision(c);
        }
        if (isMatchDay(c)) simulateRound(c); else advanceDay(c);
      }
    }
  });
});
