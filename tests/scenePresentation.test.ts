import { describe, expect, it } from 'vitest';
import { sceneDetails } from '../src/ui/scene/sceneDetails';
import { scenePresentation } from '../src/ui/scene/scenePresentation';
import { lookFor } from '../src/ui/scene/sprites';

describe('scenePresentation', () => {
  it('describes a running training center with its squad count', () => {
    expect(scenePresentation(3, false, 11)).toEqual({
      label: 'Centro de treinamento · treino em andamento',
      detail: '11 atletas no CT · estrutura 3/5',
    });
  });

  it('describes a paused empty center and clamps the structure level', () => {
    expect(scenePresentation(-2, true, 0)).toEqual({
      label: 'Centro de treinamento · pausado',
      detail: 'Elenco em montagem · estrutura 0/5',
    });

    expect(scenePresentation(99, false, 2).detail).toBe('2 atletas no CT · estrutura 5/5');
  });

  it('scales environmental details with the training center level', () => {
    expect(sceneDetails(1)).toEqual({ level: 1, litWindows: 2, lightPools: 1, coneCount: 3, board: 'basic' });
    expect(sceneDetails(5)).toEqual({ level: 5, litWindows: 6, lightPools: 3, coneCount: 6, board: 'elite' });
  });

  it('gives each player a stable small visual number', () => {
    const first = lookFor('player-1', '#ef4444', '#fff');
    expect(first.number).toBeGreaterThanOrEqual(1);
    expect(first.number).toBeLessThanOrEqual(99);
    expect(lookFor('player-1', '#ef4444', '#fff')).toEqual(first);
  });
});
