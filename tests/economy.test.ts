import { describe, expect, it } from 'vitest';
import { advanceDay, challengeOptions, isMatchDay, myClubId, newWorld, simulateRound, startCareer } from '../src/game/career';

describe('economia', () => {
  it('clube da divisão 4 sem mexer em nada não quebra na primeira temporada e termina com folga', () => {
    for (const seed of [11, 33]) {
      const w = newWorld(seed, 'T');
      const c = startCareer(seed, 'T', 'baixo', challengeOptions(w, 'baixo')[0]!.clubId);
      const club = c.clubs[myClubId(c)]!;
      const start = club.budget;
      let min = Infinity, guard = 0;
      while (c.phase !== 'encerramento' && guard++ < 3000) {
        if (isMatchDay(c)) simulateRound(c); else advanceDay(c);
        min = Math.min(min, club.budget);
      }
      expect(min).toBeGreaterThan(0);
      expect(club.budget).toBeGreaterThan(start);
    }
  });
});
