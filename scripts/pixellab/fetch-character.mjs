#!/usr/bin/env node
/**
 * Baixa as rotações e animações de um personagem do PixelLab para uma pasta.
 *
 *   node scripts/pixellab/fetch-character.mjs <character_id> <pasta> [--wait]
 *
 * Arquivos: <pasta>/rot-<direção>.png e <pasta>/<animação>-<direção>-<quadro>.png
 * (o nome da animação vem de animation_name ou animation_type).
 * --wait: espera as animações em processamento terminarem.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { call } from './api.mjs';

const [id, dir, flag] = process.argv.slice(2);
if (!id || !dir) { console.error('uso: fetch-character.mjs <id> <pasta> [--wait]'); process.exit(1); }
mkdirSync(dir, { recursive: true });

const slug = (s) => String(s ?? 'anim').toLowerCase().replace(/^v3:/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

let c;
for (let i = 0; ; i++) {
  c = await call('GET', `/characters/${id}`);
  const busy = JSON.stringify(c.animations ?? []).match(/"(processing|pending|queued)"/);
  if (!busy || flag !== '--wait' || i > 90) break;
  await new Promise((r) => setTimeout(r, 8000));
}

const save = async (url, file) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  writeFileSync(join(dir, file), Buffer.from(await res.arrayBuffer()));
};

for (const [d, url] of Object.entries(c.rotation_urls ?? {})) if (url) await save(url, `rot-${d}.png`);
for (const a of c.animations ?? []) {
  const name = slug(a.display_name ?? a.animation_name ?? a.animation_type);
  for (const d of a.directions ?? []) {
    for (const [i, url] of (d.frames ?? []).entries()) if (url) await save(url, `${name}-${d.direction}-${i}.png`);
  }
}
console.log(JSON.stringify({ size: c.size, animations: (c.animations ?? []).map((a) => ({ type: a.animation_type, name: a.display_name, dirs: (a.directions ?? []).map((d) => `${d.direction}:${d.frame_count}`) })) }));
