/**
 * Interesse por modalidades futuras (descoberta de demanda — define a ordem do roadmap).
 *
 * Hoje o voto fica no navegador e é enviado para `track()`. Para coletar de todos
 * os jogadores basta configurar VITE_ANALYTICS_URL (endpoint que aceite POST JSON);
 * sem ele o envio é ignorado silenciosamente.
 */
const KEY = 'mestres-do-esporte.interest';

export type Votes = Record<string, number>;

export function loadVotes(): Votes {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Votes;
  } catch {
    return {};
  }
}

export function saveVote(sport: string, stars: number): Votes {
  const votes = { ...loadVotes(), [sport]: stars };
  try {
    localStorage.setItem(KEY, JSON.stringify(votes));
  } catch {
    /* sem armazenamento: o voto ainda vai para o track */
  }
  track('sport_interest', { sport, stars });
  return votes;
}

/** Ponto único de eventos de produto. Troque o destino aqui (PostHog, endpoint próprio…). */
export function track(event: string, props: Record<string, string | number>) {
  const url = import.meta.env.VITE_ANALYTICS_URL as string | undefined;
  if (!url) return;
  const body = JSON.stringify({ event, props, at: new Date().toISOString() });
  try {
    if (!navigator.sendBeacon?.(url, new Blob([body], { type: 'application/json' }))) {
      void fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true });
    }
  } catch {
    /* analytics nunca quebra o jogo */
  }
}
