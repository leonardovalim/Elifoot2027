import { describe, expect, it } from 'vitest';
import { LABEL, pickVignette } from '../src/ui/match/MatchScene';
import type { MatchEvent } from '../src/sports/football/types';

const ev = (e: Partial<MatchEvent> & { type: MatchEvent['type'] }) => ({ minute: 10, side: 'home', playerId: 'p', playerName: 'X', ...e }) as MatchEvent;

describe('cena do lance na partida', () => {
  it('escolhe o lance mais recente que merece vinheta entre os eventos novos', () => {
    const events = [ev({ type: 'goal' }), ev({ type: 'sub' }), ev({ type: 'save', keeperName: 'G' } as never), ev({ type: 'tactic', text: '' } as never)];
    expect(pickVignette(events, 1)?.type).toBe('save');
    expect(pickVignette(events, 3)).toBeNull(); // só tática nova: nada
  });

  it('ignora o que a narração não mostra (chute pra fora que não é pênalti)', () => {
    expect(pickVignette([ev({ type: 'miss' })], 0)).toBeNull();
    expect(pickVignette([ev({ type: 'miss', penalty: true })], 0)?.type).toBe('miss');
  });

  it('tem rótulo para todo tipo de vinheta', () => {
    for (const k of ['goal', 'save', 'post', 'bar', 'miss', 'yellow', 'red'] as const) expect(LABEL[k]).toBeTruthy();
  });
});
