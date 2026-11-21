import { SAVE_VERSION, withNovaIguacu, type Career } from '../game/career';

const KEY = 'mestres-do-esporte.save';
/** Chave usada antes do rebatismo — lida uma vez para não perder saves antigos. */
const LEGACY_KEY = 'universo-esportivo.save';

export function loadCareer(): Career | null {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Career;
    // saves de antes do Nova Iguaçu/André Elias ganham os dois ao abrir
    return c.version === SAVE_VERSION ? withNovaIguacu(c) : null;
  } catch {
    return null;
  }
}

export function saveCareer(c: Career) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* modo privado / cota cheia: segue sem save */
  }
}

export function clearCareer() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignora */
  }
}
