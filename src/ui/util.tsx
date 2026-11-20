import type { ReactNode } from 'react';
import type { Club, Position, Style } from '../sports/football/types';
import { crestGrid, crestRects } from './crest';

export const money = (v: number) => (v < 0 ? '-' : '') + '$' + Math.abs(Math.round(v)).toLocaleString('pt-BR');

export const moneyShort = (v: number) => {
  const a = Math.abs(v), s = v < 0 ? '-' : '';
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.', ',')}M`;
  if (a >= 1e3) return `${s}$${Math.round(a / 1e3)}k`;
  return `${s}$${Math.round(a)}`;
};

export const POS_LABEL: Record<Position, string> = { GK: 'GOL', DF: 'DEF', MF: 'MEI', FW: 'ATA' };
export const STYLE_LABEL: Record<Style, string> = { defensive: 'Defensivo', balanced: 'Equilibrado', attacking: 'Ofensivo' };

const CREST_SCALE = { sm: 1, md: 1.5, lg: 2 } as const;

/** Escudo do clube em pixel art (SVG). Tudo é derivado do clube — nada é salvo. */
export function Badge({ club, size = 'md' }: { club: Club; size?: 'sm' | 'md' | 'lg' }) {
  const grid = crestGrid(club, size === 'sm' ? 'mini' : 'full');
  const k = CREST_SCALE[size];
  return (
    <svg
      className={`badge ${size}`}
      width={grid.w * k}
      height={grid.h * k}
      viewBox={`0 0 ${grid.w} ${grid.h}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Escudo ${club.short}`}
    >
      <title>{club.name}</title>
      {crestRects(grid).map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.c} />)}
    </svg>
  );
}

// ---------------------------------------------------------------- cores de partida

const rgb = (hex: string) => {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)) as [number, number, number];
};
/** Distância perceptiva aproximada ("redmean") entre duas cores. */
export function colorDistance(a: string, b: string) {
  const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b);
  const rm = (r1 + r2) / 2, dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}
const luminance = (hex: string) => { const [r, g, b] = rgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
const textOn = (bg: string) => (luminance(bg) > 0.6 ? '#241a2e' : '#ffffff');

export interface SideColor { bg: string; fg: string }

/**
 * Cor de cada lado na partida. O mandante usa a cor principal; o visitante troca para
 * a secundária (ou para um neutro) quando as duas ficariam parecidas, como um uniforme reserva.
 */
export function matchColors(home: Club, away: Club): { home: SideColor; away: SideColor } {
  const h = home.colors[0];
  const MIN = 190;
  const candidates = [away.colors[0], away.colors[1], '#1d2340', '#f6ecd6', '#2f5fbf', '#c8323c'];
  const a = candidates.find((c) => colorDistance(c, h) >= MIN) ?? candidates[2]!;
  return { home: { bg: h, fg: textOn(h) }, away: { bg: a, fg: textOn(a) } };
}

export function ClubName({ club }: { club: Club }) {
  return <span className="clubname"><Badge club={club} size="sm" />{club.name}</span>;
}

export function Bar({ value, max = 100, tone }: { value: number; max?: number; tone?: 'good' | 'warn' | 'bad' | 'accent' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const t = tone ?? (pct >= 70 ? 'good' : pct >= 45 ? 'warn' : 'bad');
  return <span className="bar"><span className={`fill ${t}`} style={{ width: `${pct}%` }} /></span>;
}

export function Modal({ title, onClose, children, wide, className = '' }: { title: string; onClose?: () => void; children: ReactNode; wide?: boolean; className?: string }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className={`window ${wide ? 'wide' : ''} ${className}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <header className="window-title">
          <span>{title}</span>
          {onClose && <button className="x" onClick={onClose} aria-label="Fechar">✕</button>}
        </header>
        <div className="window-body">{children}</div>
      </div>
    </div>
  );
}

export function Stars({ n, max = 5 }: { n: number; max?: number }) {
  return <span className="stars" aria-label={`${n} de ${max}`}>{Array.from({ length: max }, (_, i) => <i key={i} className={i < n ? 'on' : ''} />)}</span>;
}
