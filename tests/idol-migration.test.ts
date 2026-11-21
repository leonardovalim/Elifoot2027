import { describe, expect, it } from 'vitest';
import { challengeOptions, myClubId, newWorld, startCareer, withNovaIguacu, type Career } from '../src/game/career';
import { ANDRE_ELIAS_ID, NOVA_IGUACU_ID, STAR_CAP } from '../src/sports/football/generate';
import { dailyTraining } from '../src/sports/football/development';
import { overall } from '../src/sports/football/lineup';
import { Rng } from '../src/core/rng';

/** Simula um save de antes da regra: sem Nova Iguaçu e sem André Elias. */
function oldSave(seed: number, type: 'baixo' | 'pressao' = 'baixo'): Career {
  const w = newWorld(seed);
  const c = startCareer(seed, 'T', type, challengeOptions(w, type)[0]!.clubId);
  const json = JSON.stringify(c).split(`"${NOVA_IGUACU_ID}"`).join('"c-antigo"');
  const old = JSON.parse(json) as Career;
  for (const cl of Object.values(old.clubs)) cl.players = cl.players.filter((p) => p.id !== ANDRE_ELIAS_ID);
  old.clubs['c-antigo']!.name = 'Clube Antigo';
  return old;
}

describe('save antigo ganha o Nova Iguaçu e o André Elias', () => {
  it('o clube mais forte da elite (sem técnico humano) vira o Nova Iguaçu, com o André', () => {
    const c = withNovaIguacu(oldSave(41));
    const ni = c.clubs[NOVA_IGUACU_ID]!;
    expect(ni.name).toBe('Nova Iguaçu');
    expect(c.season.divisions[0]!.teamIds).toContain(NOVA_IGUACU_ID);
    expect(ni.players.some((p) => p.id === ANDRE_ELIAS_ID && p.clubLocked)).toBe(true);
    // nenhum id antigo sobrou apontando para o nada
    for (const d of c.season.divisions) for (const id of d.teamIds) expect(c.clubs[id]).toBeDefined();
    for (const r of c.season.divisions[0]!.rounds.flat()) { expect(c.clubs[r.home]).toBeDefined(); expect(c.clubs[r.away]).toBeDefined(); }
  });

  it('não toma o clube do jogador', () => {
    const before = oldSave(42, 'pressao');
    const mine = myClubId(before);
    const c = withNovaIguacu(before);
    expect(myClubId(c)).toBe(mine === NOVA_IGUACU_ID ? NOVA_IGUACU_ID : mine);
    expect(myClubId(c)).not.toBe(NOVA_IGUACU_ID);
  });

  it('save atual fica igual', () => {
    const w = newWorld(43);
    const c = startCareer(43, 'T', 'baixo', challengeOptions(w, 'baixo')[0]!.clubId);
    expect(withNovaIguacu(c)).toBe(c);
  });
});

describe('o André segue o melhor', () => {
  it('ninguém passa do teto de 95 treinando; o André não perde físico com a idade', () => {
    const c = newWorld(44);
    const andre = Object.values(c.clubs).flatMap((x) => x.players).find((p) => p.id === ANDRE_ELIAS_ID)!;
    andre.age = 34;
    const start = overall(andre);
    const rng = new Rng(1);
    for (let d = 0; d < 2000; d++) for (const club of Object.values(c.clubs)) dailyTraining(club, rng);
    for (const p of Object.values(c.clubs).flatMap((x) => x.players)) if (p !== andre) expect(overall(p)).toBeLessThanOrEqual(STAR_CAP);
    expect(overall(andre)).toBeGreaterThanOrEqual(start);
  });
});
