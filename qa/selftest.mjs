// Autoteste: planta defeitos numa página e confere se as checagens do playtest acusam cada um.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const src = readFileSync('qa/playtest.mjs', 'utf8');
const fn = src.slice(src.indexOf('function pageChecks'), src.indexOf('/* Lista os controles'));
const pageChecks = new Function(`return (${fn.trim()})`)();
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 800 } });
await p.setContent(`<body style="margin:0">
 <div style="width:600px">largo demais</div>
 <p style="width:80px;overflow:hidden;white-space:nowrap">Texto muito comprido que não cabe</p>
 <span>Saldo: NaN</span>
 <button style="position:absolute;top:100px;left:10px;width:100px;height:40px">A</button>
 <button style="position:absolute;top:110px;left:30px;width:100px;height:40px">B</button>
 <button style="width:12px;height:12px">x</button>
</body>`);
const issues = await p.evaluate(pageChecks, true);
const found = new Set(issues.map((i) => i.kind));
const expected = ['rolagem-horizontal', 'texto-cortado', 'valor-quebrado', 'controles-sobrepostos', 'controle-coberto', 'alvo-pequeno'];
const missing = expected.filter((k) => !found.has(k));
console.log(missing.length ? `FALHOU — não detectou: ${missing.join(', ')}` : `OK — detectou os ${expected.length} tipos de defeito plantados`);
process.exitCode = missing.length ? 1 : 0;
await b.close();
