import { describe, expect, it } from 'vitest';
import { addDays } from '../src/core/calendar';
import { Rng } from '../src/core/rng';
import {
  advanceDay, challengeOptions, ctQuote, isMatchDay, myClubId, newWorld, simulateRound, stadiumQuote, stadiumUse,
  startCareer, startWork, type Career,
} from '../src/game/career';
import { releaseLeavers } from '../src/game/market';
import { playerValue } from '../src/sports/football/generate';

function start(seed: number) {
  const w = newWorld(seed, 'Teste');
  const clubId = challengeOptions(w, 'baixo')[0]!.clubId;
  return startCareer(seed, 'Teste', 'baixo', clubId);
}

/** Avança o calendário até `n` dias depois de hoje, jogando as rodadas no caminho. */
function days(c: Career, n: number) {
  const target = addDays(c.date, n);
  let guard = 0;
  while (c.date < target && guard++ < 2000) {
    c.decisions = [];
    if (isMatchDay(c)) simulateRound(c); else advanceDay(c);
  }
}

describe('obras de estrutura', () => {
  it('ampliar o estádio cobra na hora e entrega os lugares no prazo', () => {
    const c = start(3);
    const club = c.clubs[myClubId(c)]!;
    club.budget = 5_000_000;
    const before = club.stadium;
    const q = stadiumQuote(club);
    expect(q.seats).toBeGreaterThanOrEqual(1000);
    expect(startWork(c, 'stadium')).toBeNull();
    expect(club.budget).toBe(5_000_000 - q.cost);
    expect(c.ledger.works).toBe(q.cost);
    expect(startWork(c, 'stadium')).toMatch(/andamento/);
    days(c, q.days - 1);
    expect(club.stadium).toBe(before);
    days(c, 2);
    expect(club.stadium).toBe(before + q.seats);
    expect(club.works ?? []).toHaveLength(0);
  });

  it('CT sobe um nível por obra e para no 5', () => {
    const c = start(4);
    const club = c.clubs[myClubId(c)]!;
    club.budget = 50_000_000;
    club.trainingCenter = 4;
    expect(ctQuote(club)!.level).toBe(5);
    expect(startWork(c, 'ct')).toBeNull();
    expect(ctQuote(club)).toBeNull();
    days(c, 61);
    expect(club.trainingCenter).toBe(5);
    expect(startWork(c, 'ct')).toMatch(/máximo/);
  });

  it('sem caixa não começa a obra', () => {
    const c = start(5);
    c.clubs[myClubId(c)]!.budget = 1000;
    expect(startWork(c, 'stadium')).toMatch(/Caixa/);
    expect(c.clubs[myClubId(c)]!.works).toBeUndefined();
  });

  it('no início ninguém lota, mas o estádio não sobra demais', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const w = newWorld(seed);
      for (const club of Object.values(w.clubs)) {
        const { occupancy } = stadiumUse(club);
        expect(occupancy).toBeLessThan(1);
        expect(occupancy).toBeGreaterThan(0.6);
      }
    }
  });

  it('a torcida reage aos resultados durante a temporada', () => {
    const c = start(6);
    const before = Object.fromEntries(Object.values(c.clubs).map((x) => [x.id, x.fans]));
    days(c, 200);
    const changed = Object.values(c.clubs).filter((x) => x.fans !== before[x.id]).length;
    expect(changed).toBeGreaterThan(40);
  });
});

describe('leilão no fim de contrato', () => {
  it('quem não renovou é arrematado por 25% a 45% do valor', () => {
    const c = start(8);
    const me = myClubId(c);
    const club = c.clubs[me]!;
    const p = club.players.find((x) => x.position !== 'GK')!;
    p.leaving = true;
    p.contractUntil = c.season.year;
    const value = playerValue(p);
    const budget = club.budget;
    const [r] = releaseLeavers(c.clubs, me, c.season.year, new Rng(1));
    expect(r!.name).toBe(p.name);
    expect(r!.buyer).not.toBeNull();
    expect(r!.fee).toBeGreaterThanOrEqual(Math.round(value * 0.25 / 1000) * 1000 - 1000);
    expect(r!.fee).toBeLessThanOrEqual(Math.round(value * 0.45 / 1000) * 1000 + 1000);
    expect(club.budget).toBe(budget + r!.fee);
    expect(club.players.some((x) => x.id === p.id)).toBe(false);
    expect(Object.values(c.clubs).some((x) => x.id !== me && x.players.some((y) => y.id === p.id))).toBe(true);
  });
});
