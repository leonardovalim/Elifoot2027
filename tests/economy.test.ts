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

import { closeSeason, loanLimit, loanPayoff, payOffLoan, seasonSummary, takeLoan } from '../src/game/career';

describe('empréstimo', () => {
  const fresh = (seed = 5) => {
    const w = newWorld(seed, 'T');
    return startCareer(seed, 'T', 'baixo', challengeOptions(w, 'baixo')[0]!.clubId);
  };

  it('libera até o limite, cobra parcelas todo dia 1 e quita sozinho', () => {
    const c = fresh();
    const club = c.clubs[myClubId(c)]!;
    const limit = loanLimit(c);
    expect(limit).toBeGreaterThan(0);
    expect(takeLoan(c, limit + 10000, 6)).toMatch(/no máximo/);
    const before = club.budget;
    expect(takeLoan(c, limit, 6)).toBeNull();
    expect(club.budget).toBe(before + limit);
    expect(takeLoan(c, 10000, 6)).toMatch(/aberto/);
    const inst = c.loan!.installment;
    expect(inst * 6).toBeGreaterThan(limit); // tem juros
    let guard = 0;
    while (c.loan && guard++ < 400) { if (isMatchDay(c)) simulateRound(c); else advanceDay(c); }
    expect(c.loan).toBeUndefined();
    expect(c.ledger.loanPaid).toBe(inst * 6);
  });

  it('quitar antes dá desconto', () => {
    const c = fresh(6);
    takeLoan(c, 100000, 12);
    const payoff = loanPayoff(c.loan!);
    expect(payoff).toBeLessThan(c.loan!.installment * 12);
    expect(payOffLoan(c)).toBeNull();
    expect(c.loan).toBeUndefined();
  });

  it('terminar a temporada com caixa negativo demite', () => {
    const c = fresh(7);
    let guard = 0;
    while (c.phase !== 'encerramento' && guard++ < 3000) { if (isMatchDay(c)) simulateRound(c); else advanceDay(c); }
    c.clubs[myClubId(c)]!.budget = -5_000_000;
    const s = seasonSummary(c);
    expect(s.broke).toBe(true);
    expect(s.fired).toBe(true);
    closeSeason(c);
    expect(c.unemployed).toBe(true);
  });

  it('meses no vermelho viram aviso e custam reputação', () => {
    const c = fresh(8);
    c.clubs[myClubId(c)]!.budget = -1_000_000;
    const rep = c.entrepreneur.reputation;
    let guard = 0;
    while ((c.monthsInRed ?? 0) < 2 && guard++ < 120) { if (isMatchDay(c)) simulateRound(c); else advanceDay(c); }
    expect(c.monthsInRed).toBe(2);
    expect(c.entrepreneur.reputation).toBeLessThan(rep);
    expect(c.news.some((n) => /vermelho/.test(n.text))).toBe(true);
  });
});
