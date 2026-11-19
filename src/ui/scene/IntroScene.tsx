import { useEffect, useRef } from 'react';
import { INTRO_END, introState, type IntroState } from './introTimeline';
import { drawPlayer, lookFor, SPRITE_H } from './sprites';

/**
 * Abertura em pixel art: estádio à noite, refletores acendendo, cobrança de
 * falta no ângulo e a torcida explodindo. Tudo desenhado em código (sem assets).
 */
const W = 240;
const H = 135;
const TOWERS = [18, 78, 162, 222];
const GOAL = { x: 206, top: 92, bottom: 120, depth: 20 };
const BALL_START = { x: 96, y: 118 };
const BALL_CTRL = { x: 152, y: 58 };
const BALL_END = { x: 210, y: 96 };

const HOME = lookFor('intro-kicker', '#e4563c', '#ffffff');
const KEEPER = lookFor('intro-keeper', '#3a9a4b', '#1d2340');
const WALL = ['w1', 'w2', 'w3'].map((id) => lookFor(id, '#2a3160', '#f2b632'));
const CROWD_COLORS = ['#e4563c', '#f6ecd6', '#f2b632', '#2f5fbf', '#ffffff', '#c8323c', '#ead9b6'];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// torcida e estrelas fixas (determinísticas)
const r = rng(2027);
const CROWD = Array.from({ length: 8 }, (_, row) =>
  Array.from({ length: 80 }, (_, i) => ({ x: i * 3 + (row % 2), color: CROWD_COLORS[Math.floor(r() * CROWD_COLORS.length)]!, phase: r() * 6 })),
);
const STARS = Array.from({ length: 36 }, () => ({ x: Math.floor(r() * W), y: Math.floor(r() * 26), p: r() * 6 }));
const FLAGS = Array.from({ length: 9 }, (_, i) => ({ x: 12 + i * 26 + Math.floor(r() * 8), row: Math.floor(r() * 4), color: i % 2 ? '#e4563c' : '#f2b632' }));
const CONFETTI = Array.from({ length: 70 }, () => ({ x: r() * W, vx: (r() - 0.5) * 30, vy: -20 - r() * 40, color: CROWD_COLORS[Math.floor(r() * CROWD_COLORS.length)]! }));

function bezier(t: number) {
  const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
  return { x: a * BALL_START.x + b * BALL_CTRL.x + c * BALL_END.x, y: a * BALL_START.y + b * BALL_CTRL.y + c * BALL_END.y };
}

function draw(c: CanvasRenderingContext2D, s: IntroState, time: number) {
  const lit = s.lightsOn / 4;
  const cheering = s.sinceGoal >= 0 && s.sinceGoal < 2.4;

  // céu
  const sky = ['#0e1126', '#141936', '#1b2146', '#222a57'];
  sky.forEach((col, i) => { c.fillStyle = col; c.fillRect(0, i * 8, W, 8); });
  c.fillStyle = '#222a57'; c.fillRect(0, 32, W, 8);
  for (const st of STARS) {
    if (Math.sin(time * 2 + st.p) > -0.3) { c.fillStyle = lit > 0.5 ? '#5c6390' : '#c9d0f2'; c.fillRect(st.x, st.y, 1, 1); }
  }

  // torres de iluminação (atrás da arquibancada)
  TOWERS.forEach((x, i) => {
    c.fillStyle = '#3a3f5c'; c.fillRect(x, 8, 2, 28);
    const on = i < s.lightsOn;
    c.fillStyle = on ? '#fff6c8' : '#4a4f6c'; c.fillRect(x - 4, 3, 10, 5);
    if (on) { c.fillStyle = '#ffffff'; c.fillRect(x - 3, 4, 8, 1); }
  });

  // arquibancada
  c.fillStyle = '#2a2440'; c.fillRect(0, 34, W, 40);
  c.fillStyle = '#3b3358'; c.fillRect(0, 33, W, 2);
  CROWD.forEach((row, ri) => {
    const y0 = 37 + ri * 4;
    for (const p of row) {
      const wave = cheering
        ? -Math.abs(Math.sin(time * 12 + p.phase)) * 2
        : Math.sin(time * 3 + p.x * 0.12 + ri) > 0.7 ? -1 : 0;
      c.fillStyle = lit > 0 ? p.color : '#3b3358';
      c.fillRect(p.x, y0 + wave, 2, 2);
      c.fillStyle = lit > 0 ? '#e0a878' : '#2f2a48';
      c.fillRect(p.x, y0 + wave - 1, 2, 1);
    }
  });
  // bandeiras
  if (lit > 0) {
    for (const f of FLAGS) {
      const y = 36 + f.row * 4 - (cheering ? 3 : 0);
      const flap = Math.sin(time * 6 + f.x) > 0 ? 1 : 0;
      c.fillStyle = '#2a2440'; c.fillRect(f.x, y, 1, 7);
      c.fillStyle = f.color; c.fillRect(f.x + 1, y + flap, 5, 3);
    }
  }

  // placas de publicidade
  ['#e4563c', '#f2b632', '#2f5fbf', '#f6ecd6', '#3a9a4b', '#e4563c'].forEach((col, i) => {
    c.fillStyle = lit > 0 ? col : '#2f2a48'; c.fillRect(i * 40, 74, 40, 4);
  });

  // gramado
  for (let i = 0; i < 9; i++) { c.fillStyle = i % 2 ? '#3f8f3c' : '#4aa045'; c.fillRect(0, 78 + i * 7, W, 7); }
  c.fillStyle = '#e8f0e4'; c.fillRect(0, 122, W, 1);

  // gol (visão lateral) com rede que balança após o gol
  const ripple = s.sinceGoal >= 0 ? Math.max(0, 1 - s.sinceGoal / 1.6) : 0;
  c.fillStyle = 'rgba(240,240,240,0.55)';
  for (let y = GOAL.top + 2; y < GOAL.bottom; y += 3) {
    for (let x = GOAL.x + 2; x < GOAL.x + GOAL.depth; x += 3) {
      const dx = ripple ? Math.round(Math.sin(time * 30 + y * 0.6) * ripple * 2) : 0;
      c.fillRect(x + dx, y, 1, 1);
    }
  }
  c.fillStyle = '#ffffff';
  c.fillRect(GOAL.x, GOAL.top, GOAL.depth + 1, 2);
  c.fillRect(GOAL.x, GOAL.top, 2, GOAL.bottom - GOAL.top);
  c.fillRect(GOAL.x + GOAL.depth, GOAL.top, 1, GOAL.bottom - GOAL.top);

  // barreira
  const wallJump = s.flight > 0 && s.flight < 0.6 ? -Math.round(Math.sin(s.flight / 0.6 * Math.PI) * 5) : 0;
  WALL.forEach((look, i) => drawPlayer(c, look, 138 + i * 9, 107 + wallJump, 0, true));

  // goleiro: salta em direção ao ângulo e não alcança
  const dive = s.flight > 0.45 ? Math.min(1, (s.flight - 0.45) / 0.4) : 0;
  const keeperY = 107 - Math.round(dive * 9) + (s.sinceGoal > 0.3 ? Math.min(9, Math.round((s.sinceGoal - 0.3) * 20)) : 0);
  drawPlayer(c, KEEPER, 214 - Math.round(dive * 4), Math.min(107, keeperY), 0, true);

  // cobrador
  const kx = Math.round(58 + s.run * 28);
  const celebrating = s.sinceGoal >= 0;
  drawPlayer(c, HOME, celebrating ? kx + Math.round(Math.min(1, s.sinceGoal) * 10) : kx, 107 - (celebrating && Math.sin(time * 10) > 0 ? 3 : 0), s.run > 0 && s.run < 1 ? Math.floor(time * 10) : 0, false);

  // bola
  let bx = BALL_START.x, by = BALL_START.y;
  if (s.sinceGoal >= 0) { bx = 216; by = Math.min(118, BALL_END.y + s.sinceGoal * 40); }
  else if (s.flight > 0) ({ x: bx, y: by } = bezier(s.flight));
  if (s.flight > 0 && s.sinceGoal < 0) {
    // rastro
    for (let k = 1; k <= 3; k++) {
      const p = bezier(Math.max(0, s.flight - k * 0.04));
      c.fillStyle = `rgba(255,255,255,${0.35 - k * 0.1})`; c.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
    }
  }
  c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(Math.round(bx), 120, 3, 1);
  c.fillStyle = '#ffffff'; c.fillRect(Math.round(bx), Math.round(by), 3, 3);
  c.fillStyle = '#1a1420'; c.fillRect(Math.round(bx) + 1, Math.round(by) + 1, 1, 1);

  // escuridão antes dos refletores + cones de luz
  if (lit < 1) { c.fillStyle = `rgba(8,10,24,${0.62 * (1 - lit)})`; c.fillRect(0, 30, W, H - 30); }
  TOWERS.forEach((x, i) => {
    if (i >= s.lightsOn) return;
    c.fillStyle = 'rgba(255,246,200,0.06)';
    c.beginPath(); c.moveTo(x - 4, 8); c.lineTo(x + 6, 8); c.lineTo(x + 40, H); c.lineTo(x - 38, H); c.closePath(); c.fill();
  });

  // flash e confete do gol
  if (s.sinceGoal >= 0 && s.sinceGoal < 0.35) { c.fillStyle = `rgba(255,255,255,${0.55 * (1 - s.sinceGoal / 0.35)})`; c.fillRect(0, 0, W, H); }
  if (s.sinceGoal >= 0 && s.sinceGoal < 3) {
    const t = s.sinceGoal;
    for (const p of CONFETTI) {
      const y = 40 + p.vy * t + 30 * t * t;
      if (y > H) continue;
      c.fillStyle = p.color; c.fillRect(Math.round(p.x + p.vx * t), Math.round(y), 1, 2);
    }
  }
  void SPRITE_H;
}

interface Props {
  /** Começa direto no estado final (já viu nesta sessão ou prefere menos movimento). */
  skip: boolean;
  onReveal: () => void;
}

export function IntroScene({ skip, onReveal }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const offset = useRef(skip ? INTRO_END : 0);
  const revealed = useRef(false);
  const reveal = useRef(onReveal);
  reveal.current = onReveal;

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = (now - start) / 1000 + offset.current;
      const st = introState(t);
      draw(ctx, st, reduced ? 0 : t);
      if (st.revealed && !revealed.current) { revealed.current = true; reveal.current(); }
      if (!reduced) raf = requestAnimationFrame(tick);
    };
    if (reduced) offset.current = INTRO_END;
    raf = requestAnimationFrame(tick);
    const skipNow = () => { if (!revealed.current) offset.current = INTRO_END; };
    window.addEventListener('pointerdown', skipNow);
    window.addEventListener('keydown', skipNow);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointerdown', skipNow);
      window.removeEventListener('keydown', skipNow);
    };
  }, []);

  return <canvas ref={canvas} width={W} height={H} className="intro-canvas" aria-hidden="true" />;
}
