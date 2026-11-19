import { useEffect, useRef } from 'react';
import { scenePresentation } from './scenePresentation';
import { sceneDetails } from './sceneDetails';
import { drawCoach, drawPlayer, drawText, lookFor, textWidth, SPRITE_H, SPRITE_W, type Look } from './sprites';

export interface ScenePlayer {
  id: string;
  label: string;
}

export interface SceneGain {
  playerId: string;
  text: string;
}

interface Props {
  players: ScenePlayer[];
  colors: [string, string];
  trainingCenter: number;
  gains: SceneGain[];
  gainsKey: string;
  paused: boolean;
}

const W = 240;
const H = 135;
const FIELD = { x: 8, y: 40, w: 224, h: 88 };

interface Actor {
  id: string;
  look: Look;
  x: number;
  y: number;
  tx: number;
  ty: number;
  wait: number;
  flip: boolean;
}

interface Float { x: number; y: number; text: string; life: number }

function rand(seed: { v: number }) {
  seed.v = (seed.v * 1664525 + 1013904223) >>> 0;
  return seed.v / 4294967296;
}

/** Centro de treinamento em pixel art: atletas treinando, bola rodando e "+1" flutuando. */
export function CtScene({ players, colors, trainingCenter, gains, gainsKey, paused }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const actors = useRef<Actor[]>([]);
  const floats = useRef<Float[]>([]);
  const ball = useRef({ x: W / 2, y: FIELD.y + FIELD.h / 2, from: 0, to: 1, t: 1 });
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // sincroniza atores com o elenco
  useEffect(() => {
    const seed = { v: 7 };
    const existing = new Map(actors.current.map((a) => [a.id, a]));
    actors.current = players.slice(0, 16).map((p) => {
      const old = existing.get(p.id);
      if (old) return old;
      const x = FIELD.x + 10 + rand(seed) * (FIELD.w - 30);
      const y = FIELD.y + 4 + rand(seed) * (FIELD.h - 20);
      return { id: p.id, look: lookFor(p.id, colors[0], colors[1]), x, y, tx: x, ty: y, wait: Math.floor(rand(seed) * 120), flip: false };
    });
  }, [players, colors]);

  // novos ganhos de treino viram "+1 ATR" flutuando sobre o atleta
  useEffect(() => {
    for (const g of gains) {
      const a = actors.current.find((x) => x.id === g.playerId);
      const x = a ? a.x + SPRITE_W / 2 : FIELD.x + FIELD.w / 2;
      const y = a ? a.y - 3 : FIELD.y;
      floats.current.push({ x: x - textWidth(g.text) / 2, y, text: g.text, life: 70 });
    }
  }, [gainsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let frame = 0;
    let hasDrawn = false;
    const seed = { v: 99 };
    const details = sceneDetails(trainingCenter);

    const tick = () => {
      const moving = !pausedRef.current;
      if (moving) {
        frame++;
        // atores
        for (const a of actors.current) {
          if (a.wait > 0) { a.wait--; continue; }
          const dx = a.tx - a.x, dy = a.ty - a.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 1) {
            a.wait = 30 + Math.floor(rand(seed) * 150);
            a.tx = Math.max(FIELD.x + 4, Math.min(FIELD.x + FIELD.w - 14, a.x + (rand(seed) - 0.5) * 80));
            a.ty = Math.max(FIELD.y + 2, Math.min(FIELD.y + FIELD.h - 16, a.y + (rand(seed) - 0.5) * 40));
          } else {
            const sp = 0.35;
            a.x += (dx / dist) * sp;
            a.y += (dy / dist) * sp;
            a.flip = dx < 0;
          }
        }
        // bola: passes entre atletas
        const b = ball.current;
        const list = actors.current;
        if (list.length > 1) {
          b.t += 0.025;
          if (b.t >= 1) { b.from = b.to; b.to = Math.floor(rand(seed) * list.length); b.t = 0; }
          const f = list[b.from % list.length]!, t = list[b.to % list.length]!;
          const ease = Math.min(1, b.t);
          b.x = f.x + 4 + (t.x - f.x) * ease;
          b.y = f.y + 11 + (t.y - f.y) * ease - Math.sin(ease * Math.PI) * 6;
        }

        draw(ctx, frame);
        hasDrawn = true;
      } else if (!hasDrawn) {
        // Uma cena que começa pausada ainda precisa de um primeiro quadro.
        draw(ctx, frame);
        hasDrawn = true;
      }
      raf = requestAnimationFrame(tick);
    };

    const draw = (c: CanvasRenderingContext2D, fr: number) => {
      // céu e prédio do CT
      c.fillStyle = '#9fd3e8'; c.fillRect(0, 0, W, 40);
      c.fillStyle = '#c3e4f0'; c.fillRect(0, 0, W, 12);
      // nuvens
      c.fillStyle = '#ffffff';
      const cx = (fr * 0.05) % (W + 40) - 40;
      c.fillRect(cx, 8, 18, 4); c.fillRect(cx + 4, 5, 10, 3);
      c.fillRect((cx + 130) % (W + 40) - 20, 14, 14, 3);
      // silhueta do bairro atrás do CT
      c.fillStyle = '#7699ad';
      c.fillRect(0, 31, 10, 9); c.fillRect(5, 27, 8, 13); c.fillRect(91, 30, 14, 10); c.fillRect(105, 25, 12, 15);
      c.fillRect(120, 31, 18, 9); c.fillRect(140, 28, 10, 12); c.fillRect(154, 31, 22, 9);
      c.fillStyle = '#5b7d92';
      c.fillRect(7, 29, 3, 2); c.fillRect(108, 27, 5, 2); c.fillRect(143, 30, 4, 2);
      // arquibancada / prédio
      c.fillStyle = '#7a5a46'; c.fillRect(14, 18, 70, 22);
      c.fillStyle = '#a77b5e'; c.fillRect(14, 16, 70, 3);
      c.fillStyle = colors[0]; c.fillRect(14, 22, 70, 3);
      c.fillStyle = '#5a3e38'; c.fillRect(17, 34, 64, 6);
      c.fillStyle = '#ffe9a8';
      for (let i = 0; i < details.litWindows; i++) { c.fillRect(20 + i * 10, 28, 5, 4); }
      c.fillStyle = '#33283a'; c.fillRect(45, 33, 9, 7);
      c.fillStyle = '#f2b632'; c.fillRect(47, 34, 5, 5);
      c.fillStyle = '#f4ead5'; c.fillRect(40, 9, 18, 7);
      drawText(c, 'CT', 45, 10, colors[0], '#f4ead5');
      // placa de evolução da estrutura
      c.fillStyle = '#352d3d'; c.fillRect(88, 20, 29, 10); c.fillStyle = '#d9b45a'; c.fillRect(90, 22, 25, 6);
      drawText(c, details.board === 'elite' ? '5' : details.board === 'pro' ? '3' : '1', 101, 22, '#352d3d', '#d9b45a');
      // estrelas do nível do CT
      for (let i = 0; i < 5; i++) {
        c.fillStyle = i < trainingCenter ? '#ffcc33' : '#5b4a3e';
        c.fillRect(90 + i * 5, 30, 3, 3);
      }
      // refletores
      c.fillStyle = '#4a4a58'; c.fillRect(200, 6, 2, 34); c.fillRect(224, 6, 2, 34);
      c.fillStyle = '#fff6c8'; c.fillRect(197, 4, 8, 3); c.fillRect(221, 4, 8, 3);
      // gramado listrado
      for (let i = 0; i < 14; i++) {
        c.fillStyle = i % 2 ? '#4fa64a' : '#5cb556';
        c.fillRect(0, 40 + i * 7, W, 7);
      }
      // faixas de luz dos refletores e área de apoio do treino
      c.fillStyle = 'rgba(255, 246, 200, 0.10)';
      for (let i = 0; i < details.lightPools; i++) c.fillRect(181 + i * 14, 40, 8, 68);
      c.fillStyle = '#7a5a46'; c.fillRect(12, 112, 27, 3); c.fillRect(15, 115, 2, 5); c.fillRect(34, 115, 2, 5);
      c.fillStyle = '#a77b5e'; c.fillRect(15, 110, 21, 2);
      c.fillStyle = '#6e4a37'; c.fillRect(43, 113, 12, 7); c.fillStyle = '#f2b632'; c.fillRect(45, 115, 2, 2); c.fillRect(49, 115, 2, 2);
      c.fillStyle = '#f2f7ee';
      c.fillRect(FIELD.x, FIELD.y, FIELD.w, 1); c.fillRect(FIELD.x, FIELD.y + FIELD.h - 1, FIELD.w, 1);
      c.fillRect(FIELD.x, FIELD.y, 1, FIELD.h); c.fillRect(FIELD.x + FIELD.w - 1, FIELD.y, 1, FIELD.h);
      c.fillRect(W / 2, FIELD.y, 1, FIELD.h);
      for (let a = 0; a < 32; a++) {
        const ang = (a / 32) * Math.PI * 2;
        c.fillRect(Math.round(W / 2 + Math.cos(ang) * 12), Math.round(FIELD.y + FIELD.h / 2 + Math.sin(ang) * 12), 1, 1);
      }
      // traves
      c.fillStyle = '#ffffff';
      c.fillRect(FIELD.x - 4, FIELD.y + 34, 4, 1); c.fillRect(FIELD.x - 4, FIELD.y + 54, 4, 1); c.fillRect(FIELD.x - 4, FIELD.y + 34, 1, 21);
      c.fillRect(FIELD.x + FIELD.w, FIELD.y + 34, 4, 1); c.fillRect(FIELD.x + FIELD.w, FIELD.y + 54, 4, 1); c.fillRect(FIELD.x + FIELD.w + 3, FIELD.y + 34, 1, 21);
      // cones
      c.fillStyle = '#f07a2a';
      for (let i = 0; i < details.coneCount; i++) { c.fillRect(145 + i * 9, FIELD.y + 70, 3, 2); c.fillRect(146 + i * 9, FIELD.y + 69, 1, 1); }

      // atores ordenados por profundidade
      const sorted = [...actors.current].sort((a, b) => a.y - b.y);
      for (const a of sorted) {
        const walking = a.wait === 0 && !pausedRef.current;
        drawPlayer(c, a.look, Math.round(a.x), Math.round(a.y), walking ? Math.floor(fr / 8) : 0, a.flip);
      }
      drawCoach(c, 20, FIELD.y + FIELD.h - SPRITE_H - 2, Math.floor(fr / 40));

      // bola
      const b = ball.current;
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(Math.round(b.x), Math.round(b.y) + 2, 2, 1);
      c.fillStyle = '#ffffff'; c.fillRect(Math.round(b.x), Math.round(b.y), 2, 2);

      // textos flutuantes
      floats.current = floats.current.filter((f) => f.life > 0);
      for (const f of floats.current) {
        f.life--;
        f.y -= 0.15;
        drawText(c, f.text, Math.round(f.x), Math.round(f.y), '#ffe14d');
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [colors, trainingCenter]);

  const presentation = scenePresentation(trainingCenter, paused, players.length);

  return (
    <div className="scene-shell">
      <canvas ref={canvas} width={W} height={H} className="scene" role="img" aria-label={presentation.label} />
      <div className="scene-status" aria-live="polite">
        <b>{paused ? '⏸ Pausado' : '● Treino ativo'}</b>
        <span>{presentation.detail}</span>
      </div>
    </div>
  );
}
