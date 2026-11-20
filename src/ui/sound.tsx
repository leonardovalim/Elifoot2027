import { useSyncExternalStore } from 'react';

/**
 * Sons do jogo, sintetizados na hora com Web Audio (estilo chiptune, sem arquivos).
 * Liga/desliga fica salvo no navegador; o padrão é ligado.
 */
export type SoundKind = 'goalFor' | 'goalAgainst' | 'whistle' | 'halfTime' | 'fullTime' | 'alert' | 'card';

const KEY = 'mde.sound';
let enabled = read();
const listeners = new Set<() => void>();

function read(): boolean {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}

export function isSoundOn() { return enabled; }

export function setSoundOn(on: boolean) {
  enabled = on;
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* sem storage: vale só nesta sessão */ }
  listeners.forEach((l) => l());
  if (on) play('alert');
}

export function useSoundOn() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => enabled, () => enabled);
}

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    try { ctx = new Ctor(); } catch { return null; }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

interface Note { f: number; t: number; d: number; type?: OscillatorType; vol?: number; vibrato?: number }

function tones(notes: Note[]) {
  const a = audio();
  if (!a) return;
  const now = a.currentTime + 0.02;
  const master = a.createGain();
  master.gain.value = 0.18;
  master.connect(a.destination);
  for (const n of notes) {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = n.type ?? 'square';
    o.frequency.setValueAtTime(n.f, now + n.t);
    if (n.vibrato) {
      const lfo = a.createOscillator();
      const depth = a.createGain();
      lfo.frequency.value = n.vibrato;
      depth.gain.value = n.f * 0.03;
      lfo.connect(depth).connect(o.frequency);
      lfo.start(now + n.t);
      lfo.stop(now + n.t + n.d + 0.05);
    }
    const v = n.vol ?? 1;
    g.gain.setValueAtTime(0.0001, now + n.t);
    g.gain.exponentialRampToValueAtTime(v, now + n.t + 0.01);
    g.gain.setValueAtTime(v, now + n.t + Math.max(0.01, n.d - 0.04));
    g.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d);
    o.connect(g).connect(master);
    o.start(now + n.t);
    o.stop(now + n.t + n.d + 0.02);
  }
}

const whistle = (t: number, d: number): Note => ({ f: 2300, t, d, type: 'sine', vol: 0.7, vibrato: 28 });

const SOUNDS: Record<SoundKind, Note[]> = {
  // arpejo subindo: gol nosso
  goalFor: [523, 659, 784, 1047, 784, 1047].map((f, i) => ({ f, t: i * 0.09, d: i === 5 ? 0.35 : 0.09 })),
  // descendo, mais grave: gol contra nós
  goalAgainst: [392, 330, 262].map((f, i) => ({ f, t: i * 0.16, d: 0.16, type: 'triangle' as OscillatorType, vol: 1 })),
  whistle: [whistle(0, 0.32)],
  halfTime: [whistle(0, 0.22), whistle(0.32, 0.4)],
  fullTime: [whistle(0, 0.22), whistle(0.3, 0.22), whistle(0.6, 0.6)],
  // "plim-plom": tem decisão esperando
  alert: [{ f: 988, t: 0, d: 0.12, vol: 0.6 }, { f: 1319, t: 0.13, d: 0.24, vol: 0.6 }],
  card: [{ f: 180, t: 0, d: 0.22, type: 'sawtooth', vol: 0.5 }],
};

export function play(kind: SoundKind) {
  if (!enabled) return;
  try { tones(SOUNDS[kind]); } catch { /* áudio indisponível: segue sem som */ }
}

export function SoundToggle({ className = '' }: { className?: string }) {
  const on = useSoundOn();
  return (
    <button
      className={`btn sm sound-toggle ${className}`}
      aria-pressed={on}
      aria-label={on ? 'Som ligado' : 'Som desligado'}
      title={on ? 'Som ligado (clique para desligar)' : 'Som desligado (clique para ligar)'}
      onClick={() => setSoundOn(!on)}
    ><SpeakerIcon on={on} /></button>
  );
}

/** Alto-falante em pixel art (o emoji não aparece em todo sistema). */
function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges" fill="currentColor">
      <rect x="1" y="6" width="3" height="4" />
      <rect x="4" y="5" width="1" height="6" />
      <rect x="5" y="4" width="1" height="8" />
      <rect x="6" y="3" width="1" height="10" />
      <rect x="7" y="2" width="1" height="12" />
      {on ? (
        <>
          <rect x="9" y="6" width="1" height="4" />
          <rect x="11" y="4" width="1" height="2" /><rect x="12" y="6" width="1" height="4" /><rect x="11" y="10" width="1" height="2" />
          <rect x="13" y="2" width="1" height="2" /><rect x="14" y="4" width="1" height="8" /><rect x="13" y="12" width="1" height="2" />
        </>
      ) : (
        <>
          <rect x="10" y="5" width="1" height="1" /><rect x="11" y="6" width="1" height="1" /><rect x="12" y="7" width="2" height="2" /><rect x="11" y="9" width="1" height="1" /><rect x="10" y="10" width="1" height="1" />
          <rect x="14" y="5" width="1" height="1" /><rect x="14" y="10" width="1" height="1" /><rect x="15" y="4" width="1" height="1" /><rect x="15" y="11" width="1" height="1" />
        </>
      )}
    </svg>
  );
}
