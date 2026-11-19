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

export function ClubName({ club }: { club: Club }) {
  return <span className="clubname"><Badge club={club} size="sm" />{club.name}</span>;
}

export function Bar({ value, max = 100, tone }: { value: number; max?: number; tone?: 'good' | 'warn' | 'bad' | 'accent' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const t = tone ?? (pct >= 70 ? 'good' : pct >= 45 ? 'warn' : 'bad');
  return <span className="bar"><span className={`fill ${t}`} style={{ width: `${pct}%` }} /></span>;
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose?: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className={`window ${wide ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
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
