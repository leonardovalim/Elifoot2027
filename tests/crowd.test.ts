import { crowdLevels, crowdReaction, CUE_PRIORITY, type CrowdMatch } from '../src/ui/crowd';
import type { MatchEvent } from '../src/sports/football/types';

const at = (minute: number, home: number, away: number): CrowdMatch => ({ minute, total: 93, home: { goals: home }, away: { goals: away } });
const base = { minute: 10, playerId: 'p', playerName: 'Fulano' };

describe('torcida: reações (ponto de vista da casa)', () => {
  it('gol da casa explode, gol do visitante cala', () => {
    expect(crowdReaction({ ...base, type: 'goal', side: 'home' }, at(10, 1, 0))).toBe('roar');
    expect(crowdReaction({ ...base, type: 'goal', side: 'away' }, at(10, 0, 1))).toBe('groan');
  });

  it('chance perdida só faz "uhh" quando é da casa', () => {
    expect(crowdReaction({ ...base, type: 'post', side: 'home' }, at(10, 0, 0))).toBe('ooh');
    expect(crowdReaction({ ...base, type: 'miss', side: 'away' }, at(10, 0, 0))).toBeNull();
  });

  it('defesa do goleiro da casa é aplaudida', () => {
    const save = (side: 'home' | 'away'): MatchEvent => ({ ...base, type: 'save', side, keeperName: 'Goleiro' });
    expect(crowdReaction(save('away'), at(10, 0, 0))).toBe('save');
    expect(crowdReaction(save('home'), at(10, 0, 0))).toBe('ooh');
  });

  it('vaia cartão e pênalti contra a casa', () => {
    expect(crowdReaction({ ...base, type: 'yellow', side: 'home' }, at(10, 0, 0))).toBe('boo');
    expect(crowdReaction({ ...base, type: 'red', side: 'away' }, at(10, 0, 0))).toBeNull();
    const pen = (side: 'home' | 'away'): MatchEvent => ({ ...base, type: 'penalty', side, foulerName: 'X', reason: 'falta' });
    expect(crowdReaction(pen('home'), at(10, 0, 0))).toBe('tension');
    expect(crowdReaction(pen('away'), at(10, 0, 0))).toBe('boo');
  });

  it('intervalo e apito final seguem o placar da casa', () => {
    expect(crowdReaction({ minute: 45, type: 'half' }, at(45, 0, 1))).toBe('boo');
    expect(crowdReaction({ minute: 45, type: 'half' }, at(45, 1, 1))).toBe('applause');
    expect(crowdReaction({ minute: 93, type: 'end' }, at(93, 2, 1))).toBe('win');
    expect(crowdReaction({ minute: 93, type: 'end' }, at(93, 0, 1))).toBe('loss');
    expect(crowdReaction({ minute: 93, type: 'end' }, at(93, 1, 1))).toBe('applause');
  });

  it('festa e vaia do fim valem mais que o gol, que vale mais que o "uhh"', () => {
    expect(CUE_PRIORITY.win).toBeGreaterThan(CUE_PRIORITY.roar);
    expect(CUE_PRIORITY.roar).toBeGreaterThan(CUE_PRIORITY.ooh);
  });
});

describe('torcida: volume das camadas', () => {
  it('estádio cheio soa mais alto que público pequeno', () => {
    expect(crowdLevels(at(10, 0, 0), 40000).bed).toBeGreaterThan(crowdLevels(at(10, 0, 0), 3000).bed);
  });

  it('reta final com placar apertado sobe o murmúrio; goleada não', () => {
    const cedo = crowdLevels(at(30, 1, 1), 20000).bed;
    expect(crowdLevels(at(88, 1, 1), 20000).bed).toBeGreaterThan(cedo);
    expect(crowdLevels(at(88, 4, 0), 20000).bed).toBeCloseTo(cedo);
  });

  it('a cantoria vem com a casa vencendo e some com ela perdendo', () => {
    expect(crowdLevels(at(50, 1, 0), 20000).chant).toBeGreaterThan(crowdLevels(at(50, 0, 0), 20000).chant);
    expect(crowdLevels(at(50, 0, 1), 20000).chant).toBe(0);
  });

  it('fica sempre entre 0 e 1', () => {
    for (const a of [0, 500, 80000]) for (const mm of [0, 80, 120]) {
      const l = crowdLevels(at(mm, 3, 0), a);
      for (const v of [l.bed, l.chant]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    }
  });
});
