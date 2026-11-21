/**
 * Recolore sprites gerados no PixelLab para as cores de cada clube.
 *
 * O atleta do CT foi gerado com camisa verde-limão e calção azul — cores que não
 * aparecem em pele, cabelo nem contorno. Aqui cada pixel é classificado pelo matiz
 * e trocado mantendo a luz/sombra original: camisa → cor 1 do clube, calção → cor 2,
 * pele → um dos tons de pele do elenco. Contorno, cabelo, meião e chuteira ficam.
 */

export type Part = 'shirt' | 'shorts' | 'skin' | 'keep';

type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max / 255];
}

/** Brilho de referência (o tom "cheio") de cada parte no sprite original. */
const REF_V: Record<Exclude<Part, 'keep'>, number> = { shirt: 0.77, shorts: 0.63, skin: 0.96 };

export function classify(r: number, g: number, b: number): Part {
  const [h, s, v] = hsv(r, g, b);
  if (s >= 0.4 && h >= 45 && h <= 110 && v > 0.2) return 'shirt';
  if (s >= 0.4 && h >= 160 && h <= 260 && v > 0.15) return 'shorts';
  if (s >= 0.25 && s <= 0.75 && v >= 0.5 && (h <= 35 || h >= 340)) return 'skin';
  return 'keep';
}

/** Cor de destino com a mesma luz relativa do pixel original (sombra escurece, brilho clareia). */
export function shade(target: RGB, v: number, ref: number): RGB {
  const k = v / ref;
  if (k <= 1) return target.map((c) => Math.round(c * k)) as RGB;
  const t = Math.min(1, k - 1);
  return target.map((c) => Math.round(c + (255 - c) * t * 0.6)) as RGB;
}

export function recolorPixel(r: number, g: number, b: number, colors: [string, string], skin: string): RGB {
  const part = classify(r, g, b);
  if (part === 'keep') return [r, g, b];
  const v = Math.max(r, g, b) / 255;
  const target = hexToRgb(part === 'shirt' ? colors[0] : part === 'shorts' ? colors[1] : skin);
  return shade(target, v, REF_V[part]);
}

const cache = new Map<string, HTMLCanvasElement>();

/** Folha recolorida (em cache por cores + pele). */
export function tintedSheet(img: HTMLImageElement, colors: [string, string], skin: string): HTMLCanvasElement {
  const key = `${img.src}|${colors[0]}|${colors[1]}|${skin}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const c = cv.getContext('2d')!;
  c.drawImage(img, 0, 0);
  const data = c.getImageData(0, 0, cv.width, cv.height);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3]! < 128) continue;
    const [r, g, b] = recolorPixel(d[i]!, d[i + 1]!, d[i + 2]!, colors, skin);
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  c.putImageData(data, 0, 0);
  if (cache.size > 40) cache.clear();
  cache.set(key, cv);
  return cv;
}
