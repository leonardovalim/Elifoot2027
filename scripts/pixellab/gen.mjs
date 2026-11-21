#!/usr/bin/env node
/**
 * Gera arte com a API do PixelLab. Uso offline: os PNGs vão para o repo e a chave nunca vai para o jogo.
 *
 * Uso:
 *   node scripts/pixellab/gen.mjs <saida-dir> <nome> <largura> <altura> "<descrição>" [--transparent] [--style img.png]
 *
 * Auth: PIXELLAB_TOKEN no ambiente. No ambiente de nuvem, o proxy injeta a credencial salva; para o fetch
 * do Node passar pelo proxy, rode com NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt.
 *
 * Custo observado (trial): 10 gerações por imagem no generate-image-v2 a 240x136.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const API = 'https://api.pixellab.ai/v2';
const [outDir, name, w, h, description, ...flags] = process.argv.slice(2);
if (!description) {
  console.error('uso: gen.mjs <dir> <nome> <w> <h> "<descrição>" [--transparent] [--style img.png]');
  process.exit(1);
}
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.PIXELLAB_TOKEN ?? 'proxy-injected'}` };

const body = { description, image_size: { width: +w, height: +h }, no_background: flags.includes('--transparent') };
const si = flags.indexOf('--style');
if (si >= 0) {
  const png = readFileSync(flags[si + 1]);
  body.style_image = { image: { type: 'base64', base64: png.toString('base64') }, width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

const post = await fetch(`${API}/generate-image-v2`, { method: 'POST', headers, body: JSON.stringify(body) });
const job = await post.json();
if (!post.ok) { console.error(post.status, JSON.stringify(job)); process.exit(1); }
const id = job.background_job_id;
console.error('job', id);

let res;
for (;;) {
  await new Promise((r) => setTimeout(r, 6000));
  res = await (await fetch(`${API}/background-jobs/${id}`, { headers })).json();
  if (res.status !== 'processing') break;
}
if (res.status !== 'completed') { console.error('falhou', JSON.stringify(res).slice(0, 500)); process.exit(1); }

const lr = res.last_response ?? {};
const imgs = lr.images ?? (lr.image ? [lr.image] : []);
mkdirSync(outDir, { recursive: true });
imgs.forEach((im, i) => {
  const b64 = String(im.base64 ?? '').replace(/^data:image\/\w+;base64,/, '');
  const file = join(outDir, imgs.length > 1 ? `${name}-${i + 1}.png` : `${name}.png`);
  writeFileSync(file, Buffer.from(b64, 'base64'));
  console.log(file);
});
console.error('usage', JSON.stringify(lr.usage ?? res.usage ?? {}));
