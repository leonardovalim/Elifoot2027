import { colorDistance, matchColors } from '../src/ui/util';
import type { Club } from '../src/sports/football/types';

const club = (c0: string, c1: string) => ({ colors: [c0, c1] }) as unknown as Club;

describe('cores dos times na partida', () => {
  it('visitante troca de cor quando ficaria parecido com o mandante', () => {
    const c = matchColors(club('#e8b62c', '#222222'), club('#e5762a', '#222222'));
    expect(c.home.bg).toBe('#e8b62c');
    expect(colorDistance(c.home.bg, c.away.bg)).toBeGreaterThanOrEqual(190);
  });
  it('mantém a cor principal quando já são distintas', () => {
    expect(matchColors(club('#c8323c', '#ffffff'), club('#2f5fbf', '#ffffff')).away.bg).toBe('#2f5fbf');
  });
  it('mesmas cores dos dois lados ainda geram lados distintos', () => {
    const c = matchColors(club('#2e8b4a', '#ffffff'), club('#2e8b4a', '#ffffff'));
    expect(c.away.bg).not.toBe(c.home.bg);
  });
});
