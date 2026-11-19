import { describe, expect, it } from 'vitest';
import { CREST_PATTERNS, CREST_SHAPES, CREST_SYMBOLS, ELITE_REPUTATION, crestGrid, crestSpec, type CrestClub } from '../src/ui/crest';
import { generateWorld } from '../src/sports/football/generate';
import { Rng } from '../src/core/rng';

const club = (over: Partial<CrestClub> = {}): CrestClub => ({
  id: 'c1abc2def', short: 'ATL', founded: 1923, colors: ['#c8323c', '#ffffff'], reputation: 40, ...over,
});

describe('escudo do clube', () => {
  it('é determinístico pelo id', () => {
    const a = crestGrid(club(), 'full');
    // objeto novo, mesmo id: mesma arte pixel a pixel
    const b = crestGrid({ ...club() }, 'full');
    expect(b.px).toEqual(a.px);
    expect(crestSpec(club())).toEqual(crestSpec({ ...club() }));
    // formato/padrão/símbolo não dependem de nada além do id
    const s1 = crestSpec(club());
    const s2 = crestSpec(club({ short: 'XYZ', founded: 1999, colors: ['#222222', '#ffffff'], reputation: 90 }));
    expect([s2.shape, s2.pattern, s2.symbol, s2.flip]).toEqual([s1.shape, s1.pattern, s1.symbol, s1.flip]);
  });

  it('varia entre clubes e cobre todos os formatos, padrões e símbolos', () => {
    const specs = Array.from({ length: 400 }, (_, i) => crestSpec(club({ id: `c${i.toString(36)}x${(i * 7919).toString(36)}` })));
    expect(new Set(specs.map((s) => s.shape))).toEqual(new Set(CREST_SHAPES));
    expect(new Set(specs.map((s) => s.pattern))).toEqual(new Set(CREST_PATTERNS));
    expect(new Set(specs.map((s) => s.symbol))).toEqual(new Set(CREST_SYMBOLS));
  });

  it('usa só as cores do clube no miolo e destaca clubes de elite', () => {
    const normal = crestGrid(club({ reputation: ELITE_REPUTATION - 1 }));
    const elite = crestGrid(club({ reputation: ELITE_REPUTATION }));
    expect(elite.px).not.toEqual(normal.px);
    const colors = (g: typeof normal) => new Set(g.px.flat().filter(Boolean));
    expect(colors(elite).has('#f6e7b0')).toBe(true); // fita do ano
    expect(colors(normal).has('#f6e7b0')).toBe(false);
    expect(colors(normal).has('#c8323c')).toBe(true);
  });

  it('gera escudos válidos para todos os clubes do mundo', () => {
    const world = generateWorld(new Rng(42));
    for (const c of world.flat()) {
      for (const v of ['full', 'mini'] as const) {
        const g = crestGrid(c, v);
        expect(g.px).toHaveLength(g.h);
        expect(g.px.flat().filter(Boolean).length).toBeGreaterThan(g.w * g.h * 0.4);
      }
    }
  });
});
