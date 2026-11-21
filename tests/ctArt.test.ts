import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../src/game/achievements';
import { ART_H, ART_LEGACY_IDS, ART_W, PLACES, WALK, insideWalk } from '../src/ui/scene/ctArt';
import rects from '../src/assets/ct/objetos.json';

/** Atravessam o céu: podem sair pelas laterais. */
const MOVERS = new Set(['elite', 'invencivel-na-elite', 'colecionador']);

describe('CT com arte gerada', () => {
  it('toda conquista tem lugar no cenário novo', () => {
    expect([...ART_LEGACY_IDS].sort()).toEqual(ACHIEVEMENTS.map((a) => a.id).sort());
  });

  it('todo sprite usado existe no atlas e fica dentro do cenário', () => {
    const atlas = rects as unknown as Record<string, [number, number, number, number]>;
    for (const p of PLACES) {
      if (!p.s) continue;
      const r = atlas[p.s];
      expect(r, `${p.id}: sprite ${p.s} fora do atlas`).toBeTruthy();
      const s = p.k ?? 1;
      const w = Math.round(r![2] * s), h = Math.round(r![3] * s);
      expect(p.y, p.id).toBeGreaterThanOrEqual(0);
      expect(p.y + h, `${p.id} sai por baixo`).toBeLessThanOrEqual(ART_H);
      if (!MOVERS.has(p.id)) {
        expect(p.x, p.id).toBeGreaterThanOrEqual(0);
        expect(p.x + w, `${p.id} sai pela direita`).toBeLessThanOrEqual(ART_W);
      }
    }
  });

  it('a área de treino é um polígono no gramado, dentro do cenário', () => {
    for (const [x, y] of WALK) {
      expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(ART_W);
      expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(ART_H);
    }
    expect(insideWalk(240, 170)).toBe(true); // meio do campo
    expect(insideWalk(20, 20)).toBe(false); // céu
    expect(insideWalk(150, 280)).toBe(false); // pátio
  });
});
