/**
 * CT com arte gerada no PixelLab (src/assets/ct): cenário 400×304, atlas de objetos
 * de conquista e as posições de cada um. Sem a arte carregada, o CtScene volta ao
 * cenário desenhado em código (240×153, ver legacy.ts).
 *
 * Zonas do cenário (coordenadas do cenário):
 * - céu à direita, acima do horizonte (y < 40) e telhado do prédio (x 5–195, y 18–34);
 * - fachada do prédio (x 5–195, y 34–118) e anexo de vidro = sala de troféus (x 207–282, y 50–90);
 * - campo inclinado (polígono WALK) e gramado à esquerda (x 0–60, y 115–250);
 * - banco de reservas (x 65–120, y 160–200) e pátio de entrada com portão (y 205–304).
 */
import { LEGACY_LAYERS, type Layer } from './legacy';
import { drawText, textWidth } from './sprites';

export const ART_W = 400;
export const ART_H = 304;

type Colors = [string, string];
type Rect = [number, number, number, number];
export type Atlas = Record<string, Rect>;

/** Área do gramado onde os atletas andam (dentro das linhas do campo). */
export const WALK: [number, number][] = [[72, 150], [212, 110], [388, 142], [388, 206], [312, 236], [72, 156]];

export function insideWalk(x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = WALK.length - 1; i < WALK.length; j = i++) {
    const [xi, yi] = WALK[i]!, [xj, yj] = WALK[j]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export const COACH_SPOT = { x: 136, feet: 206 };

interface Place {
  id: string;
  layer: Layer;
  /** Objeto do atlas. */
  s?: string;
  x: number;
  y: number;
  /** Escala (só reduções: 0.5, 0.6, 0.75...). */
  k?: number;
  /** Usa a cópia do atlas nas cores do clube (verde-limão → cor 1, azul → cor 2). */
  tint?: boolean;
  /** Objeto em pé no gramado: desenhado na ordem de profundidade junto com os atletas. */
  stand?: boolean;
  /** Deslocamento animado (ou null para esconder neste quadro). */
  move?: (fr: number) => { dx: number; dy: number } | null;
  /** Desenho antigo (legacy.ts) reaproveitado: escala e posição do canto do objeto antigo. */
  code?: { k: number; from: [number, number] };
  /** Detalhe em código por cima do sprite (texto, luz piscando...). */
  extra?: (c: CanvasRenderingContext2D, fr: number, k: Colors, x: number, y: number) => void;
}

const bob = (speed: number, amp: number, phase = 0) => (fr: number) => ({ dx: 0, dy: Math.round(Math.sin(fr / speed + phase) * amp) });

const r = (c: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number) => { c.fillStyle = color; c.fillRect(x, y, w, h); };

export const PLACES: Place[] = [
  // ---------------- céu (só o que atravessa devagar ou flutua; nada pisca)
  { id: 'subiu', layer: 'back', s: 'baloes', tint: true, x: 286, y: 4, move: bob(45, 1.5) },
  { id: 'elite', layer: 'back', s: 'dirigivel', tint: true, x: 0, y: 4, move: (fr) => ({ dx: Math.round(((fr * 0.12) % 470) - 60), dy: 0 }) },
  {
    id: 'invencivel-na-elite', layer: 'back', s: 'aviao', x: 0, y: 26,
    move: (fr) => ({ dx: Math.round(440 - ((fr * 0.3 + 150) % 560)), dy: 0 }),
    extra: (c, _fr, k, x, y) => { // faixa "LENDA" puxada pelo avião
      r(c, '#b9b9c4', x + 26, y + 6, 4, 1);
      r(c, k[0], x + 30, y + 1, 30, 11);
      drawText(c, 'LENDA', x + 33, y + 4, '#ffffff', k[0]);
    },
  },
  {
    id: 'colecionador', layer: 'back', s: 'disco', x: 0, y: 6,
    move: (fr) => { const t = fr % 1500; return t < 260 ? { dx: Math.round(230 + Math.sin(t / 20) * 18), dy: 0 } : null; },
    extra: (c, fr, _k, x, y) => {
      const t = fr % 1500;
      if (t > 90 && t < 170) { c.fillStyle = 'rgba(255, 244, 150, 0.22)'; for (let i = 0; i < 22; i++) c.fillRect(x + 12 - i / 2, y + 20 + i, 4 + i, 1); }
    },
  },
  { id: 'centenario', layer: 'back', x: 0, y: 4, code: { k: 2, from: [0, 0] } },
  // ---------------- telhado do prédio
  { id: 'narrador-de-plantao', layer: 'back', s: 'antena', x: 40, y: 2, extra: (c, fr, _k, x, y) => { if (fr % 120 < 60) r(c, '#ff4d4d', x + 2, y, 2, 2); } },
  { id: 'magnata', layer: 'back', s: 'helicoptero', x: 62, y: 9 },
  { id: 'temporada-sem-vermelho', layer: 'back', x: 130, y: 24, code: { k: 2, from: [34, 12] } },
  { id: 'negocio-fechado', layer: 'back', s: 'neon', x: 174, y: 4 },
  // ---------------- fachada
  { id: 'nome-limpo', layer: 'back', x: 26, y: 61, code: { k: 2, from: [21, 30] } },
  { id: 'relogio-suico', layer: 'back', x: 178, y: 38, code: { k: 2, from: [14, 25] } },
  { id: 'licao-de-casa', layer: 'back', s: 'quadro-negro', x: 168, y: 88 },
  // ---------------- anexo de vidro = sala de troféus (prateleira) e placar no telhado
  { id: 'atropelo', layer: 'back', s: 'placar', x: 222, y: 18, extra: (c, _fr, _k, x, y) => drawText(c, '5X0', x + Math.round((42 - textWidth('5X0')) / 2), y + 7, '#ffd23f', '#1a1420') },
  { id: 'lenda-viva', layer: 'back', s: 'retrato', k: 0.6, x: 211, y: 59, extra: (c, _fr, _k, x, y) => { c.strokeStyle = '#f2b632'; c.lineWidth = 1; c.strokeRect(x - 0.5, y - 0.5, 17, 24); } },
  { id: 'campeao', layer: 'back', s: 'taca', k: 0.75, x: 231, y: 64 },
  { id: 'bicampeao', layer: 'back', s: 'taca', k: 0.75, x: 251, y: 64 },
  { id: 'bicampeao', layer: 'back', x: 273, y: 40, code: { k: 2, from: [131, 16] } },
  { id: 'chuteira-de-ouro', layer: 'back', s: 'chuteira', k: 0.55, x: 266, y: 70 },
  // ---------------- fundo do campo, junto ao muro
  { id: 'volta-por-cima', layer: 'back', s: 'fenix', k: 0.75, x: 318, y: 54 },
  { id: 'jogo-limpo', layer: 'back', s: 'bandeira-fairplay', k: 0.75, x: 292, y: 64 },
  { id: 'missao-cumprida', layer: 'back', s: 'mastro', tint: true, x: 368, y: 38 },
  { id: 'escalada', layer: 'ground', s: 'podio', x: 336, y: 92 },
  // ---------------- gramado (o que é chato fica sob os atletas)
  { id: 'invicto', layer: 'ground', x: 238, y: 140, code: { k: 2, from: [115, 78] } },
  { id: 'folego', layer: 'ground', s: 'escada', k: 0.75, x: 178, y: 170 },
  { id: 'na-raca', layer: 'ground', s: 'pneus', k: 0.75, x: 290, y: 168 },
  { id: 'prata-da-casa', layer: 'ground', x: 348, y: 204, code: { k: 1, from: [198, 105] } },
  {
    id: 'mestre-das-trocas', layer: 'ground', x: 66, y: 162,
    extra: (c, _fr, k, x, y) => { for (let i = 0; i < 52; i++) { r(c, k[0], x + i, y + Math.round(i * 0.2), 1, 2); if (i % 6 < 3) r(c, k[1], x + i, y + 2 + Math.round(i * 0.2), 1, 1); } },
  },
  { id: 'ouvido-colado', layer: 'ground', s: 'radio', k: 0.5, x: 100, y: 180 },
  { id: 'prancheta', layer: 'ground', x: 78, y: 182, code: { k: 2, from: [17, 104] } },
  // ---------------- em pé no gramado: entram na ordem de profundidade com os atletas
  { id: 'primeiro-apito', layer: 'ground', stand: true, s: 'bandeirinha', k: 0.75, x: 40, y: 129 },
  { id: 'primeiro-apito', layer: 'ground', stand: true, s: 'bandeirinha', k: 0.75, x: 210, y: 79 },
  { id: 'primeiro-apito', layer: 'ground', stand: true, s: 'bandeirinha', k: 0.75, x: 312, y: 224 },
  { id: 'muralha', layer: 'ground', stand: true, s: 'bonecos', k: 0.75, x: 122, y: 150 },
  { id: 'joia-lapidada', layer: 'ground', stand: true, s: 'golzinho', k: 0.75, x: 340, y: 196 },
  { id: 'mao-na-massa', layer: 'ground', stand: true, s: 'placa-sub', k: 0.75, x: 124, y: 172 },
  { id: 'caneta-na-mao', layer: 'ground', stand: true, s: 'bebedouro', k: 0.75, x: 52, y: 178 },
  // ---------------- gramado à esquerda
  { id: 'uma-decada', layer: 'front', s: 'arvore', x: 2, y: 144 },
  { id: 'do-po-ao-topo', layer: 'front', s: 'obelisco', x: 32, y: 150 },
  // ---------------- beira do campo, embaixo
  { id: 'classico-do-sofa', layer: 'front', s: 'sofa', k: 0.75, x: 176, y: 216 },
  {
    id: 'primeira-vitoria', layer: 'front', s: 'faixa', tint: true, k: 0.75, x: 220, y: 213,
    extra: (c, _fr, k, x, y) => drawText(c, 'VAMOS!', x + Math.round((43 - textWidth('VAMOS!')) / 2), y + 7, '#ffffff', k[0]),
  },
  { id: 'de-virada', layer: 'front', s: 'torcedor-bumbo', tint: true, x: 268, y: 213 },
  { id: 'laranja-da-baixada', layer: 'front', s: 'laranjas', k: 0.6, x: 292, y: 232 },
  // ---------------- pátio: portão, monumentos, fonte e estacionamento
  { id: 'casamento', layer: 'front', s: 'placa-homenagem', k: 0.6, x: 128, y: 210 },
  { id: 'no-azul', layer: 'front', s: 'cofre', k: 0.5, x: 144, y: 214 },
  { id: 'daqui-ninguem-sai', layer: 'front', x: 96, y: 264, code: { k: 2, from: [78, 145] } },
  { id: 'salvador', layer: 'front', x: 96, y: 250, code: { k: 2, from: [78, 141] } },
  { id: 'tetra', layer: 'front', s: 'calcada-fama', k: 0.75, x: 170, y: 244 },
  { id: 'casa-cheia', layer: 'front', s: 'torcida-fila', tint: true, k: 0.75, x: 232, y: 244 },
  { id: 'temporada-perfeita', layer: 'front', s: 'estatua', x: 304, y: 246 },
  { id: 'cofre-cheio', layer: 'front', s: 'fonte', k: 0.75, x: 196, y: 260 },
  { id: 'ct-de-primeiro-mundo', layer: 'front', s: 'piscina', k: 0.75, x: 248, y: 276 },
  { id: 'reforco', layer: 'front', s: 'van', tint: true, k: 0.75, x: 158, y: 286 },
  { id: 'venda-milionaria', layer: 'front', s: 'carro', k: 0.75, x: 296, y: 290 },
  { id: 'sangue-novo', layer: 'front', s: 'bicicletas', k: 0.5, x: 342, y: 286 },
];

/** Ids com lugar no cenário novo (o teste garante as 50 conquistas). */
export const ART_LEGACY_IDS = [...new Set(PLACES.map((p) => p.id))];

function legacyDraw(id: string) {
  for (const layer of Object.values(LEGACY_LAYERS)) if (layer[id]) return layer[id];
  return null;
}

function drawPlace(c: CanvasRenderingContext2D, p: Place, fr: number, k: Colors, atlas: CanvasImageSource, tinted: CanvasImageSource, rects: Atlas) {
  const m = p.move ? p.move(fr) : { dx: 0, dy: 0 };
  if (!m) return;
  const x = p.x + m.dx, y = p.y + m.dy;
  if (p.code) {
    const draw = legacyDraw(p.id);
    if (draw) {
      c.save();
      c.translate(x - p.code.from[0] * p.code.k, y - p.code.from[1] * p.code.k);
      c.scale(p.code.k, p.code.k);
      draw(c, fr, k);
      c.restore();
    } else if (p.id === 'bicampeao') { // estrela dourada sobre o anexo
      r(c, '#f2b632', x + 2, y, 2, 6); r(c, '#f2b632', x, y + 2, 6, 2);
    }
  }
  if (p.s) {
    const rect = rects[p.s];
    if (rect) {
      const s = p.k ?? 1;
      c.drawImage(p.tint ? tinted : atlas, rect[0], rect[1], rect[2], rect[3], Math.round(x), Math.round(y), Math.round(rect[2] * s), Math.round(rect[3] * s));
    }
  }
  p.extra?.(c, fr, k, Math.round(x), Math.round(y));
}

/** Desenha os objetos de conquista de uma camada no cenário novo (menos os que ficam em pé). */
export function drawLegacyArt(
  c: CanvasRenderingContext2D, layer: Layer, fr: number, k: Colors, has: (id: string) => boolean,
  atlas: CanvasImageSource, tinted: CanvasImageSource, rects: Atlas,
) {
  for (const p of PLACES) if (p.layer === layer && !p.stand && has(p.id)) drawPlace(c, p, fr, k, atlas, tinted, rects);
}

/** Objetos em pé no gramado, com a linha da base, para ordenar junto com os atletas. */
export function standingLegacy(
  c: CanvasRenderingContext2D, fr: number, k: Colors, has: (id: string) => boolean,
  atlas: CanvasImageSource, tinted: CanvasImageSource, rects: Atlas,
): { y: number; draw: () => void }[] {
  return PLACES.filter((p) => p.stand && has(p.id)).map((p) => {
    const rect = p.s ? rects[p.s] : undefined;
    const base = p.y + (rect ? Math.round(rect[3] * (p.k ?? 1)) : 0);
    return { y: base, draw: () => drawPlace(c, p, fr, k, atlas, tinted, rects) };
  });
}

/** Placa do CT nas cores do clube + estrelas do nível da estrutura (sobre o telhado). */
export function drawCtSign(c: CanvasRenderingContext2D, k: Colors, level: number) {
  // letreiro na fachada, acima da entrada: "CT" nas cores do clube e as estrelas da estrutura
  const x = 104, y = 34, w = 52;
  r(c, '#1a1420', x - 1, y - 1, w + 2, 14);
  r(c, k[0], x, y, w, 12);
  r(c, k[1], x, y + 10, w, 2);
  drawText(c, 'CT', x + 4, y + 3, '#ffffff', '#1a1420');
  for (let i = 0; i < 5; i++) {
    const sx = x + 18 + i * 6;
    r(c, '#1a1420', sx, y + 3, 5, 5);
    r(c, i < level ? '#ffcc33' : '#6b5a4e', sx + 1, y + 4, 3, 3);
  }
}

/** Cones de treino no campo (mais cones com estrutura melhor). */
export function drawCones(c: CanvasRenderingContext2D, count: number) {
  for (let i = 0; i < count; i++) {
    const x = 236 + i * 11, y = 196 - i * 3;
    r(c, '#1a1420', x - 1, y + 3, 6, 1);
    r(c, '#f07a2a', x, y, 4, 3); r(c, '#ffd0a0', x + 1, y + 1, 2, 1); r(c, '#f07a2a', x + 1, y - 1, 2, 1);
  }
}
