import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID, TIER_LABEL, emptyAch, normalizeAch, type AchState } from '../game/achievements';
import { track } from './analytics';
import { drawLegacyThumb } from './scene/legacyThumb';

/**
 * Conquistas do JOGADOR: salvas à parte da carreira, valem para sempre
 * (apagar o save ou começar outra carreira não apaga a coleção).
 * `<AchievementToastHost />` fica uma vez na raiz do app e mostra o banner.
 */
export const ACH_KEY = 'mestres-do-esporte.conquistas';

function load(): AchState {
  try { return normalizeAch(JSON.parse(localStorage.getItem(ACH_KEY) ?? 'null')); } catch { return emptyAch(); }
}
function persist() {
  try { localStorage.setItem(ACH_KEY, JSON.stringify(state)); } catch { /* sem storage: a coleção vale só nesta sessão */ }
}

let state: AchState = load();

// só leitura, para o playtest (qa/playtest.mjs) conseguir montar o CT completo
try { (window as unknown as { __ACH_IDS__?: string[] }).__ACH_IDS__ = ACHIEVEMENTS.map((a) => a.id); } catch { /* sem window */ }
let version = 0;
const listeners = new Set<() => void>();
let enqueue: ((ids: string[]) => void) | null = null;
const pending: string[] = []; // desbloqueios antes do host montar

/** Roda uma regra de conquista sobre o estado global; salva e anuncia o que destravou. */
export function achieve(rule: (s: AchState) => string[]) {
  let ids: string[] = [];
  try { ids = rule(state); } catch (e) { console.warn('conquistas: regra falhou', e); return; }
  persist();
  if (!ids.length) return;
  version++;
  listeners.forEach((l) => l());
  for (const id of ids) track('achievement_unlocked', { id, tier: ACHIEVEMENT_BY_ID[id]?.tier ?? '', total: Object.keys(state.unlocked).length });
  if (enqueue) enqueue(ids); else pending.push(...ids);
}

function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

/** Ids desbloqueados (re-renderiza quando a coleção muda). */
export function useUnlocked(): Record<string, string> {
  useSyncExternalStore(subscribe, () => version);
  return state.unlocked;
}

// ---------------------------------------------------------------- miniatura do objeto no CT

/** Cores do clube do jogador (o Game avisa), para o objeto sair pintado como no CT. */
let clubColors: [string, string] = ['#e4563c', '#f6ecd6'];
export function setAchievementColors(colors: [string, string]) { clubColors = colors; }

/** O objeto que a conquista colocou no CT, ampliado em pixel art. Sem a arte, mostra o troféu. */
export function LegacyThumb({ id, size }: { id: string; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let alive = true;
    setOk(false);
    const cv = ref.current;
    if (cv) void drawLegacyThumb(cv, id, clubColors).then((drawn) => { if (alive) setOk(drawn); });
    return () => { alive = false; };
  }, [id]);
  return (
    <span className="ach-thumb" style={{ width: size, height: size }} aria-hidden>
      <canvas ref={ref} width={size} height={size} hidden={!ok} />
      {!ok && <span className="ach-thumb-fallback">🏆</span>}
    </span>
  );
}

// ---------------------------------------------------------------- banner

const TOAST_MS = 5600;

export function AchievementToastHost() {
  const [queue, setQueue] = useState<string[]>([]);

  useEffect(() => {
    enqueue = (ids) => setQueue((q) => [...q, ...ids]);
    if (pending.length) enqueue(pending.splice(0));
    return () => { enqueue = null; };
  }, []);

  const current = queue[0];
  // o cronômetro depende só do banner atual: conquistas novas entrando na fila não podem
  // estender a vida dele (a animação de saída já rodou e ele ficaria invisível travando a fila)
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => setQueue((q) => (q[0] === current ? q.slice(1) : q)), TOAST_MS);
    return () => clearTimeout(t);
  }, [current]);

  const a = current ? ACHIEVEMENT_BY_ID[current] : undefined;
  if (!a) return null;
  const total = Object.keys(state.unlocked).length;
  return (
    <div className="ach-toast-wrap" aria-live="polite" data-qa-transient="">
      <div key={a.id} className={`ach-toast tier-${a.tier}`} role="status" aria-label={`Conquista desbloqueada: ${a.name}`}>
        <span className="ach-medal"><LegacyThumb id={a.id} size={56} /></span>
        <span className="ach-text">
          <small>Conquista desbloqueada · {TIER_LABEL[a.tier]} · {total}/{ACHIEVEMENTS.length}</small>
          <b>{a.name}</b>
          <span>{a.how}.</span>
          <span className="ach-gift">Novo no seu CT: <strong>{a.element}</strong></span>
        </span>
        {queue.length > 1 && <span className="ach-more">+{queue.length - 1}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- coleção (painel Carreira)

export function AchievementsSection() {
  const unlocked = useUnlocked();
  const got = ACHIEVEMENTS.filter((a) => unlocked[a.id]).sort((x, y) => (unlocked[y.id] ?? '').localeCompare(unlocked[x.id] ?? ''));
  const left = ACHIEVEMENTS.length - got.length;
  // recolhida por padrão: com dezenas de conquistas a lista alongava demais a tela
  return (
    <details className="fold ach-section">
      <summary>
        Conquistas
        <span className="hint">{got.length}/{ACHIEVEMENTS.length}</span>
        <span className="bar ach-bar ach-bar-mini" aria-hidden><i style={{ width: `${(got.length / ACHIEVEMENTS.length) * 100}%` }} /></span>
      </summary>
      {got.length === 0
        ? <p className="hint">Todas as conquistas são secretas. Cada uma coloca um objeto novo no seu CT.</p>
        : (
          <ul className="ach-list">
            {got.map((a) => (
              <li key={a.id} className={`tier-${a.tier}`}>
                {/* cartão compacto: miniatura e nome; toque para ver como ganhou e o que entrou no CT */}
                <details className="ach-card">
                  <summary>
                    <LegacyThumb id={a.id} size={40} />
                    <span className="ach-li-text"><b>{a.name}</b><span className="ach-tier">{TIER_LABEL[a.tier]}</span></span>
                  </summary>
                  <p className="hint">{a.how} · no CT: {a.element.toLowerCase()}</p>
                </details>
              </li>
            ))}
          </ul>
        )}
      {left > 0 && got.length > 0 && <p className="hint">{left} conquista{left > 1 ? 's' : ''} secreta{left > 1 ? 's' : ''} por descobrir.</p>}
    </details>
  );
}
