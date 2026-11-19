/**
 * Linha do tempo da abertura (segundos). Pura e testável: a cena só desenha
 * o estado devolvido aqui.
 *
 *  0.0–0.8  estádio no escuro, estrelas
 *  0.8–2.0  refletores acendem um a um
 *  2.0–3.0  cobrador corre até a bola
 *  3.0–4.0  bola em curva até o ângulo
 *  4.0      GOL: rede balança, flash, torcida pula
 *  5.2      logo entra (onReveal)
 */
export const INTRO = {
  lightsStart: 0.8,
  lightGap: 0.3,
  towers: 4,
  runStart: 2.0,
  kick: 3.0,
  goal: 4.0,
  reveal: 5.2,
} as const;

export interface IntroState {
  /** Quantos refletores estão acesos (0–4). */
  lightsOn: number;
  /** 0–1: progresso da corrida do cobrador. */
  run: number;
  /** 0–1: progresso do voo da bola (0 antes do chute). */
  flight: number;
  /** Segundos desde o gol (negativo antes). */
  sinceGoal: number;
  /** Logo e menu já devem aparecer. */
  revealed: boolean;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function introState(t: number): IntroState {
  const lightsOn = Math.max(0, Math.min(INTRO.towers, Math.floor((t - INTRO.lightsStart) / INTRO.lightGap) + 1));
  return {
    lightsOn: t < INTRO.lightsStart ? 0 : lightsOn,
    run: clamp01((t - INTRO.runStart) / (INTRO.kick - INTRO.runStart)),
    flight: clamp01((t - INTRO.kick) / (INTRO.goal - INTRO.kick)),
    sinceGoal: t - INTRO.goal,
    revealed: t >= INTRO.reveal,
  };
}

/** Estado final usado ao pular a abertura ou com movimento reduzido. */
export const INTRO_END = INTRO.reveal + 0.5;
