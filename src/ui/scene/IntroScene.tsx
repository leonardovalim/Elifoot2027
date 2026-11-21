import { useEffect, useRef } from 'react';
import { INTRO_END, introState, type IntroState } from './introTimeline';
import { drawPlayer, lookFor, SPRITE_H } from './sprites';
import stadiumUrl from '../../assets/intro/estadio.png';

/**
 * Abertura em pixel art: estádio à noite, refletores acendendo, cobrança de
 * falta no ângulo e a torcida explodindo. O cenário é arte gerada no PixelLab
 * (src/assets/intro); enquanto ela não carrega, ou se falhar, a cena usa o
 * cenário desenhado em código.
 */
const W = 240;
const H = 135;
const TOWERS = [18, 78, 162, 222];
type Pt = { x: number; y: number };

/*
 * Gol do lado direito visto pela câmera de TV (lateral, do alto).
 * Quanto mais longe da câmera, mais alto na tela, menor e mais perto do centro:
 * a linha de fundo sobe inclinada, o poste do fundo é mais baixo que o da
 * frente e a rede se estende para a direita, atrás da linha.
 */
const POST_NEAR = { base: { x: 198, y: 121 }, top: { x: 198, y: 100 } };
const POST_FAR = { base: { x: 190, y: 99 }, top: { x: 190, y: 85 } };
const NET_NEAR = { base: { x: 210, y: 121 }, top: { x: 207, y: 106 } };
const NET_FAR = { base: { x: 200, y: 99 }, top: { x: 198, y: 90 } };
/** Inclinação da linha de fundo: dx por pixel de y. */
const END_SLOPE = (POST_NEAR.base.x - POST_FAR.base.x) / (POST_NEAR.base.y - POST_FAR.base.y);
const endLineX = (y: number) => POST_NEAR.base.x + (y - POST_NEAR.base.y) * END_SLOPE;

const BALL_START = { x: 96, y: 118 };
const BALL_CTRL = { x: 150, y: 52 };
/** Ângulo do fundo: rente ao travessão, perto do poste mais distante. */
const BALL_END = { x: 193, y: 89 };
/** Chão sob o ponto de chegada (entre a linha da frente e a do fundo). */
const GROUND_END = 108;
const BALL_REST = { x: 201, y: 106 };

const HOME = lookFor('intro-kicker', '#e4563c', '#ffffff');
const KEEPER = lookFor('intro-keeper', '#3a9a4b', '#1d2340');
const WALL = ['w1', 'w2', 'w3', 'w4'].map((id) => lookFor(id, '#2a3160', '#f2b632'));
/**
 * Barreira em fila paralela à linha de fundo: na câmera de TV ela "entra" na
 * tela, então cada jogador fica um pouco mais alto (mais longe) e deslocado
 * na mesma inclinação da linha de fundo. Centro sobre a reta bola → gol.
 */
const WALL_CENTER = { x: 150, ground: 114 };
const WALL_SPOTS = [-7.5, -2.5, 2.5, 7.5].map((dy) => {
  const ground = WALL_CENTER.ground + dy;
  return { x: Math.round(WALL_CENTER.x + dy * END_SLOPE), ground: Math.round(ground) };
});
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

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Linha pixelada (Bresenham), sem antisserrilhado. */
function line(c: CanvasRenderingContext2D, a: Pt, b: Pt, w = 1) {
  let x0 = Math.round(a.x), y0 = Math.round(a.y);
  const x1 = Math.round(b.x), y1 = Math.round(b.y);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    c.fillRect(x0, y0, w, w);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** Malha da rede num quadrilátero (a->b uma borda, d->cc a oposta), com balanço opcional. */
function mesh(c: CanvasRenderingContext2D, a: Pt, b: Pt, cc: Pt, d: Pt, nu: number, nv: number, sway: (p: Pt) => Pt) {
  for (let i = 0; i <= nu; i++) line(c, sway(lerp(a, b, i / nu)), sway(lerp(d, cc, i / nu)));
  for (let j = 0; j <= nv; j++) line(c, sway(lerp(a, d, j / nv)), sway(lerp(b, cc, j / nv)));
}

/** Onde a jogada acontece: muda conforme o cenário (desenhado em código ou arte gerada). */
interface PlayLayout {
  ballEnd: Pt;
  ballRest: Pt;
  groundEnd: number;
  ctrl: Pt;
  keeperX: number;
  keeperBase: number;
  /** Para que lado o goleiro salta (px no fim do salto). */
  keeperDive: number;
}

const CLASSIC_PLAY: PlayLayout = {
  ballEnd: BALL_END, ballRest: BALL_REST, groundEnd: GROUND_END, ctrl: BALL_CTRL, keeperX: 184, keeperBase: 97, keeperDive: -2,
};

function bezier(t: number, L: PlayLayout) {
  const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
  return { x: a * BALL_START.x + b * L.ctrl.x + c * L.ballEnd.x, y: a * BALL_START.y + b * L.ctrl.y + c * L.ballEnd.y };
}

function drawPlay(c: CanvasRenderingContext2D, s: IntroState, time: number, L: PlayLayout) {
  // barreira
  const wallJump = s.flight > 0 && s.flight < 0.6 ? -Math.round(Math.sin(s.flight / 0.6 * Math.PI) * 5) : 0;
  // do mais distante para o mais próximo, para quem está na frente cobrir quem está atrás
  WALL_SPOTS.forEach((spot, i) => drawPlayer(c, WALL[i]!, spot.x - 4, spot.ground - SPRITE_H + 1 + wallJump, 0, true));

  // goleiro: na linha, salta para o ângulo do fundo e não alcança
  const dive = s.flight > 0.45 ? Math.min(1, (s.flight - 0.45) / 0.4) : 0;
  const keeperBase = L.keeperBase;
  const keeperY = keeperBase - Math.round(dive * 10) + (s.sinceGoal > 0.3 ? Math.min(10, Math.round((s.sinceGoal - 0.3) * 20)) : 0);
  drawPlayer(c, KEEPER, L.keeperX + Math.round(dive * L.keeperDive), Math.min(keeperBase, keeperY), 0, true);

  // cobrador
  const kx = Math.round(58 + s.run * 28);
  const celebrating = s.sinceGoal >= 0;
  drawPlayer(c, HOME, celebrating ? kx + Math.round(Math.min(1, s.sinceGoal) * 10) : kx, 107 - (celebrating && Math.sin(time * 10) > 0 ? 3 : 0), s.run > 0 && s.run < 1 ? Math.floor(time * 10) : 0, false);

  // bola: curva até o ângulo, estufa a rede e cai dentro do gol
  let bx = BALL_START.x, by = BALL_START.y, ground = BALL_START.y + 2;
  if (s.sinceGoal >= 0) {
    const k = Math.min(1, s.sinceGoal / 0.25);
    bx = L.ballEnd.x + (L.ballRest.x - L.ballEnd.x) * k;
    by = Math.min(L.ballRest.y, L.ballEnd.y + 3 * k + Math.max(0, s.sinceGoal - 0.2) ** 2 * 120);
    ground = L.ballRest.y + 2;
  } else if (s.flight > 0) {
    ({ x: bx, y: by } = bezier(s.flight, L));
    ground = BALL_START.y + 2 + (L.groundEnd - BALL_START.y - 2) * s.flight;
  }
  if (s.flight > 0 && s.sinceGoal < 0) {
    // rastro
    for (let k = 1; k <= 3; k++) {
      const p = bezier(Math.max(0, s.flight - k * 0.04), L);
      c.fillStyle = `rgba(255,255,255,${0.35 - k * 0.1})`; c.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
    }
  }
  c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(Math.round(bx), Math.round(ground), 3, 1);
  c.fillStyle = '#ffffff'; c.fillRect(Math.round(bx), Math.round(by), 3, 3);
  c.fillStyle = '#1a1420'; c.fillRect(Math.round(bx) + 1, Math.round(by) + 1, 1, 1);
}

function drawEffects(c: CanvasRenderingContext2D, s: IntroState) {
  if (s.sinceGoal >= 0 && s.sinceGoal < 0.35) { c.fillStyle = `rgba(255,255,255,${0.55 * (1 - s.sinceGoal / 0.35)})`; c.fillRect(0, 0, W, H); }
  if (s.sinceGoal >= 0 && s.sinceGoal < 3) {
    const t = s.sinceGoal;
    for (const p of CONFETTI) {
      const y = 40 + p.vy * t + 30 * t * t;
      if (y > H) continue;
      c.fillStyle = p.color; c.fillRect(Math.round(p.x + p.vx * t), Math.round(y), 1, 2);
    }
  }
}

/*
 * Cenário com arte gerada (PixelLab): estádio já iluminado. A cena escurece
 * tudo e apaga cada refletor até a vez dele, faz a torcida pular no gol e põe
 * a rede (que balança) na boca do gol desenhado na arte.
 */
const ART_GOAL = { left: 194, right: 222, top: 85, bottom: 108 };
/** Refletores da arte, da esquerda para a direita (centro da lâmpada). */
const ART_LAMPS = [{ x: 6, y: 12 }, { x: 78, y: 19 }, { x: 152, y: 12 }, { x: 230, y: 2 }];
const ART_STANDS = { top: 56, bottom: 95 };
const ART_PLAY: PlayLayout = {
  ballEnd: { x: 216, y: 88 }, ballRest: { x: 210, y: 104 }, groundEnd: 107, ctrl: { x: 160, y: 46 },
  keeperX: 203, keeperBase: 96, keeperDive: 5,
};

export function drawIntroArt(c: CanvasRenderingContext2D, bg: CanvasImageSource, s: IntroState, time: number) {
  const lit = s.lightsOn / 4;
  const cheering = s.sinceGoal >= 0 && s.sinceGoal < 2.4;
  c.drawImage(bg, 0, 0);

  // torcida pulando: faixas verticais da arquibancada sobem e descem
  if (cheering) {
    const h = ART_STANDS.bottom - ART_STANDS.top;
    for (let x = 0; x < W; x += 3) {
      const off = Math.round(Math.abs(Math.sin(time * 12 + x * 0.9)) * 2);
      if (off) c.drawImage(bg, x, ART_STANDS.top, 3, h, x, ART_STANDS.top - off, 3, h);
    }
  }

  // rede na boca do gol (balança depois do gol)
  const g = ART_GOAL;
  const ripple = s.sinceGoal >= 0 ? Math.max(0, 1 - s.sinceGoal / 1.6) : 0;
  const sway = (p: Pt): Pt => (ripple ? { x: p.x + Math.sin(time * 28 + p.y * 0.5) * ripple * 1.6, y: p.y } : p);
  c.fillStyle = 'rgba(236,240,236,0.22)';
  mesh(c, { x: g.left + 1, y: g.top + 1 }, { x: g.right - 1, y: g.top + 1 }, { x: g.right - 1, y: g.bottom }, { x: g.left + 1, y: g.bottom }, 9, 7, sway);

  drawPlay(c, s, time, ART_PLAY);

  // escuridão antes dos refletores; cada refletor apagado ganha uma sombra sobre lâmpada e facho
  if (lit < 1) {
    c.fillStyle = `rgba(8,10,24,${0.55 * (1 - lit)})`; c.fillRect(0, 0, W, H);
    ART_LAMPS.forEach((l, i) => {
      if (i < s.lightsOn) return;
      c.fillStyle = 'rgba(8,10,24,0.55)';
      c.beginPath(); c.moveTo(l.x - 12, 0); c.lineTo(l.x + 12, 0); c.lineTo(l.x + 40, ART_STANDS.top); c.lineTo(l.x - 40, ART_STANDS.top); c.closePath(); c.fill();
      const glow = c.createRadialGradient(l.x, l.y, 0, l.x, l.y, 16);
      glow.addColorStop(0, 'rgba(8,10,24,0.8)'); glow.addColorStop(1, 'rgba(8,10,24,0)');
      c.fillStyle = glow; c.fillRect(l.x - 16, l.y - 16, 32, 32);
    });
  }
  // brilho rápido quando o refletor acende
  ART_LAMPS.forEach((l, i) => {
    if (i >= s.lightsOn) return;
    const glow = c.createRadialGradient(l.x, l.y, 0, l.x, l.y, 14);
    glow.addColorStop(0, 'rgba(255,246,200,0.28)'); glow.addColorStop(1, 'rgba(255,246,200,0)');
    c.fillStyle = glow; c.fillRect(l.x - 14, l.y - 14, 28, 28);
  });

  drawEffects(c, s);
}

export function drawIntro(c: CanvasRenderingContext2D, s: IntroState, time: number) {
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
  // marcações: linha lateral próxima, linha de fundo e áreas em perspectiva
  c.fillStyle = 'rgba(232,240,228,0.85)';
  c.fillRect(0, 130, Math.round(endLineX(130)), 1);
  line(c, { x: endLineX(78), y: 78 }, { x: endLineX(H), y: H });
  const area = (near: number, far: number, depth: number, shrink: number) => {
    const a = { x: endLineX(near) - depth, y: near };
    const b = { x: endLineX(far) - depth * shrink, y: far };
    line(c, a, { x: endLineX(near), y: near });
    line(c, b, { x: endLineX(far), y: far });
    line(c, a, b);
  };
  area(131, 86, 34, 0.82);
  area(114, 95, 12, 0.88);

  // gol: fundo da rede, lateral distante e teto (atrás de tudo)
  const ripple = s.sinceGoal >= 0 ? Math.max(0, 1 - s.sinceGoal / 1.6) : 0;
  const sway = (p: Pt): Pt => (ripple && p.x > POST_FAR.base.x + 2
    ? { x: p.x + Math.sin(time * 28 + p.y * 0.5) * ripple * 1.6, y: p.y }
    : p);
  c.fillStyle = 'rgba(20,40,20,0.18)';
  c.beginPath();
  c.moveTo(POST_FAR.base.x, POST_FAR.base.y); c.lineTo(NET_FAR.base.x, NET_FAR.base.y);
  c.lineTo(NET_NEAR.base.x, NET_NEAR.base.y); c.lineTo(POST_NEAR.base.x, POST_NEAR.base.y);
  c.closePath(); c.fill();
  c.fillStyle = 'rgba(236,240,236,0.38)';
  mesh(c, NET_FAR.base, NET_NEAR.base, NET_NEAR.top, NET_FAR.top, 7, 4, sway);
  mesh(c, POST_FAR.base, NET_FAR.base, NET_FAR.top, POST_FAR.top, 3, 4, sway);
  mesh(c, POST_FAR.top, NET_FAR.top, NET_NEAR.top, POST_NEAR.top, 3, 7, sway);
  // poste do fundo (mais fino e sombreado)
  c.fillStyle = '#d8dce4'; line(c, POST_FAR.base, POST_FAR.top);

  drawPlay(c, s, time, CLASSIC_PLAY);

  // gol: lateral próxima da rede, poste da frente e travessão (na frente da bola)
  c.fillStyle = 'rgba(236,240,236,0.45)';
  mesh(c, POST_NEAR.base, NET_NEAR.base, NET_NEAR.top, POST_NEAR.top, 3, 4, sway);
  c.fillStyle = 'rgba(0,0,0,0.25)';
  line(c, { x: POST_NEAR.base.x + 1, y: POST_NEAR.base.y }, { x: POST_NEAR.base.x + 6, y: POST_NEAR.base.y });
  c.fillStyle = '#ffffff';
  line(c, POST_FAR.top, POST_NEAR.top, 2);
  c.fillRect(POST_NEAR.top.x, POST_NEAR.top.y, 2, POST_NEAR.base.y - POST_NEAR.top.y + 1);
  c.fillStyle = '#c9ced8';
  c.fillRect(POST_NEAR.top.x + 1, POST_NEAR.top.y + 2, 1, POST_NEAR.base.y - POST_NEAR.top.y - 1);

  // escuridão antes dos refletores + cones de luz
  if (lit < 1) { c.fillStyle = `rgba(8,10,24,${0.62 * (1 - lit)})`; c.fillRect(0, 30, W, H - 30); }
  TOWERS.forEach((x, i) => {
    if (i >= s.lightsOn) return;
    c.fillStyle = 'rgba(255,246,200,0.06)';
    c.beginPath(); c.moveTo(x - 4, 8); c.lineTo(x + 6, 8); c.lineTo(x + 40, H); c.lineTo(x - 38, H); c.closePath(); c.fill();
  });

  drawEffects(c, s);
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
    let bg: HTMLImageElement | null = null;
    const img = new Image();
    // com movimento reduzido só um quadro é desenhado: redesenha quando a arte chegar
    img.onload = () => { bg = img; if (reduced) raf = requestAnimationFrame(tick); };
    img.src = stadiumUrl;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = (now - start) / 1000 + offset.current;
      const st = introState(t);
      if (bg) drawIntroArt(ctx, bg, st, reduced ? 0 : t);
      else drawIntro(ctx, st, reduced ? 0 : t);
      if (st.revealed && !revealed.current) { revealed.current = true; reveal.current(); }
      if (!reduced) raf = requestAnimationFrame(tick);
    };
    if (reduced) offset.current = INTRO_END;
    raf = requestAnimationFrame(tick);
    const skipNow = () => { if (!revealed.current) offset.current = INTRO_END; };
    window.addEventListener('pointerdown', skipNow);
    window.addEventListener('keydown', skipNow);
    return () => {
      img.onload = null;
      cancelAnimationFrame(raf);
      window.removeEventListener('pointerdown', skipNow);
      window.removeEventListener('keydown', skipNow);
    };
  }, []);

  return <canvas ref={canvas} width={W} height={H} className="intro-canvas" aria-hidden="true" />;
}
