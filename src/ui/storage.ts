import { SAVE_VERSION, type Career } from '../game/career';

const KEY = 'elifoot2027.save';

export function loadCareer(): Career | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Career;
    return c.version === SAVE_VERSION ? c : null;
  } catch {
    return null;
  }
}

export function saveCareer(c: Career) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* modo privado / cota cheia: o jogo segue sem save */
  }
}

export function clearCareer() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
