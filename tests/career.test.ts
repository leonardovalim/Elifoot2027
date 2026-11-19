import { finishSeason, newCareer, playRound, divisionOf, buyPlayer, marketListings } from '../src/game/career';
import { isSeasonOver } from '../src/core/season';

describe('carreira', () => {
  it('mesma seed → mesma temporada inteira (base do modo online)', () => {
    const a = newCareer(123), b = newCareer(123);
    while (!isSeasonOver(a.season)) { playRound(a); playRound(b); }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('roda 3 temporadas completas sem quebrar e mantém elencos válidos', () => {
    const c = newCareer(9);
    for (let s = 0; s < 3; s++) {
      while (!isSeasonOver(c.season)) playRound(c);
      finishSeason(c);
    }
    expect(c.season.year).toBe(2030);
    expect(c.history).toHaveLength(3);
    for (const club of Object.values(c.clubs)) {
      expect(club.players.filter((p) => p.position === 'GK').length).toBeGreaterThanOrEqual(1);
      expect(club.players.length).toBeGreaterThanOrEqual(16);
    }
    expect(c.season.divisions.every((d) => d.teamIds.length === 12)).toBe(true);
    expect(divisionOf(c, c.managerClubId)).toBeGreaterThanOrEqual(0);
  });

  it('save sobrevive a JSON (localStorage/Postgres)', () => {
    const c = newCareer(5);
    playRound(c);
    const restored = JSON.parse(JSON.stringify(c));
    playRound(c); playRound(restored);
    expect(JSON.stringify(restored)).toBe(JSON.stringify(c));
  });

  it('compra respeita orçamento', () => {
    const c = newCareer(11);
    const me = c.clubs[c.managerClubId]!;
    me.budget = 0;
    const l = marketListings(c)[0]!;
    expect(buyPlayer(c, l.player.id, l.clubId)).toBe('Dinheiro insuficiente.');
  });
});
