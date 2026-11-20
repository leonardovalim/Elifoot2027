import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import {
  buyPlayer, clubStrength, closeSeason, marketListings, myClubId, newWorld, sellPlayer, simulateRound,
  advanceDay, isMatchDay, startCareer, type Career,
} from '../src/game/career';
import { ANDRE_ELIAS_ID, NOVA_IGUACU_ID, playerValue } from '../src/sports/football/generate';
import { endOfSeason } from '../src/sports/football/development';
import { overall } from '../src/sports/football/lineup';
import { crestSpec } from '../src/ui/crest';

const andre = (c: Career) => c.clubs[NOVA_IGUACU_ID]!.players.find((p) => p.id === ANDRE_ELIAS_ID);

describe('Nova Iguaçu e André Elias', () => {
  it('toda carreira nova tem o Nova Iguaçu como o mais forte da 1ª divisão', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const w = newWorld(seed);
      const div0 = w.season.divisions[0]!.teamIds;
      expect(div0).toContain(NOVA_IGUACU_ID);
      const ni = w.clubs[NOVA_IGUACU_ID]!;
      expect(ni.name).toBe('Nova Iguaçu');
      const strongest = div0.map((id) => w.clubs[id]!).sort((a, b) => clubStrength(b) - clubStrength(a))[0]!;
      expect(strongest.id).toBe(NOVA_IGUACU_ID);
    }
  });

  it('André Elias é o melhor e o mais caro do mundo', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const w = newWorld(seed);
      const a = andre(w);
      expect(a?.name).toBe('André Elias');
      const others = Object.values(w.clubs).flatMap((c) => c.players).filter((p) => p.id !== ANDRE_ELIAS_ID);
      expect(overall(a!)).toBeGreaterThan(Math.max(...others.map(overall)));
      expect(playerValue(a!)).toBeGreaterThan(Math.max(...others.map(playerValue)));
    }
  });

  it('escudo laranja liso, com símbolo laranja', () => {
    const ni = newWorld(3).clubs[NOVA_IGUACU_ID]!;
    const spec = crestSpec(ni);
    expect(spec.pattern).toBe('liso');
    expect(spec.primary).toBe('#e5762a');
    expect(spec.secondary).toBe('#ffb04d');
  });

  it('não aparece no mercado e não pode ser comprado', () => {
    const w = newWorld(5);
    const clubId = w.season.divisions[3]!.teamIds[0]!;
    const c = startCareer(5, 'Teste', 'baixo', clubId);
    c.clubs[myClubId(c)]!.budget = 1e9;
    expect(marketListings(c, 10000).some((l) => l.player.id === ANDRE_ELIAS_ID)).toBe(false);
    expect(buyPlayer(c, ANDRE_ELIAS_ID, NOVA_IGUACU_ID)).toMatch(/não sai/);
    expect(andre(c)).toBeDefined();
  });

  it('quem dirige o Nova Iguaçu não consegue vender', () => {
    const c = startCareer(7, 'Teste', 'pressao', NOVA_IGUACU_ID);
    expect(sellPlayer(c, ANDRE_ELIAS_ID)).toMatch(/ídolo/);
    expect(andre(c)).toBeDefined();
  });

  it('não se aposenta e continua no clube depois de uma temporada inteira', () => {
    const ni = newWorld(9).clubs[NOVA_IGUACU_ID]!;
    const a = andre({ clubs: { [NOVA_IGUACU_ID]: ni } } as unknown as Career)!;
    a.age = 40;
    endOfSeason(ni, 70, 2030, new Rng(1));
    expect(ni.players.some((p) => p.id === ANDRE_ELIAS_ID)).toBe(true);

    const c = startCareer(11, 'Teste', 'pressao', NOVA_IGUACU_ID);
    let guard = 0;
    while (c.phase !== 'encerramento' && guard++ < 3000) {
      c.decisions = [];
      if (isMatchDay(c)) simulateRound(c); else advanceDay(c);
    }
    closeSeason(c);
    expect(andre(c)).toBeDefined();
  });
});
