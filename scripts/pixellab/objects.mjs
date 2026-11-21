#!/usr/bin/env node
/**
 * Gera objetos (props) com fundo transparente a partir de uma lista JSON.
 *
 *   node scripts/pixellab/objects.mjs <lista.json> <pasta-saida> [nome ...]
 *
 * Cada item: { "n": "nome", "w": 48, "h": 32, "d": "descrição", "view": "low top-down" }
 * Usa create-image-pixflux (o endpoint mais barato; área mínima 32x32).
 * Pula arquivos que já existem na pasta — apague um PNG para gerá-lo de novo.
 * Com nomes no fim, gera só esses.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { call } from './api.mjs';

const [list, out, ...only] = process.argv.slice(2);
if (!list || !out) { console.error('uso: objects.mjs <lista.json> <pasta> [nome ...]'); process.exit(1); }
mkdirSync(out, { recursive: true });

const STYLE = 'retro 16-bit sports management game prop, three-quarter top-down view, crisp clean pixel art, dark outline, no text';
let spent = 0;
for (const it of JSON.parse(readFileSync(list, 'utf8'))) {
  if (only.length && !only.includes(it.n)) continue;
  const file = join(out, `${it.n}.png`);
  if (existsSync(file)) continue;
  const body = {
    description: `${it.d}, ${STYLE}`,
    negative_description: 'text, letters, background, ground tiles, shadow box',
    image_size: { width: it.w, height: it.h },
    no_background: true,
    outline: 'single color black outline',
    shading: 'medium shading',
    detail: 'medium detail',
    view: it.view ?? 'low top-down',
  };
  try {
    const r = await call('POST', '/create-image-pixflux', body);
    writeFileSync(file, Buffer.from(String(r.image.base64).replace(/^data:image\/\w+;base64,/, ''), 'base64'));
    if (r.usage?.type === 'usd') spent += r.usage.usd;
    console.log(it.n, JSON.stringify(r.usage));
  } catch (e) {
    console.log(it.n, 'ERRO', String(e).slice(0, 240));
  }
}
console.log('gasto USD nesta execução:', spent.toFixed(4));
