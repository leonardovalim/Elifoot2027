#!/usr/bin/env node
/**
 * Cliente mínimo da API do PixelLab para scripts de geração (uso offline).
 *
 *   node scripts/pixellab/api.mjs GET /balance
 *   node scripts/pixellab/api.mjs POST /create-character-with-8-directions body.json [--wait]
 *   node scripts/pixellab/api.mjs WAIT <background_job_id>
 *
 * Auth: PIXELLAB_TOKEN, ou o proxy do ambiente de nuvem (rode com NODE_USE_ENV_PROXY=1).
 */
import { readFileSync } from 'node:fs';

export const API = 'https://api.pixellab.ai/v2';
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.PIXELLAB_TOKEN ?? 'proxy-injected'}` };

export async function call(method, path, body) {
  const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`${res.status} ${method} ${path}: ${text.slice(0, 600)}`);
  return json;
}

export async function waitJob(id, everyMs = 5000) {
  for (;;) {
    await new Promise((r) => setTimeout(r, everyMs));
    const j = await call('GET', `/background-jobs/${id}`);
    if (j.status !== 'processing' && j.status !== 'pending' && j.status !== 'queued') return j;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [method, arg, file, flag] = process.argv.slice(2);
  if (method === 'WAIT') {
    console.log(JSON.stringify(await waitJob(arg), null, 1).slice(0, 4000));
  } else {
    const body = file && file !== '--wait' ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
    const out = await call(method, arg, body);
    console.log(JSON.stringify(out, null, 1).slice(0, 4000));
    if ((flag === '--wait' || file === '--wait') && out.background_job_id) {
      const j = await waitJob(out.background_job_id);
      console.log('JOB', j.status, JSON.stringify(j.usage ?? j.last_response?.usage ?? {}));
    }
  }
}
