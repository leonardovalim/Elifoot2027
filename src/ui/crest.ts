/**
 * Escudos de clube em pixel art, 100% derivados do clube (nada vai para o save).
 * Formato, padrão e símbolo vêm do hash do `club.id`; cores, sigla e ano vêm do próprio clube.
 * Reputação alta ganha borda dupla e faixa com o ano de fundação.
 */

export const CREST_SHAPES = ['classico', 'redondo', 'triangulo', 'flamula', 'hexagono', 'chanfrado'] as const;
export const CREST_PATTERNS = ['liso', 'listras', 'diagonal', 'metades', 'xadrez', 'cruz'] as const;
export const CREST_SYMBOLS = ['estrela', 'bola', 'coroa', 'castelo', 'fera', 'aguia'] as const;

export type CrestShape = (typeof CREST_SHAPES)[number];
export type CrestPattern = (typeof CREST_PATTERNS)[number];
export type CrestSymbol = (typeof CREST_SYMBOLS)[number];
export type CrestVariant = 'full' | 'mini';

/** Reputação a partir da qual o escudo ganha borda dupla e ano de fundação. */
export const ELITE_REPUTATION = 70;

export interface CrestClub {
  id: string;
  short: string;
  founded: number;
  colors: [string, string];
  reputation: number;
}

export interface CrestSpec {
  shape: CrestShape;
  pattern: CrestPattern;
  symbol: CrestSymbol;
  /** Faixa diagonal: true = "\" , false = "/". */
  flip: boolean;
  elite: boolean;
  primary: string;
  secondary: string;
  short: string;
  founded: number;
}

export interface CrestGrid {
  w: number;
  h: number;
  /** Cor de cada pixel (linha a linha); null = transparente. */
  px: (string | null)[][];
}

const INK = '#1b1a26';
const GOLD = '#e8b62c';
const PARCHMENT = '#f6e7b0';
const WHITE = '#ffffff';

export function hashId(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  // mistura final (fmix32) para os bits altos/baixos variarem bem com ids parecidos
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function crestSpec(club: CrestClub): CrestSpec {
  const h = hashId(club.id);
  return {
    shape: CREST_SHAPES[h % CREST_SHAPES.length]!,
    pattern: CREST_PATTERNS[(h >>> 5) % CREST_PATTERNS.length]!,
    symbol: CREST_SYMBOLS[(h >>> 10) % CREST_SYMBOLS.length]!,
    flip: ((h >>> 15) & 1) === 1,
    elite: club.reputation >= ELITE_REPUTATION,
    primary: club.colors[0],
    secondary: club.colors[1],
    short: normalizeShort(club.short),
    founded: club.founded,
  };
}

function normalizeShort(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
}

/* ---------- fonte 3x5 (glifos de 10 caracteres têm 2 de largura) ---------- */
const FONT: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111',
  0: '111101101101111', 1: '0111010101', 2: '110001010100111', 3: '110001010001110', 4: '101101111001001',
  5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001110',
};

/* ---------- símbolos (X = cor do símbolo, o = tinta, w = branco) ---------- */
const SYMBOLS: Record<CrestSymbol, string[]> = {
  estrela: ['...X...', '..XXX..', 'XXXXXXX', '.XXXXX.', '..XXX..', '.XX.XX.', 'XX...XX'],
  bola: ['..www..', '.wwoww.', 'wwooowo', 'wowowww', 'wwooowo', '.wwoww.', '..www..'],
  coroa: ['X..X..X', 'XX.X.XX', 'XXXXXXX', 'XoXoXoX', 'XXXXXXX'],
  castelo: ['X.X.X.X', 'XXXXXXX', '.XXXXX.', '.XXoXX.', '.XXoXX.', '.XXXXX.'],
  fera: ['X.....X', 'XX...XX', 'XXXXXXX', 'XoXXXoX', 'XXXXXXX', '.XXoXX.', '..XXX..'],
  aguia: ['X..X..X', 'XX.X.XX', 'XXXXXXX', '.XXXXX.', '..XXX..', '..X.X..'],
};

const MINI_SYMBOLS: Record<CrestSymbol, string[]> = {
  estrela: ['..X..', 'XXXXX', '.XXX.', 'XX.XX'],
  bola: ['.www.', 'wwoww', 'wooow', 'wwoww', '.www.'],
  coroa: ['X.X.X', 'XXXXX', 'XoXoX', 'XXXXX'],
  castelo: ['X.X.X', 'XXXXX', '.XXX.', '.XoX.'],
  fera: ['X...X', 'XXXXX', 'XoXoX', '.XXX.'],
  aguia: ['X.X.X', 'XXXXX', '.XXX.', '..X..'],
};

/* ---------- formatos (coordenadas normalizadas do centro do pixel) ---------- */
function inShape(shape: CrestShape, u: number, v: number): boolean {
  const dx = Math.abs(u - 0.5);
  switch (shape) {
    case 'classico':
      if (v < 0.04 && dx > 0.42) return false; // orelhas no topo
      return v < 0.58 || dx <= 0.5 * Math.sqrt(Math.max(0, 1 - ((v - 0.58) / 0.42) ** 2));
    case 'redondo':
      return (dx / 0.5) ** 2 + ((v - 0.5) / 0.5) ** 2 <= 1;
    case 'triangulo':
      return v < 0.22 || dx <= 0.5 * (1 - (v - 0.22) / 0.78) + 0.02;
    case 'flamula':
      return !(v > 0.78 && dx < ((v - 0.78) / 0.22) * 0.32);
    case 'hexagono': {
      const tip = 0.16;
      if (v < tip) return dx <= 0.5 * (v / tip) + 0.04;
      if (v > 1 - tip) return dx <= 0.5 * ((1 - v) / tip) + 0.04;
      return true;
    }
    case 'chanfrado': {
      const c = 0.2;
      return dx <= 0.5 - Math.max(0, c - v, v - (1 - c)) * 0.9;
    }
  }
}

function patternBit(spec: CrestSpec, x: number, y: number, w: number, h: number, crossY: number): 0 | 1 {
  const u = (x + 0.5) / w, v = (y + 0.5) / h;
  const sw = Math.max(2, Math.round(w / 6.5));
  switch (spec.pattern) {
    case 'liso': return 0;
    case 'listras': return (Math.floor((x - (w % (2 * sw)) / 2) / sw) & 1) === 1 ? 1 : 0;
    case 'diagonal': {
      const d = spec.flip ? u - v : u - (1 - v);
      return Math.abs(d) < 0.19 ? 1 : 0;
    }
    case 'metades': return u >= 0.5 ? 1 : 0;
    case 'xadrez': {
      const cs = sw + 1;
      return ((Math.floor(x / cs) + Math.floor(y / cs)) & 1) === 1 ? 1 : 0;
    }
    case 'cruz': {
      const cw = w / 12;
      return Math.abs(x + 0.5 - w / 2) < cw || Math.abs(v - crossY) * h < cw ? 1 : 0;
    }
  }
}

const SIZES: Record<CrestVariant, { w: number; h: number }> = { full: { w: 20, h: 28 }, mini: { w: 14, h: 16 } };

function build(spec: CrestSpec, variant: CrestVariant): CrestGrid {
  const { w, h } = SIZES[variant];
  const full = variant === 'full';
  const grid: (string | null)[][] = Array.from({ length: h }, () => Array<string | null>(w).fill(null));
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && inShape(spec.shape, (x + 0.5) / w, (y + 0.5) / h);

  // distância à borda (erosão 4-vizinhos) para desenhar anéis
  const depth: number[][] = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (inside(x, y) ? 99 : 0)));
  const rings = spec.elite ? (full ? 3 : 2) : 1;
  for (let r = 1; r <= rings; r++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (depth[y]![x] !== 99) continue;
      const n = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([a, b]) => {
        const d = a! < 0 || b! < 0 || a! >= w || b! >= h ? 0 : depth[b!]![a!]!;
        return d < r;
      });
      if (n) depth[y]![x] = r;
    }
  }
  const accent = [spec.primary, spec.secondary].some((c) => c.toLowerCase() === GOLD) ? WHITE : GOLD;
  const ringColor = (d: number) => (d === 2 ? accent : INK);

  const crossY = full ? 0.22 : 0.42;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = depth[y]![x]!;
    if (d === 0) continue;
    grid[y]![x] = d <= rings ? ringColor(d) : patternBit(spec, x, y, w, h, crossY) ? spec.secondary : spec.primary;
  }

  const ringed = (x: number, y: number) => depth[y]![x]! > 0 && depth[y]![x]! <= rings;

  // símbolo com contorno de tinta
  const sym = SYMBOLS[spec.symbol];
  const symRows = full ? sym : MINI_SYMBOLS[spec.symbol];
  const sh = symRows.length, sww = symRows[0]!.length;
  const sx = Math.floor((w - sww) / 2);
  const sy = full ? 3 + Math.floor((7 - sh) / 2) : Math.floor((h - sh) / 2) - 1;
  // o símbolo tem contorno de tinta: precisa de cor clara para não sumir
  const symFill = luminance(spec.secondary) >= 0.35 ? spec.secondary : luminance(spec.primary) >= 0.35 ? spec.primary : WHITE;
  const symColor = (ch: string) => (ch === 'o' ? INK : ch === 'w' ? WHITE : symFill);
  const isSym = (x: number, y: number) => {
    const r = symRows[y - sy];
    return !!r && x - sx >= 0 && x - sx < sww && r[x - sx] !== '.';
  };
  for (let y = sy - 1; y <= sy + sh; y++) for (let x = sx - 1; x <= sx + sww; x++) {
    if (y < 0 || x < 0 || y >= h || x >= w || isSym(x, y) || !grid[y]![x] || ringed(x, y)) continue;
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (isSym(x + dx, y + dy)) { near = true; break; }
    if (near) grid[y]![x] = INK;
  }
  symRows.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      const ch = row[rx]!;
      if (ch !== '.') grid[sy + ry]![sx + rx] = symColor(ch);
    }
  });

  if (full) {
    // faixa da sigla (atravessa o escudo, como uma placa)
    plate(grid, 0, 11, w, 9, spec.primary);
    text(grid, spec.short, 13, w, spec.secondary);
    if (spec.elite) {
      // fita com o ano de fundação
      plate(grid, 0, 19, w, 7, PARCHMENT);
      text(grid, String(spec.founded).slice(-4), 20, w, INK);
    }
  }

  return { w, h, px: grid };
}

function luminance(hex: string) {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

function plate(grid: (string | null)[][], x0: number, y0: number, pw: number, ph: number, fill: string) {
  for (let y = y0; y < y0 + ph; y++) for (let x = x0; x < x0 + pw; x++) {
    const edge = y === y0 || y === y0 + ph - 1 || x === x0 || x === x0 + pw - 1;
    grid[y]![x] = edge ? INK : fill;
  }
}

function text(grid: (string | null)[][], s: string, y0: number, w: number, color: string) {
  const glyphs = [...s].map((ch) => FONT[ch]).filter((g): g is string => !!g);
  const gw = (g: string) => g.length / 5;
  const width = glyphs.reduce((a, g) => a + gw(g) + 1, -1);
  let x = Math.floor((w - width) / 2);
  for (const g of glyphs) {
    const cw = gw(g);
    for (let k = 0; k < g.length; k++) if (g[k] === '1') grid[y0 + Math.floor(k / cw)]![x + (k % cw)] = color;
    x += cw + 1;
  }
}

const cache = new Map<string, CrestGrid>();

export function crestGrid(club: CrestClub, variant: CrestVariant = 'full'): CrestGrid {
  const spec = crestSpec(club);
  const key = `${variant}|${club.id}|${spec.primary}|${spec.secondary}|${spec.short}|${spec.founded}|${spec.elite}`;
  let g = cache.get(key);
  if (!g) {
    g = build(spec, variant);
    if (cache.size > 500) cache.clear();
    cache.set(key, g);
  }
  return g;
}

/** Agrupa pixels iguais e vizinhos na mesma linha em retângulos (menos nós no SVG). */
export function crestRects(g: CrestGrid): { x: number; y: number; w: number; c: string }[] {
  const out: { x: number; y: number; w: number; c: string }[] = [];
  g.px.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      if (!c) { x++; continue; }
      let e = x + 1;
      while (e < row.length && row[e] === c) e++;
      out.push({ x, y, w: e - x, c });
      x = e;
    }
  });
  return out;
}
