/**
 * Analytics de produto (PostHog), sem SDK: POST direto na API de captura.
 *
 * Configuração por variável de ambiente (Vercel → Settings → Environment Variables):
 *   VITE_POSTHOG_KEY  = chave PÚBLICA do projeto (começa com "phc_")
 *   VITE_POSTHOG_HOST = https://us.i.posthog.com (padrão)
 *
 * Sem a chave, nada é enviado e o jogo funciona igual. Chaves secretas
 * ("phs_", "phx_") nunca devem ir para o código do cliente.
 */
const KEY = (import.meta.env.VITE_POSTHOG_KEY as string | undefined)?.trim();
const HOST = ((import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://us.i.posthog.com').replace(/\/$/, '');
const ENABLED = !!KEY && KEY.startsWith('phc_');
const ID_KEY = 'mestres-do-esporte.distinct-id';

export const APP = 'mestres-do-esporte';
export const APP_VERSION = '0.2.0';

function distinctId(): string {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id = crypto.randomUUID?.() ?? `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return 'anon-sem-storage';
  }
}

export type Props = Record<string, string | number | boolean | undefined>;

export function track(event: string, props: Props = {}) {
  if (!ENABLED) return;
  const body = JSON.stringify({
    api_key: KEY,
    event,
    distinct_id: distinctId(),
    timestamp: new Date().toISOString(),
    properties: {
      ...props,
      app: APP,
      app_version: APP_VERSION,
      $current_url: location.href,
      $screen_width: window.innerWidth,
      $lib: 'mestres-do-esporte-web',
    },
  });
  try {
    const url = `${HOST}/i/v0/e/`;
    if (!navigator.sendBeacon?.(url, new Blob([body], { type: 'text/plain' }))) {
      void fetch(url, { method: 'POST', body, keepalive: true }).catch(() => {});
    }
  } catch {
    /* analytics nunca quebra o jogo */
  }
}

export const analyticsEnabled = ENABLED;
