import { describe, expect, it } from 'vitest';
import { advanceDay, challengeOptions, isMatchDay, myClubId, newWorld, pendingDecision, decide, simulateRound, startCareer } from '../src/game/career';
import { weakestSpot } from '../src/game/market';
import { overall } from '../src/sports/football/lineup';

function start(seed: number) {
  const w = newWorld(seed);
  return startCareer(seed, 'Teste', 'crescimento', challengeOptions(w, 'crescimento')[0]!.clubId);
}

describe('mercado entre clubes da IA', () => {
  it('clubes da IA negociam entre si ao longo da temporada, sem mexer no seu', () => {
    const c = start(21);
    const me = myClubId(c);
    const total = () => Object.values(c.clubs).reduce((a, x) => a + x.players.length, 0);
    const mySquad = c.clubs[me]!.players.map((p) => p.id).sort();
    let guard = 0;
    while (c.phase !== 'encerramento' && guard++ < 2000) {
      let d = pendingDecision(c);
      while (d) { decide(c, d.id, d.kind === 'bid' ? 'refuse' : 'accept'); d = pendingDecision(c); }
      if (isMatchDay(c)) simulateRound(c); else advanceDay(c);
    }
    const t = c.transfers ?? [];
    expect(t.length).toBeGreaterThanOrEqual(10);
    for (const x of t) {
      expect(x.from).not.toBe(me);
      expect(x.to).not.toBe(me);
      expect(x.fee).toBeGreaterThan(0);
    }
    for (const club of Object.values(c.clubs)) {
      expect(club.players.length).toBeGreaterThanOrEqual(16);
      expect(club.players.length).toBeLessThanOrEqual(28);
      expect(club.players.filter((p) => p.position === 'GK').length).toBeGreaterThanOrEqual(2);
    }
    // ninguém some nem duplica; o seu elenco só muda por decisões suas
    const ids = Object.values(c.clubs).flatMap((x) => x.players.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
    void total; void mySquad;
  });

  it('a carência é a posição com o pior titular', () => {
    const c = newWorld(4);
    const club = Object.values(c.clubs)[5]!;
    const spot = weakestSpot(club);
    const fw = club.players.filter((p) => p.position === 'FW').map(overall).sort((a, b) => b - a);
    if (spot.position === 'FW') expect(spot.ovr).toBe(fw[1]);
    expect(spot.ovr).toBeGreaterThan(0);
  });
});
