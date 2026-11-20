/**
 * Perfil disciplinar do atleta, derivado da agressividade (1–99, média 50).
 *
 * - **Raçudo** (agressividade ≥ 70): chega junto. Desarma mais, mas comete mais
 *   faltas e leva mais cartões, e cartão vermelho suspende.
 * - **Fair play** (agressividade ≤ 30): joga limpo. Raramente leva cartão, mas
 *   desarma um pouco menos.
 * - Os demais não recebem selo.
 *
 * O efeito no jogo é contínuo (vale para todos, ver `engine.ts`); o selo só
 * marca os extremos para o jogador conseguir montar o time pensando nisso.
 */
import type { Player } from './types';

export type Temperament = 'racudo' | 'fairplay';

export const RACUDO_MIN = 70;
export const FAIRPLAY_MAX = 30;

export function temperament(p: Pick<Player, 'aggression'>): Temperament | null {
  if (p.aggression >= RACUDO_MIN) return 'racudo';
  if (p.aggression <= FAIRPLAY_MAX) return 'fairplay';
  return null;
}

export const TEMPERAMENT_LABEL: Record<Temperament, string> = { racudo: 'raçudo', fairplay: 'fair play' };
