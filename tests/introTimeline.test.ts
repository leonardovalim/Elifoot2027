import { INTRO, INTRO_END, introState } from '../src/ui/scene/introTimeline';

describe('linha do tempo da abertura', () => {
  it('começa no escuro, sem chute e sem logo', () => {
    const s = introState(0);
    expect(s).toMatchObject({ lightsOn: 0, run: 0, flight: 0, revealed: false });
  });
  it('acende os 4 refletores em sequência', () => {
    const counts = [0.9, 1.2, 1.5, 1.8, 3].map((t) => introState(t).lightsOn);
    expect(counts).toEqual([1, 2, 3, 4, 4]);
  });
  it('a bola só voa depois do chute e chega no gol', () => {
    expect(introState(INTRO.kick - 0.01).flight).toBe(0);
    expect(introState(INTRO.goal).flight).toBe(1);
    expect(introState(INTRO.goal).sinceGoal).toBe(0);
  });
  it('revela o logo no fim e o estado final é estável para pular', () => {
    expect(introState(INTRO.reveal - 0.01).revealed).toBe(false);
    expect(introState(INTRO_END)).toMatchObject({ lightsOn: 4, run: 1, flight: 1, revealed: true });
  });
});
