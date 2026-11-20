import { describe, expect, it } from 'vitest';
import {
  MID_SEASON, advanceDay, challengeOptions, divisionOf, closeSeason, decide, isMatchDay, myClubId, newWorld, pendingDecision,
  resolveMidSeason, simulateRound, startCareer, type Career,
} from '../src/game/career';

function start(seed: number, type: 'baixo' | 'crescimento' | 'pressao' = 'baixo') {
  const w = newWorld(seed, 'T');
  return startCareer(seed, 'T', type, challengeOptions(w, type)[0]!.clubId);
}
const setTeam = (c: Career, v: number) => {
  for (const p of c.clubs[myClubId(c)]!.players) for (const k of Object.keys(p.attrs) as (keyof typeof p.attrs)[]) p.attrs[k] = v;
};
/** Joga até a rodada `n` (respondendo decisões do mercado), sem resolver a janela. */
function playUntilRound(c: Career, n: number) {
  let guard = 0;
  while (c.season.round < n && guard++ < 3000) {
    let d = pendingDecision(c);
    while (d) { decide(c, d.id, d.kind === 'bid' ? 'refuse' : 'accept'); d = pendingDecision(c); }
    if (isMatchDay(c)) simulateRound(c); else advanceDay(c);
  }
}

describe('janela do meio do campeonato', () => {
  it('abre só no fim do 1º turno e, com bom turno, traz convite por mérito', () => {
    const c = start(41);
    setTeam(c, 99);
    playUntilRound(c, 10);
    expect(c.midSeason).toBeUndefined();
    playUntilRound(c, 11);
    expect(c.midSeason?.open).toBe(true);
    expect(c.midSeason!.position).toBeLessThanOrEqual(3);
    const merit = c.midSeason!.offers.find((o) => o.reason === 'merito');
    expect(merit).toBeDefined();
    // clube maior de verdade: de divisão acima, pagando mais
    expect(divisionOf(c, merit!.clubId)).toBeLessThan(divisionOf(c, myClubId(c)));
    expect(merit!.monthlySalary).toBeGreaterThanOrEqual(c.entrepreneur.bonds[0]!.monthlySalary * 1.2);
  });

  it('aceitar troca de clube, cobra a multa e tira reputação', () => {
    const c = start(41);
    setTeam(c, 99);
    playUntilRound(c, 11);
    const offer = c.midSeason!.offers[0]!;
    const old = myClubId(c);
    const salary = c.entrepreneur.bonds[0]!.monthlySalary;
    const cash = c.entrepreneur.cash, rep = c.entrepreneur.reputation;
    expect(resolveMidSeason(c, offer.clubId)).toBeNull();
    expect(myClubId(c)).toBe(offer.clubId);
    expect(myClubId(c)).not.toBe(old);
    expect(c.entrepreneur.cash).toBe(cash - Math.min(cash, salary * MID_SEASON.fineSalaries));
    expect(c.entrepreneur.reputation).toBe(Math.max(0, rep - MID_SEASON.leaveReputation));
    expect(c.midSeason!.open).toBe(false);
    expect(resolveMidSeason(c, null)).not.toBeNull(); // não dá para responder duas vezes
  });

  it('recusar mantém o clube e dá reputação pela fidelidade', () => {
    const c = start(41);
    setTeam(c, 99);
    playUntilRound(c, 11);
    const old = myClubId(c), rep = c.entrepreneur.reputation;
    expect(resolveMidSeason(c, null)).toBeNull();
    expect(myClubId(c)).toBe(old);
    expect(c.entrepreneur.reputation).toBe(Math.min(100, rep + MID_SEASON.stayReputation));
  });

  it('turno ruim não gera convite por mérito (só, às vezes, de clube em crise)', () => {
    for (const seed of [42, 43, 44, 45]) {
      const c = start(seed);
      setTeam(c, 1);
      playUntilRound(c, 11);
      for (const o of c.midSeason?.offers ?? []) {
        expect(o.reason).toBe('crise');
        expect(o.objective).toBe('permanencia');
      }
    }
  });

  it('mesma seed e mesmas escolhas → mesma janela; o fim da temporada fecha a janela', () => {
    const a = start(46), b = start(46);
    setTeam(a, 99); setTeam(b, 99);
    playUntilRound(a, 11); playUntilRound(b, 11);
    expect(a.midSeason).toEqual(b.midSeason);
    playUntilRound(a, 22);
    closeSeason(a);
    expect(a.midSeason).toBeUndefined();
  });
});
