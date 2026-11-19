/**
 * Sprites procedurais em pixel art — 100% próprios, gerados em código.
 * Cada atleta é um boneco de 9x13 px com cores do clube, tom de pele e cabelo
 * derivados do id (estável entre sessões).
 */

const SKINS = ['#f2c9a0', '#e0a878', '#c68652', '#9a6234', '#6e4224'];
const HAIRS = ['#2b1d14', '#5a3a1e', '#8c5a2b', '#d9b45a', '#1a1a1a', '#b03a2e'];

// Legenda: H cabelo, S pele, E olho, T camisa, t detalhe camisa, P calção, L perna, B chuteira, . vazio
const BODY = [
  '..HHHHH..',
  '.HHHHHHH.',
  '.HSSSSSH.',
  '.SESSSES.',
  '..SSSSS..',
  '.TTTtTTT.',
  'STTTtTTTS',
  'S.TTtTT.S',
  '..PPPPP..',
  '..PP.PP..',
];
const LEGS = [
  ['..LL.LL..', '..BB.BB..', '.........'],
  ['.LL...LL.', '.BB...BB.', '.........'],
];
const COACH_BODY = [
  '..HHHHH..',
  '.HHHHHHH.',
  '.HSSSSSH.',
  '.SESSSES.',
  '..SSSSS..',
  '.JJJwJJJ.',
  'SJJJwJJJS',
  '.JJJwJJcc',
  '..KKKKKcc',
  '..KK.KK..',
];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export interface Look {
  skin: string;
  hair: string;
  shirt: string;
  detail: string;
  shorts: string;
}

export function lookFor(id: string, shirt: string, detail: string): Look {
  const h = hash(id);
  return { skin: SKINS[h % SKINS.length]!, hair: HAIRS[(h >> 4) % HAIRS.length]!, shirt, detail, shorts: detail === '#ffffff' ? '#f4f4f4' : detail };
}

export const SPRITE_W = 9;
export const SPRITE_H = 13;

function paint(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number, map: Record<string, string>, flip: boolean) {
  rows.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      const ch = row[flip ? row.length - 1 - rx : rx]!;
      const color = map[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x + rx, y + ry, 1, 1);
    }
  });
}

export function drawPlayer(ctx: CanvasRenderingContext2D, look: Look, x: number, y: number, frame: number, flip: boolean) {
  const map: Record<string, string> = {
    H: look.hair, S: look.skin, E: '#1a1420', T: look.shirt, t: look.detail, P: look.shorts, L: look.skin, B: '#1a1420',
  };
  // sombra
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(x + 1, y + SPRITE_H - 1, 7, 1);
  paint(ctx, [...BODY, ...LEGS[frame % 2]!], x, y, map, flip);
}

export function drawCoach(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const map: Record<string, string> = {
    H: '#3b2a1e', S: '#e0a878', E: '#1a1420', J: '#2d3b6b', w: '#f4ead5', K: '#3a3a48', c: '#f4ead5', L: '#e0a878', B: '#1a1420',
  };
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(x + 1, y + SPRITE_H - 1, 7, 1);
  paint(ctx, [...COACH_BODY, ...LEGS[frame % 2]!.map((r) => r.replace(/L/g, 'K'))], x, y, map, false);
}

/** Fonte bitmap 3x5 para os "+1" flutuantes — legível em qualquer escala. */
const GLYPHS: Record<string, string[]> = {
  '+': ['...', '.#.', '###', '.#.', '...'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], I: ['###', '.#.', '.#.', '.#.', '###'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'], N: ['#.#', '###', '###', '###', '#.#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'], R: ['##.', '#.#', '##.', '#.#', '#.#'], S: ['.##', '#..', '.#.', '..#', '##.'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'], ' ': ['...', '...', '...', '...', '...'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'], H: ['#.#', '#.#', '###', '#.#', '#.#'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
  K: ['#.#', '##.', '#..', '##.', '#.#'], Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Q: ['.#.', '#.#', '#.#', '##.', '.##'],
};

export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, outline = '#1a1420') {
  const chars = text.toUpperCase().split('');
  const draw = (ox: number, oy: number, c: string) => {
    chars.forEach((ch, i) => {
      const g = GLYPHS[ch];
      if (!g) return;
      g.forEach((row, ry) => {
        for (let rx = 0; rx < 3; rx++) if (row[rx] === '#') { ctx.fillStyle = c; ctx.fillRect(x + ox + i * 4 + rx, y + oy + ry, 1, 1); }
      });
    });
  };
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) draw(ox, oy, outline);
  draw(0, 0, color);
}

export const textWidth = (text: string) => text.length * 4 - 1;
