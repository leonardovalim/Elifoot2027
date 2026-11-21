import atlasUrl from '../../assets/ct/objetos.png';
import atlasRects from '../../assets/ct/objetos.json';
import { ART_H, ART_W, drawLegacyArt, type Atlas } from './ctArt';
import { tintedSheet } from './tint';
import type { Layer } from './legacy';

/**
 * Miniatura do objeto que uma conquista coloca no CT: desenha só esse objeto
 * na cena (como o CT desenha), recorta a área pintada e amplia sem
 * suavizar, para o banner e a coleção mostrarem o que o jogador ganhou.
 */
let atlasLoad: Promise<HTMLImageElement> | null = null;
function atlas(): Promise<HTMLImageElement> {
  if (!atlasLoad) {
    atlasLoad = new Promise((ok, fail) => {
      const im = new Image();
      im.onload = () => ok(im);
      im.onerror = fail;
      im.src = atlasUrl;
    });
    atlasLoad.catch(() => { atlasLoad = null; });
  }
  return atlasLoad;
}

const LAYERS: Layer[] = ['back', 'ground', 'front'];
// objetos que se movem (dirigível, avião...) podem estar fora da cena num quadro: tenta outros
const FRAMES = [0, 12, 24, 36, 600, 1200];

/**
 * Maior grupo de pixels pintados, juntando o que está a até `gap` px de distância.
 * Objetos espalhados pela cena (3 bandeirinhas, taça + estrela) viram um só: o maior.
 */
export function mainCluster(data: Uint8ClampedArray, w: number, h: number, gap = 3): { x: number; y: number; w: number; h: number; count: number } | null {
  const seen = new Uint8Array(w * h);
  const painted = (i: number) => data[i * 4 + 3]! > 0;
  let best: { x: number; y: number; w: number; h: number; count: number } | null = null;
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || !painted(start)) continue;
    seen[start] = 1;
    stack.push(start);
    let x0 = w, y0 = h, x1 = -1, y1 = -1, count = 0;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w, y = (i / w) | 0;
      count++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let dy = -gap; dy <= gap; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -gap; dx <= gap; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const j = ny * w + nx;
          if (!seen[j] && painted(j)) { seen[j] = 1; stack.push(j); }
        }
      }
    }
    if (!best || count > best.count) best = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, count };
  }
  return best;
}

/** Desenha a miniatura de `id` em `target` (centralizada, escala inteira). Devolve se conseguiu. */
export async function drawLegacyThumb(target: HTMLCanvasElement, id: string, colors: [string, string]): Promise<boolean> {
  let img: HTMLImageElement;
  try { img = await atlas(); } catch { return false; }
  const scene = document.createElement('canvas');
  scene.width = ART_W;
  scene.height = ART_H;
  const c = scene.getContext('2d', { willReadFrequently: true });
  const out = target.getContext('2d');
  if (!c || !out) return false;
  c.imageSmoothingEnabled = false;
  const tinted = tintedSheet(img, colors, '#e0a878');
  const rects = atlasRects as unknown as Atlas;

  // objetos animados (fogos, dirigível): fica o quadro com mais desenho do objeto principal
  let pick: { fr: number; count: number } | null = null;
  for (const fr of FRAMES) {
    c.clearRect(0, 0, ART_W, ART_H);
    for (const layer of LAYERS) drawLegacyArt(c, layer, fr, colors, (x) => x === id, img, tinted, rects);
    const cl = mainCluster(c.getImageData(0, 0, ART_W, ART_H).data, ART_W, ART_H);
    if (cl && (!pick || cl.count > pick.count)) pick = { fr, count: cl.count };
  }
  if (pick) {
    c.clearRect(0, 0, ART_W, ART_H);
    for (const layer of LAYERS) drawLegacyArt(c, layer, pick.fr, colors, (x) => x === id, img, tinted, rects);
    const box = mainCluster(c.getImageData(0, 0, ART_W, ART_H).data, ART_W, ART_H)!;
    const pad = 2;
    const scale = Math.max(1, Math.floor(Math.min((target.width - pad * 2) / box.w, (target.height - pad * 2) / box.h)));
    const w = box.w * scale, h = box.h * scale;
    out.clearRect(0, 0, target.width, target.height);
    out.imageSmoothingEnabled = false;
    // objeto maior que a miniatura (escala 1 não cabe): reduz, mesmo perdendo nitidez
    const fit = Math.min(1, (target.width - pad * 2) / w, (target.height - pad * 2) / h);
    const dw = Math.round(w * fit), dh = Math.round(h * fit);
    out.drawImage(scene, box.x, box.y, box.w, box.h, Math.round((target.width - dw) / 2), Math.round((target.height - dh) / 2), dw, dh);
    return true;
  }
  return false;
}
