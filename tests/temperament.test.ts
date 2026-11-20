import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { generateClub } from '../src/sports/football/generate';
import { temperament } from '../src/sports/football/temperament';
import { foulRate } from '../src/sports/football/engine';

describe('raçudo / fair play', () => {
  it('limites: ≥ 70 raçudo, ≤ 30 fair play, o resto sem selo', () => {
    expect(temperament({ aggression: 70 })).toBe('racudo');
    expect(temperament({ aggression: 69 })).toBeNull();
    expect(temperament({ aggression: 31 })).toBeNull();
    expect(temperament({ aggression: 30 })).toBe('fairplay');
  });

  it('elencos gerados têm alguns de cada, mas a maioria sem selo', () => {
    const rng = new Rng(9);
    const all = Array.from({ length: 60 }, (_, i) => generateClub(rng, `C${i}`, 60, ['#000', '#fff']).players).flat();
    const share = (t: 'racudo' | 'fairplay') => all.filter((p) => temperament(p) === t).length / all.length;
    expect(share('racudo')).toBeGreaterThan(0.05);
    expect(share('racudo')).toBeLessThan(0.25);
    expect(share('fairplay')).toBeGreaterThan(0.05);
    expect(share('fairplay')).toBeLessThan(0.25);
  });

  it('ritmo de faltas: média 50 = 1; só raçudos ~1,25; só fair play ~0,75', () => {
    expect(foulRate([{ aggression: 50 }])).toBe(1);
    expect(foulRate([{ aggression: 75 }, { aggression: 75 }])).toBeCloseTo(1.25);
    expect(foulRate([{ aggression: 25 }])).toBeCloseTo(0.75);
    expect(foulRate([])).toBe(1);
  });
});
