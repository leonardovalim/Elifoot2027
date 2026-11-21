import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { newWorld } from '../src/game/career';
import { TUNING, createMatch, minuteLabel, runToEnd, toOutcome } from '../src/sports/football/engine';
import { isNarrated, narrate } from '../src/sports/football/narration';
import type { MatchEvent } from '../src/sports/football/types';

const clubs = () => Object.values(newWorld(8).clubs).filter((c) => !c.country);

describe('pênaltis e prorrogação', () => {
  it('pênalti tem cobrança logo em seguida, narrada, e gol de pênalti entra no placar', () => {
    const cs = clubs();
    let seen = 0;
    for (let i = 0; i < 400 && seen < 20; i++) {
      const m = createMatch(cs[i % cs.length]!, cs[(i + 5) % cs.length]!, new Rng(i));
      runToEnd(m, new Rng(i + 7));
      const o = toOutcome(m);
      const goals = m.events.filter((e) => e.type === 'goal');
      expect(goals.filter((e) => e.side === 'home').length).toBe(o.homeScore);
      m.events.forEach((e, k) => {
        if (e.type !== 'penalty') return;
        seen++;
        const next = m.events.slice(k + 1).find((x) => 'penalty' in x && (x as { penalty?: boolean }).penalty) as MatchEvent;
        expect(next).toBeDefined();
        expect(next.minute).toBe(e.minute + 1); // cobrança no minuto seguinte
        expect('side' in next && next.side).toBe(e.side);
        expect(narrate(e)).toMatch(/cobrança/);
        expect(isNarrated(next)).toBe(true);
      });
    }
    expect(seen).toBeGreaterThan(5);
  });

  it('mata-mata empatado vai para a prorrogação de 30 minutos; liga não', () => {
    const cs = clubs();
    let extra = 0;
    for (let i = 0; i < 200; i++) {
      const m = createMatch(cs[i % cs.length]!, cs[(i + 3) % cs.length]!, new Rng(i));
      m.knockout = i % 2 === 0;
      runToEnd(m, new Rng(i + 1));
      const ev = m.events.find((e) => e.type === 'extra');
      if (!m.knockout) { expect(ev).toBeUndefined(); continue; }
      if (ev) {
        extra++;
        expect(m.minute).toBeGreaterThanOrEqual(ev.minute + TUNING.extraTimeMinutes);
        expect(minuteLabel(m)).toBe(String(90 + m.minute - m.extraStart!));
      }
    }
    expect(extra).toBeGreaterThan(0);
  });
});
