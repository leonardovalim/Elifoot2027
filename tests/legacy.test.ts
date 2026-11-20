import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../src/game/achievements';
import { LEGACY_IDS, drawLegacy, drawPlaza, type Layer } from '../src/ui/scene/legacy';

const W = 240, H = 153;
/** Atravessam o céu de um lado ao outro: podem sair pelas laterais. */
const MOVERS = new Set(['elite', 'invencivel-na-elite']);

function fakeCtx() {
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  return { rects, ctx: { fillStyle: '', fillRect: (x: number, y: number, w: number, h: number) => { rects.push({ x, y, w, h }); } } };
}

describe('objetos de conquista no CT', () => {
  it('existe exatamente um objeto para cada uma das 50 conquistas', () => {
    expect([...LEGACY_IDS].sort()).toEqual(ACHIEVEMENTS.map((a) => a.id).sort());
  });

  it('cada objeto aparece (em algum quadro) e fica dentro da cena', () => {
    for (const id of LEGACY_IDS) {
      const { rects, ctx } = fakeCtx();
      for (let fr = 0; fr < 1600; fr += 7) {
        for (const layer of ['back', 'ground', 'front'] as Layer[]) drawLegacy(ctx as never, layer, fr, ['#123456', '#abcdef'], (x) => x === id);
      }
      expect(rects.length, `${id} não desenhou nada`).toBeGreaterThan(0);
      for (const r of rects) {
        expect(r.y, `${id} saiu por cima/baixo`).toBeGreaterThanOrEqual(0);
        expect(r.y + r.h, `${id} saiu por baixo`).toBeLessThanOrEqual(H);
        if (!MOVERS.has(id)) {
          expect(r.x, `${id} saiu pela esquerda`).toBeGreaterThanOrEqual(0);
          expect(r.x + r.w, `${id} saiu pela direita`).toBeLessThanOrEqual(W);
        }
      }
    }
  });

  it('sem conquistas, nada é desenhado além do pátio', () => {
    const { rects, ctx } = fakeCtx();
    for (const layer of ['back', 'ground', 'front'] as Layer[]) drawLegacy(ctx as never, layer, 10, ['#000', '#fff'], () => false);
    expect(rects).toHaveLength(0);
    drawPlaza(ctx as never, ['#000', '#fff']);
    expect(rects.every((r) => r.y >= 0 && r.y + r.h <= H && r.x >= 0 && r.x + r.w <= W)).toBe(true);
  });
});
