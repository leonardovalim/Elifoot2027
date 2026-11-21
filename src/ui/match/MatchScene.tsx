import { useEffect, useRef, useState } from 'react';
import { isNarrated } from '../../sports/football/narration';
import type { MatchEvent, Side } from '../../sports/football/types';
import { tintedSheet } from '../scene/tint';
import stadiumUrl from '../../assets/intro/estadio.png';
import athleteUrl from '../../assets/match/atleta.png';
import keeperUrl from '../../assets/match/goleiro.png';
import refereeUrl from '../../assets/match/arbitro.png';

/**
 * Cena do lance na partida assistida: o estádio da abertura e, a cada lance
 * importante (gol, defesa, trave, pra fora, cartão), uma vinheta curta em pixel
 * art com o atacante nas cores do time. Arte gerada no PixelLab; o atleta é
 * recolorido como no CT (ver scene/tint.ts).
 *
 * Canvas 240×100: o estádio (240×136) desenhado 36 px acima, sem o céu.
 */
const W = 240;
const H = 100;
const OFF = -36;
const DURATION = 2600;

type Kind = 'goal' | 'save' | 'post' | 'bar' | 'miss' | 'yellow' | 'red';
const KINDS: ReadonlySet<string> = new Set(['goal', 'save', 'post', 'bar', 'miss', 'yellow', 'red']);

export const LABEL: Record<Kind, string> = { goal: 'GOL!', save: 'DEFESA!', post: 'NA TRAVE!', bar: 'NO TRAVESSÃO!', miss: 'PRA FORA', yellow: 'AMARELO', red: 'EXPULSO!' };

interface Sheet { size: number; feet: number; cx: number; anims: Record<string, readonly [number, number]> }
const ATHLETE: Sheet = { size: 40, feet: 37, cx: 20, anims: { parado: [0, 1], chute: [1, 6], comemora: [7, 9] } };
const KEEPER: Sheet = { size: 40, feet: 37, cx: 20, anims: { parado: [0, 1], salto: [1, 5], chao: [6, 3], defesa: [9, 8] } };
const REFEREE: Sheet = { size: 36, feet: 33, cx: 18, anims: { parado: [0, 1], cartao: [1, 9] } };
/** Onde fica o cartão (branco) na mão levantada, nos 2 últimos quadros do árbitro. */
const CARD_AT = { x: 19, y: 9 };

/** Gol da arte (coordenadas do canvas, já com o deslocamento). */
const GOAL = { left: 194, right: 222, top: 85 + OFF, bottom: 108 + OFF };
const STANDS = { top: 56 + OFF, bottom: 95 + OFF };
const KEEPER_AT = { x: 210, feet: 73 };
const SHOT = { from: 112, to: 140, feet: 90 };

export interface Vignette { kind: Kind; side: Side; key: number }

/** O lance mais recente que merece vinheta, entre os eventos novos (só o que a narração mostra). */
export function pickVignette(events: MatchEvent[], seen: number): MatchEvent | null {
  for (let i = events.length - 1; i >= seen; i--) {
    const e = events[i]!;
    if (KINDS.has(e.type) && isNarrated(e)) return e;
  }
  return null;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function frame(c: CanvasRenderingContext2D, img: CanvasImageSource, sh: Sheet, anim: string, i: number, x: number, feetY: number) {
  const [start, n] = sh.anims[anim] ?? [0, 1];
  const f = start + Math.max(0, Math.min(n - 1, Math.floor(i)));
  c.drawImage(img, f * sh.size, 0, sh.size, sh.size, Math.round(x - sh.cx), Math.round(feetY - sh.feet), sh.size, sh.size);
}

function ball(c: CanvasRenderingContext2D, x: number, y: number, ground: number) {
  c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(Math.round(x), Math.round(ground) + 3, 4, 1);
  c.fillStyle = '#1a1420'; c.fillRect(Math.round(x), Math.round(y) + 1, 4, 2); c.fillRect(Math.round(x) + 1, Math.round(y), 2, 4);
  c.fillStyle = '#ffffff'; c.fillRect(Math.round(x) + 1, Math.round(y) + 1, 2, 2);
}

/** Para onde vai a bola em cada tipo de lance (e onde termina depois). */
function ballPath(kind: Kind, key: number) {
  const corner = key % 2 ? { x: 198, y: GOAL.top + 4 } : { x: 215, y: GOAL.top + 6 };
  switch (kind) {
    case 'goal': return { end: corner, rest: { x: corner.x + 2, y: GOAL.bottom - 8 } };
    case 'save': return { end: { x: KEEPER_AT.x - 9, y: KEEPER_AT.feet - 13 }, rest: { x: KEEPER_AT.x - 9, y: KEEPER_AT.feet - 13 } };
    case 'post': return { end: { x: GOAL.left - 1, y: GOAL.top + 10 }, rest: { x: 172, y: 80 } };
    case 'bar': return { end: { x: 207, y: GOAL.top - 1 }, rest: { x: 186, y: 30 } };
    default: return { end: { x: 236, y: GOAL.top - 18 }, rest: { x: 250, y: GOAL.top - 24 } };
  }
}

export function drawMatchScene(
  c: CanvasRenderingContext2D, art: Art, v: Vignette | null, t: number, time: number,
  kits: Record<Side, [string, string]>,
) {
  c.imageSmoothingEnabled = false;
  const celebrating = v?.kind === 'goal' && t > 0.62;
  c.drawImage(art.stadium, 0, OFF);
  if (celebrating) { // torcida pulando
    const h = STANDS.bottom - STANDS.top;
    for (let x = 0; x < W; x += 12) {
      // ola: blocos de 12 px sobem e descem devagar, em onda (sem cintilar)
      const off = Math.round(Math.max(0, Math.sin(time * 5 - x * 0.05)) * 2);
      if (off) c.drawImage(art.stadium, x, STANDS.top - OFF, 12, h, x, STANDS.top - off, 12, h);
    }
  }
  // rede (balança no gol)
  const ripple = v?.kind === 'goal' ? clamp01(1 - (t - 0.6) / 0.35) * (t > 0.6 ? 1 : 0) : 0;
  c.fillStyle = 'rgba(236,240,236,0.22)';
  for (let i = 0; i <= 9; i++) {
    const x = GOAL.left + 1 + ((GOAL.right - GOAL.left - 2) * i) / 9;
    for (let y = GOAL.top + 1; y <= GOAL.bottom; y++) c.fillRect(Math.round(x + Math.sin(time * 9 + y * 0.35) * ripple * 1.2), y, 1, 1);
  }
  for (let j = 0; j <= 7; j++) c.fillRect(GOAL.left + 1, Math.round(GOAL.top + 1 + ((GOAL.bottom - GOAL.top - 1) * j) / 7), GOAL.right - GOAL.left - 2, 1);

  const attackSide: Side = v?.side ?? 'home';
  const defendSide: Side = attackSide === 'home' ? 'away' : 'home';
  const athlete = (s: Side) => tintedSheet(art.athlete, kits[s], '#e0a878');

  if (!v) { // bola parada no meio, um de cada time e o goleiro
    frame(c, art.keeper, KEEPER, 'parado', 0, KEEPER_AT.x, KEEPER_AT.feet);
    frame(c, athlete('away'), ATHLETE, 'parado', 0, 150, 82);
    frame(c, athlete('home'), ATHLETE, 'parado', 0, 104, 90);
    ball(c, 114, 86, 86);
    return;
  }

  if (v.kind === 'yellow' || v.kind === 'red') {
    frame(c, athlete(v.side), ATHLETE, 'parado', 0, 132, 88);
    frame(c, art.keeper, KEEPER, 'parado', 0, KEEPER_AT.x, KEEPER_AT.feet);
    const i = seg(t, 0, 0.55) * 9;
    frame(c, art.referee, REFEREE, 'cartao', i, 112, 90);
    if (i >= 7) {
      c.fillStyle = v.kind === 'red' ? '#e0302a' : '#ffd23f';
      c.fillRect(Math.round(112 - REFEREE.cx + CARD_AT.x), Math.round(90 - REFEREE.feet + CARD_AT.y), 3, 4);
    }
    return;
  }

  // zagueiro do outro time, parado na frente da área
  frame(c, athlete(defendSide), ATHLETE, 'parado', 0, 168, 80);

  // goleiro
  const { end, rest } = ballPath(v.kind, v.key);
  if (v.kind === 'save') {
    frame(c, art.keeper, KEEPER, t < 0.42 ? 'parado' : 'defesa', seg(t, 0.42, 0.75) * 8, KEEPER_AT.x, KEEPER_AT.feet);
  } else if (t < 0.45) {
    frame(c, art.keeper, KEEPER, 'parado', 0, KEEPER_AT.x, KEEPER_AT.feet);
  } else if (v.kind === 'goal' && t > 0.68) {
    frame(c, art.keeper, KEEPER, 'chao', seg(t, 0.68, 0.8) * 3, KEEPER_AT.x + (end.x < KEEPER_AT.x ? -12 : 4), KEEPER_AT.feet);
  } else {
    const d = seg(t, 0.45, 0.68);
    const dir = end.x < KEEPER_AT.x ? -1 : 1;
    frame(c, art.keeper, KEEPER, 'salto', d * 5, KEEPER_AT.x + dir * d * 8, KEEPER_AT.feet - Math.round(Math.sin(d * Math.PI) * 3));
  }

  // atacante: corre, chuta e (no gol) comemora
  const run = seg(t, 0, 0.32);
  const ax = lerp(SHOT.from, SHOT.to, run);
  if (celebrating) frame(c, athlete(v.side), ATHLETE, 'comemora', ((t - 0.62) * 30) % 9, SHOT.to + (t - 0.62) * 30, SHOT.feet);
  else frame(c, athlete(v.side), ATHLETE, 'chute', Math.min(5, seg(t, 0, 0.5) * 6), ax, SHOT.feet);

  // bola
  const kick = { x: SHOT.to + 8, y: SHOT.feet - 4 };
  if (t < 0.3) ball(c, kick.x, kick.y, kick.y);
  else if (t < 0.6) {
    const f = seg(t, 0.3, 0.6);
    const ctl = { x: (kick.x + end.x) / 2, y: Math.min(kick.y, end.y) - 18 };
    const a = (1 - f) * (1 - f), b = 2 * (1 - f) * f, cc = f * f;
    const bx = a * kick.x + b * ctl.x + cc * end.x, by = a * kick.y + b * ctl.y + cc * end.y;
    for (let k = 1; k <= 3; k++) { c.fillStyle = `rgba(255,255,255,${0.35 - k * 0.09})`; c.fillRect(Math.round(bx - k * 3), Math.round(by + k), 3, 3); }
    ball(c, bx, by, lerp(kick.y, GOAL.bottom - 4, f));
  } else if (v.kind !== 'save' || t < 0.75) {
    const f = seg(t, 0.6, 0.85);
    const bx = lerp(end.x, rest.x, f), by = Math.min(rest.y + (v.kind === 'bar' ? 0 : 0), lerp(end.y, rest.y, f) + (v.kind === 'goal' ? (f * f) * 6 : 0));
    if (v.kind !== 'save') ball(c, bx, by, GOAL.bottom - 4);
  }
  if (v.kind === 'goal' && t > 0.6 && t < 0.7) { c.fillStyle = `rgba(255,255,255,${0.5 * (1 - (t - 0.6) / 0.1)})`; c.fillRect(0, 0, W, H); }
}

interface Art { stadium: HTMLImageElement; athlete: HTMLImageElement; keeper: HTMLImageElement; referee: HTMLImageElement }

interface Props {
  events: MatchEvent[];
  /** Cores do placar (fundo/texto) de cada lado, para a etiqueta do lance. */
  colors: Record<Side, { bg: string; fg: string }>;
  /** Uniforme de cada lado: [camisa, calção]. */
  kits: Record<Side, [string, string]>;
  shorts: Record<Side, string>;
}

export function MatchScene({ events, colors, kits, shorts }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [art, setArt] = useState<Art | null>(null);
  const seen = useRef(events.length);
  const vignette = useRef<{ v: Vignette; start: number } | null>(null);
  const [label, setLabel] = useState<{ text: string; side: Side; key: number } | null>(null);
  const kitsRef = useRef(kits);
  kitsRef.current = kits;

  useEffect(() => {
    let alive = true;
    const load = (src: string) => new Promise<HTMLImageElement>((ok, fail) => { const im = new Image(); im.onload = () => ok(im); im.onerror = fail; im.src = src; });
    Promise.all([load(stadiumUrl), load(athleteUrl), load(keeperUrl), load(refereeUrl)])
      .then(([stadium, athlete, keeper, referee]) => { if (alive) setArt({ stadium, athlete, keeper, referee }); })
      .catch(() => { /* sem arte: a cena some e fica só a narração */ });
    return () => { alive = false; };
  }, []);

  // lance novo → vinheta
  useEffect(() => {
    const e = pickVignette(events, seen.current);
    seen.current = events.length;
    if (!e || !('side' in e)) return;
    const key = events.length;
    vignette.current = { v: { kind: e.type as Kind, side: e.side, key }, start: performance.now() };
    setLabel({ text: LABEL[e.type as Kind], side: e.side, key });
  }, [events.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx || !art) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const loop = (now: number) => {
      const cur = vignette.current;
      let t = 0;
      if (cur) {
        t = reduced ? 0.99 : (now - cur.start) / DURATION;
        if (t >= 1.25) { vignette.current = null; setLabel(null); }
      }
      drawMatchScene(ctx, art, vignette.current?.v ?? null, Math.min(1, t), now / 1000, kitsRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [art]);

  if (!art) return null;
  return (
    <div className="match-scene" aria-hidden="true">
      <canvas ref={canvas} width={W} height={H} />
      {label && (
        <span key={label.key} className={`ms-label ${label.text === 'GOL!' ? 'big' : ''}`} style={{ background: colors[label.side].bg, color: colors[label.side].fg }}>
          {label.text} <small>{shorts[label.side]}</small>
        </span>
      )}
    </div>
  );
}
