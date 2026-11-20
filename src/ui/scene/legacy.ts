/**
 * Objetos de legado no CT: cada conquista (`game/achievements.ts`) coloca um objeto na cena.
 *
 * Canvas 240×153 (ver CtScene). Zonas:
 * - céu (y 0–16) e telhado do CT; prédio do CT (x 14–84, y 16–40);
 * - sala de troféus (x 124–176, y 20–40), que só aparece com o primeiro troféu;
 * - gramado (y 40–127) e a beira do campo embaixo (y 128–137);
 * - pátio de entrada (y 138–153).
 *
 * Tudo é pixel art em `fillRect`, nas cores do clube. `fr` só avança com o tempo correndo.
 */
import { drawText } from './sprites';

export type Layer = 'back' | 'ground' | 'front';
type Ctx = Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>;
type Colors = [string, string];
type Draw = (c: Ctx, fr: number, k: Colors) => void;

const r = (c: Ctx, color: string, x: number, y: number, w: number, h: number) => { c.fillStyle = color; c.fillRect(x, y, w, h); };
const text = (c: Ctx, s: string, x: number, y: number, color: string, outline: string) => drawText(c as CanvasRenderingContext2D, s, x, y, color, outline);

const GOLD = '#f2b632', GOLD_DK = '#b8861b', INK = '#2a1f2e', STONE = '#d9d2c3';

/** Troféus da sala de troféus: o anexo só é desenhado se algum deles foi conquistado. */
export const TROPHY_ROOM = ['atropelo', 'chuteira-de-ouro', 'campeao', 'bicampeao', 'lenda-viva'];

function trophy(c: Ctx, x: number, y: number) {
  r(c, GOLD, x, y, 5, 2); r(c, GOLD, x + 1, y + 2, 3, 2); r(c, GOLD_DK, x + 2, y + 4, 1, 1); r(c, GOLD, x + 1, y + 5, 3, 1);
  r(c, GOLD_DK, x - 1, y, 1, 2); r(c, GOLD_DK, x + 5, y, 1, 2);
}
function star(c: Ctx, color: string, x: number, y: number) {
  r(c, color, x + 1, y, 1, 3); r(c, color, x, y + 1, 3, 1);
}
function person(c: Ctx, shirt: string, x: number, y: number) {
  r(c, '#e0a878', x, y, 2, 2); r(c, shirt, x, y + 2, 2, 3); r(c, INK, x, y + 5, 1, 2); r(c, INK, x + 1, y + 5, 1, 2);
}

// ---------------------------------------------------------------- céu e prédio (atrás)

const BACK: Record<string, Draw> = {
  subiu: (c, fr, k) => { // balões
    const cols = [k[0], k[1], GOLD];
    cols.forEach((col, i) => {
      const bob = Math.round(Math.sin(fr / 30 + i * 2) * 1);
      const x = 177 + i * 5, y = 4 + (i % 2) * 3 + bob;
      r(c, col, x, y, 4, 4); r(c, col, x + 1, y - 1, 2, 1); r(c, col, x + 1, y + 4, 2, 1);
      r(c, '#8a8a96', x + 2, y + 5, 1, 6 - (i % 2) * 2);
    });
  },
  'narrador-de-plantao': (c, fr) => { // antena de TV com luz piscando
    r(c, '#4a4a58', 18, 6, 1, 10); r(c, '#d8d8e0', 14, 6, 5, 2); r(c, '#d8d8e0', 15, 8, 3, 1);
    r(c, fr % 60 < 30 ? '#ff4d4d' : '#7a2a2a', 18, 4, 1, 2);
  },
  'negocio-fechado': (c, fr) => { // cifrão em neon no telhado
    r(c, '#2a1f3a', 23, 7, 9, 9); r(c, '#4a4a58', 26, 16, 1, 0);
    const on = fr % 97 < 90 ? '#39ff88' : '#1f6b45';
    r(c, on, 26, 8, 3, 1); r(c, on, 25, 9, 1, 2); r(c, on, 26, 11, 3, 1); r(c, on, 29, 12, 1, 2); r(c, on, 25, 14, 3, 1); r(c, on, 27, 7, 1, 9);
  },
  'temporada-sem-vermelho': (c, fr) => { // pomba branca no telhado
    const hop = fr % 200 < 6 ? 1 : 0;
    r(c, '#ffffff', 34, 13 - hop, 3, 2); r(c, '#ffffff', 36, 12 - hop, 1, 1); r(c, '#f2b632', 37, 12 - hop, 1, 1); r(c, '#c9c9d4', 34, 14 - hop, 1, 1);
  },
  'relogio-suico': (c, fr) => { // relógio na fachada
    r(c, INK, 14, 25, 6, 6); r(c, '#ffffff', 15, 26, 4, 4); r(c, INK, 17, 27, 1, 2);
    const hand = Math.floor(fr / 60) % 4;
    if (hand === 0) r(c, '#c0392b', 17, 26, 1, 1); else if (hand === 1) r(c, '#c0392b', 18, 28, 1, 1); else if (hand === 2) r(c, '#c0392b', 17, 29, 1, 1); else r(c, '#c0392b', 15, 28, 1, 1);
  },
  magnata: (c, fr) => { // helicóptero no telhado
    r(c, '#5a5a66', 63, 15, 18, 1);
    r(c, '#c0392b', 66, 11, 9, 4); r(c, '#9fd3e8', 67, 12, 3, 2); r(c, '#c0392b', 75, 12, 5, 1); r(c, '#c0392b', 79, 11, 1, 2);
    r(c, INK, 67, 15, 1, 1); r(c, INK, 73, 15, 1, 1); r(c, INK, 70, 10, 1, 1);
    const w = fr % 6 < 3 ? 16 : 8;
    r(c, '#2a2a33', 70 - w / 2, 9, w, 1);
  },
  'nome-limpo': (c) => { // plantinha na janela
    r(c, '#3f9a3a', 21, 31, 1, 2); r(c, '#57c24f', 22, 30, 2, 2); r(c, '#3f9a3a', 24, 31, 1, 1); r(c, '#a0522d', 21, 33, 4, 2);
  },
  'licao-de-casa': (c) => { // quadro-negro com tática
    r(c, '#6e4a37', 58, 33, 10, 7); r(c, '#1f3b2d', 59, 34, 8, 5);
    r(c, '#e8e8e8', 60, 35, 1, 1); r(c, '#e8e8e8', 62, 37, 1, 1); r(c, '#e8e8e8', 64, 35, 1, 1); r(c, '#e8e8e8', 61, 36, 3, 1); r(c, '#e8e8e8', 65, 36, 1, 2);
  },
  'volta-por-cima': (c, fr) => { // fênix pintada no muro
    const glow = fr % 120 < 60 ? '#ff8c2a' : '#ff6a1a';
    r(c, glow, 79, 26, 2, 2); r(c, '#ffcc33', 80, 25, 1, 1); r(c, glow, 76, 28, 3, 1); r(c, glow, 81, 28, 3, 1);
    r(c, '#e4563c', 75, 29, 2, 1); r(c, '#e4563c', 83, 29, 1, 1); r(c, glow, 79, 28, 2, 3); r(c, '#e4563c', 78, 31, 1, 2); r(c, '#e4563c', 81, 31, 1, 2);
  },
  // céu animado
  elite: (c, fr, k) => { // dirigível com o escudo
    const x = Math.round(((fr * 0.12) % 300) - 30), y = 2;
    r(c, '#d9d9e0', x + 2, y, 16, 6); r(c, '#d9d9e0', x, y + 1, 20, 4); r(c, k[0], x + 3, y + 2, 14, 2);
    r(c, k[1], x + 9, y + 1, 3, 4); r(c, '#9a9aa6', x + 18, y, 2, 2); r(c, '#9a9aa6', x + 18, y + 4, 2, 2);
    r(c, '#5a5a66', x + 8, y + 6, 4, 2);
  },
  'invencivel-na-elite': (c, fr, k) => { // avião com faixa
    const x = Math.round(270 - ((fr * 0.3 + 150) % 330)), y = 17;
    r(c, '#e8e8f0', x, y, 7, 2); r(c, '#e8e8f0', x + 2, y - 2, 2, 2); r(c, '#e8e8f0', x + 5, y - 1, 2, 1); r(c, '#9fd3e8', x, y, 1, 1);
    r(c, '#b9b9c4', x + 7, y, 3, 1);
    r(c, k[0], x + 10, y - 2, 23, 7);
    text(c, 'LENDA', x + 12, y - 1, '#ffffff', k[0]);
  },
  centenario: (c, fr) => { // fogos de artifício
    const t = fr % 360;
    if (t >= 48) return;
    const spots = [[140, 9], [165, 6], [112, 5]] as const;
    const [cx, cy] = spots[Math.floor(fr / 360) % 3]!;
    const cols = ['#ff4d6d', '#ffd23f', '#6ee7ff', '#b28dff'];
    const rad = Math.min(7, t / 4);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      r(c, cols[i % 4]!, Math.round(cx + Math.cos(a) * rad), Math.round(cy + Math.sin(a) * rad * 0.7), 1, 1);
    }
    if (t < 8) r(c, '#ffffff', cx, cy + 8 - t, 1, 2);
  },
  colecionador: (c, fr) => { // disco voador (easter egg)
    const t = fr % 1500;
    if (t >= 260) return;
    const x = Math.round(98 + Math.sin(t / 20) * 10), y = 4;
    if (t > 90 && t < 170) { c.fillStyle = 'rgba(255, 244, 150, 0.25)'; for (let i = 0; i < 12; i++) c.fillRect(x + 4 - i / 2, y + 4 + i, 3 + i, 1); }
    r(c, '#8ef0ff', x + 3, y, 5, 2); r(c, '#a0a8b8', x, y + 2, 11, 2); r(c, '#6b7385', x + 2, y + 4, 7, 1);
    const blink = Math.floor(t / 8) % 3;
    for (let i = 0; i < 3; i++) r(c, i === blink ? '#ffd23f' : '#ff4d6d', x + 2 + i * 3, y + 3, 1, 1);
  },
};

/** Sala de troféus (anexo) + o que fica nela. */
function trophyRoom(c: Ctx, fr: number, k: Colors, has: (id: string) => boolean) {
  if (!TROPHY_ROOM.some(has)) return;
  r(c, '#5a3e38', 122, 20, 56, 2); r(c, '#8a6a54', 124, 22, 52, 18); r(c, k[0], 124, 24, 52, 1);
  r(c, '#3d2c2c', 127, 27, 26, 11); r(c, '#bfe3ef', 128, 28, 24, 9); r(c, '#9cc7d6', 128, 35, 24, 1);
  if (has('campeao')) trophy(c, 130, 29);
  if (has('bicampeao')) { trophy(c, 137, 29); star(c, GOLD, 131, 16); r(c, GOLD_DK, 132, 19, 1, 1); }
  if (has('chuteira-de-ouro')) { r(c, GOLD, 144, 32, 4, 2); r(c, GOLD, 147, 31, 2, 3); r(c, GOLD_DK, 144, 34, 5, 1); }
  if (has('lenda-viva')) { // mural com o seu retrato
    r(c, GOLD, 156, 25, 18, 13); r(c, k[0], 157, 26, 16, 11);
    r(c, '#3b2a1e', 162, 27, 6, 2); r(c, '#e0a878', 162, 29, 6, 4); r(c, INK, 163, 30, 1, 1); r(c, INK, 166, 30, 1, 1);
    r(c, '#2d3b6b', 160, 33, 10, 4); r(c, '#f4ead5', 164, 33, 2, 2);
  }
  if (has('atropelo')) { // placar "5x0" no telhado
    r(c, '#4a4a58', 152, 18, 1, 3); r(c, '#4a4a58', 169, 18, 1, 3);
    r(c, INK, 150, 10, 22, 9);
    const lit = fr % 140 < 120;
    text(c, '5X0', 155, 12, lit ? '#ffd23f' : '#b38f1e', INK);
  }
}

// ---------------------------------------------------------------- gramado e beira do campo

const GROUND: Record<string, Draw> = {
  invicto: (c, _fr, k) => { // escudo pintado no gramado (sob os atletas)
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(115, 78, 11, 12);
    r(c, k[0], 116, 79, 9, 6); r(c, k[1], 119, 79, 3, 6); r(c, k[0], 117, 85, 7, 2); r(c, k[0], 119, 87, 3, 1);
  },
  'primeiro-apito': (c, fr) => { // bandeirinhas de escanteio
    const wave = fr % 40 < 20 ? 0 : 1;
    for (const [x, y] of [[9, 41], [230, 41], [9, 120], [230, 120]] as const) {
      r(c, '#f2f7ee', x, y, 1, 7); r(c, '#ffd23f', x + 1, y + wave, 2, 2); r(c, '#e4563c', x + 1, y + 2 + wave, 2, 1);
    }
  },
  muralha: (c) => { // bonecos de barreira
    for (let i = 0; i < 4; i++) { const x = 62 + i * 4; r(c, '#f2d32a', x, 76, 3, 7); r(c, INK, x, 74, 3, 2); r(c, '#b59a12', x, 83, 3, 1); }
  },
  'na-raca': (c) => { // pneus de agilidade
    for (let i = 0; i < 4; i++) { const x = 168 + i * 6, y = 50 + (i % 2) * 3; r(c, '#2b2b2b', x, y, 5, 3); r(c, '#5a5a5a', x + 1, y + 1, 3, 1); }
  },
  'joia-lapidada': (c, _fr, k) => { // gol pequeno da base
    void k;
    r(c, '#ffffff', 196, 103, 12, 1); r(c, '#ffffff', 196, 103, 1, 8); r(c, '#ffffff', 207, 103, 1, 8);
  },
  'prata-da-casa': (c, _fr, k) => { // rede da base com o escudo
    c.fillStyle = 'rgba(255,255,255,0.45)';
    for (let x = 198; x < 207; x += 2) for (let y = 105; y < 111; y += 2) c.fillRect(x, y, 1, 1);
    r(c, k[0], 200, 106, 4, 3); r(c, k[1], 201, 107, 2, 1);
  },
  folego: (c) => { // escada de agilidade
    r(c, '#ffd23f', 96, 117, 32, 1); r(c, '#ffd23f', 96, 121, 32, 1);
    for (let x = 96; x <= 127; x += 4) r(c, '#ffd23f', x, 117, 1, 5);
  },
  escalada: (c) => { // pódio de 3 degraus
    r(c, '#c9c9d4', 205, 66, 6, 6); r(c, GOLD, 211, 62, 6, 10); r(c, '#cd7f32', 217, 68, 6, 4);
    r(c, INK, 213, 64, 1, 3); r(c, INK, 207, 68, 2, 1); r(c, INK, 219, 69, 2, 1);
    r(c, 'rgba(0,0,0,0.2)', 205, 72, 18, 1);
  },
  'mestre-das-trocas': (c) => { // banco de reservas coberto
    c.fillStyle = 'rgba(111,168,214,0.75)'; c.fillRect(10, 101, 32, 3);
    r(c, '#4a4a58', 11, 104, 1, 8); r(c, '#4a4a58', 40, 104, 1, 8);
  },
  'ouvido-colado': (c, fr) => { // rádio antigo no banco
    r(c, '#8b5a2b', 29, 106, 5, 4); r(c, '#f4ead5', 30, 107, 2, 2); r(c, INK, 33, 105, 1, 1);
    if (fr % 50 < 25) r(c, '#ffd23f', 34, 104, 1, 1);
  },
  prancheta: (c) => { // prancheta tática no banco
    r(c, '#a0522d', 17, 105, 4, 5); r(c, '#ffffff', 18, 106, 2, 3); r(c, '#c0c0c0', 18, 104, 2, 1);
  },
  'mao-na-massa': (c, fr) => { // placa de substituição
    r(c, '#4a4a58', 45, 104, 1, 7); r(c, INK, 42, 98, 8, 6);
    r(c, fr % 80 < 40 ? '#ff4d4d' : '#ffb3b3', 43, 99, 2, 2); r(c, '#39ff88', 47, 101, 2, 2);
  },
  'caneta-na-mao': (c) => { // bebedouro azul
    r(c, '#2f7fd6', 58, 112, 5, 5); r(c, '#9fd3e8', 59, 113, 2, 2); r(c, '#ffffff', 59, 111, 3, 1); r(c, '#4a4a58', 59, 117, 1, 3); r(c, '#4a4a58', 61, 117, 1, 3);
  },
  // beira do campo, embaixo (y 128–137)
  'primeira-vitoria': (c, _fr, k) => { // faixa "VAMOS!"
    r(c, k[0], 96, 129, 27, 7); r(c, k[1], 96, 129, 27, 1);
    text(c, 'VAMOS!', 98, 130, '#ffffff', k[0]);
  },
  'de-virada': (c, fr, k) => { // torcedor com bumbo
    person(c, k[0], 127, 129);
    r(c, '#d9d2c3', 130, 131, 4, 4); r(c, '#b23a48', 130, 131, 4, 1); r(c, '#b23a48', 130, 134, 4, 1);
    r(c, '#6e4a37', fr % 24 < 12 ? 129 : 131, 130, 1, 2);
  },
  'jogo-limpo': (c, fr) => { // bandeira "Fair Play"
    const wave = fr % 50 < 25 ? 0 : 1;
    r(c, '#d0d0d0', 138, 128, 1, 10); r(c, '#ffd23f', 139, 128 + wave, 8, 5); r(c, '#2f8f4e', 139, 130 + wave, 8, 1);
  },
  'laranja-da-baixada': (c) => { // caixote de laranjas (Nova Iguaçu)
    r(c, '#a0703c', 170, 132, 10, 5); r(c, '#7a5230', 170, 134, 10, 1);
    for (const [x, y] of [[171, 130], [174, 129], [177, 130], [172, 131], [176, 131]] as const) { r(c, '#f07a1a', x, y, 2, 2); r(c, '#ffb04d', x, y, 1, 1); }
    r(c, '#3f9a3a', 175, 128, 1, 1);
  },
  'classico-do-sofa': (c) => { // sofá
    r(c, '#8f2d3a', 151, 130, 14, 3); r(c, '#b23a48', 151, 133, 14, 3); r(c, '#8f2d3a', 150, 131, 1, 5); r(c, '#8f2d3a', 165, 131, 1, 5);
    r(c, INK, 152, 136, 1, 1); r(c, INK, 163, 136, 1, 1);
  },
};

// ---------------------------------------------------------------- pátio de entrada (frente)

const FRONT: Record<string, Draw> = {
  reforco: (c, _fr, k) => { // van do clube
    r(c, '#f4f4f4', 2, 143, 17, 7); r(c, '#f4f4f4', 2, 141, 12, 2); r(c, k[0], 2, 146, 17, 1);
    r(c, '#9fd3e8', 14, 143, 4, 2); r(c, '#9fd3e8', 4, 142, 3, 2); r(c, '#9fd3e8', 8, 142, 3, 2);
    r(c, INK, 4, 150, 3, 2); r(c, INK, 14, 150, 3, 2);
  },
  'venda-milionaria': (c) => { // carro esportivo
    r(c, '#d7263d', 23, 147, 14, 3); r(c, '#d7263d', 27, 145, 6, 2); r(c, '#9fd3e8', 28, 146, 4, 1);
    r(c, INK, 25, 150, 3, 2); r(c, INK, 33, 150, 3, 2); r(c, '#ffd23f', 36, 147, 1, 1);
  },
  'sangue-novo': (c) => { // bicicletário
    for (const x of [39, 45]) {
      r(c, INK, x, 149, 3, 1); r(c, INK, x, 151, 3, 1); r(c, INK, x + 3, 149, 1, 3); r(c, INK, x - 1, 149, 1, 3);
      r(c, '#2f7fd6', x + 1, 147, 3, 1); r(c, '#2f7fd6', x + 2, 148, 1, 2);
    }
  },
  'casa-cheia': (c, fr, k) => { // fila de torcedores
    for (let i = 0; i < 5; i++) person(c, i % 2 ? k[1] : k[0], 52 + i * 4, 144 + (Math.floor(fr / 30 + i) % 2));
  },
  'daqui-ninguem-sai': (c) => { // cadeado dourado no portão
    r(c, GOLD, 78, 147, 4, 3); r(c, GOLD_DK, 79, 145, 2, 2); r(c, INK, 79, 148, 1, 1);
  },
  salvador: (c) => { // ferradura no portão
    r(c, '#c0c0c8', 78, 141, 1, 3); r(c, '#c0c0c8', 81, 141, 1, 3); r(c, '#c0c0c8', 79, 143, 2, 1);
  },
  'missao-cumprida': (c, fr, k) => { // bandeira do clube no mastro
    r(c, '#d0d0d0', 89, 122, 1, 30); r(c, GOLD, 89, 121, 1, 1);
    const w = fr % 40 < 20 ? 0 : 1;
    r(c, k[0], 90, 122 + w, 9, 6); r(c, k[1], 90, 124 + w, 9, 2);
  },
  casamento: (c) => { // placa de homenagem
    r(c, '#4a4a58', 104, 148, 1, 4); r(c, '#6e4a37', 100, 143, 9, 6); r(c, GOLD, 101, 144, 7, 4); r(c, GOLD_DK, 102, 145, 5, 1); r(c, GOLD_DK, 102, 147, 4, 1);
  },
  'no-azul': (c) => { // cofre
    r(c, '#6b6f78', 111, 145, 8, 7); r(c, '#8c919b', 112, 146, 6, 5); r(c, INK, 114, 147, 2, 2); r(c, GOLD, 117, 148, 1, 1);
  },
  'cofre-cheio': (c, fr) => { // fonte com moedas
    r(c, '#8fa3b8', 121, 147, 14, 5); r(c, '#3fa7d6', 122, 148, 12, 3); r(c, '#8fa3b8', 127, 142, 2, 5);
    const d = fr % 30;
    r(c, '#bfe9ff', 126, 141 - (d < 15 ? 1 : 0), 1, 1); r(c, '#bfe9ff', 129, 141 - (d >= 15 ? 1 : 0), 1, 1);
    r(c, GOLD, 124, 149, 1, 1); r(c, GOLD, 131, 150, 1, 1); r(c, GOLD, 128, 149, 1, 1);
  },
  'temporada-perfeita': (c) => { // estátua dourada do técnico
    r(c, '#a9a39a', 224, 146, 10, 6); r(c, STONE, 225, 145, 8, 1);
    r(c, GOLD, 228, 134, 3, 3); r(c, GOLD, 227, 137, 5, 5); r(c, GOLD_DK, 227, 142, 2, 3); r(c, GOLD_DK, 230, 142, 2, 3); r(c, GOLD, 232, 135, 1, 3);
  },
  'ct-de-primeiro-mundo': (c, fr) => { // piscina de recuperação
    r(c, '#f4f4f4', 147, 145, 20, 7); r(c, '#3fa7d6', 148, 146, 18, 5);
    const o = Math.floor(fr / 20) % 4;
    r(c, '#8fd3f4', 149 + o * 4, 147, 3, 1); r(c, '#8fd3f4', 151 + ((o + 2) % 4) * 3, 149, 3, 1);
  },
  tetra: (c) => { // calçada da fama
    for (let i = 0; i < 4; i++) { r(c, '#e88aa8', 169 + i * 6, 148, 5, 5); star(c, GOLD, 170 + i * 6, 149); }
  },
  'uma-decada': (c, fr) => { // árvore grande
    r(c, '#6e4a37', 196, 136, 3, 16);
    const sway = fr % 120 < 60 ? 0 : 1;
    r(c, '#2f7d32', 189 + sway, 125, 17, 8); r(c, '#3f9a3a', 191 + sway, 121, 13, 6); r(c, '#57c24f', 193 + sway, 119, 8, 4); r(c, '#2f7d32', 192, 133, 11, 3);
  },
  'do-po-ao-topo': (c) => { // obelisco monumental
    r(c, '#a9a39a', 209, 148, 10, 4); r(c, STONE, 211, 126, 6, 22); r(c, STONE, 212, 122, 4, 4); r(c, GOLD, 213, 119, 2, 3);
    r(c, '#bfb6a5', 215, 126, 1, 22);
  },
};

export const LEGACY_LAYERS: Record<Layer, Record<string, Draw>> = { back: BACK, ground: GROUND, front: FRONT };

/** Ids com objeto desenhado (o teste garante que são exatamente as 50 conquistas). */
export const LEGACY_IDS = [...Object.keys(BACK), ...TROPHY_ROOM, ...Object.keys(GROUND), ...Object.keys(FRONT)];

/** Pátio de entrada: sempre desenhado (calçada, meio-fio e portão). */
export function drawPlaza(c: Ctx, k: Colors) {
  r(c, '#9c8b6e', 0, 137, 240, 1);
  r(c, '#cdbb9a', 0, 138, 240, 15);
  for (let x = 0; x < 240; x += 8) r(c, '#bba987', x, 138, 1, 15);
  r(c, '#bba987', 0, 145, 240, 1);
  // portão de entrada
  r(c, '#7a5a46', 72, 140, 3, 13); r(c, '#7a5a46', 85, 140, 3, 13); r(c, k[0], 72, 139, 16, 2);
  for (let x = 76; x <= 84; x += 2) r(c, '#4a4a58', x, 143, 1, 10);
}

export function drawLegacy(c: Ctx, layer: Layer, fr: number, k: Colors, has: (id: string) => boolean) {
  if (layer === 'back') trophyRoom(c, fr, k, has);
  for (const [id, draw] of Object.entries(LEGACY_LAYERS[layer])) if (has(id)) draw(c, fr, k);
}
