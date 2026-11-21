import { useEffect, useSyncExternalStore } from 'react';
import { CUE_PRIORITY, type CrowdCue, type CrowdLevels } from './crowd';

/**
 * Sons do jogo. Os efeitos com arquivo (public/audio, gerados no ElevenLabs em
 * estilo 16-bit) tocam como amostra; os demais, ou se o arquivo não carregar,
 * são sintetizados na hora com Web Audio (chiptune, sem arquivos).
 * Liga/desliga fica salvo no navegador; o padrão é ligado.
 */
export type SoundKind = 'goalFor' | 'goalAgainst' | 'whistle' | 'halfTime' | 'fullTime' | 'alert' | 'card' | 'injury' | 'click';

/** Arquivos em public/audio. */
export const SAMPLES = ['intro', 'goal', 'whistle', 'click'] as const;
export type SampleId = (typeof SAMPLES)[number];

/** Um toque de amostra: começa em `t` (s) e dura `d` (s; sem `d`, até o fim). */
interface Hit { s: SampleId; t: number; d?: number; vol?: number }

/** Efeitos que já têm arquivo. Os outros só existem na síntese. */
export const SAMPLED: Partial<Record<SoundKind, Hit[]>> = {
  goalFor: [{ s: 'goal', t: 0 }],
  whistle: [{ s: 'whistle', t: 0, d: 0.5 }],
  halfTime: [{ s: 'whistle', t: 0, d: 0.22 }, { s: 'whistle', t: 0.32, d: 0.45 }],
  fullTime: [{ s: 'whistle', t: 0, d: 0.22 }, { s: 'whistle', t: 0.3, d: 0.22 }, { s: 'whistle', t: 0.6, d: 0.75 }],
  click: [{ s: 'click', t: 0, vol: 0.6 }],
};

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
  if (on) { play('alert'); if (wanted) playMusic(wanted); }
  else { stopIntro(); fadeOutMusic(0.3); stopCrowd(0.3); }
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
    void loadSamples();
  }
  if (ctx.state === 'suspended') {
    void ctx.resume();
    resumeOnGesture(ctx);
  }
  return ctx;
}

/** Sem gesto ainda, o navegador mantém o áudio suspenso: retoma no primeiro toque ou tecla. */
let waitingGesture = false;
function resumeOnGesture(a: AudioContext) {
  if (waitingGesture || typeof window === 'undefined') return;
  waitingGesture = true;
  const go = () => {
    void a.resume();
    waitingGesture = false;
    window.removeEventListener('pointerdown', go, true);
    window.removeEventListener('keydown', go, true);
  };
  window.addEventListener('pointerdown', go, true);
  window.addEventListener('keydown', go, true);
}

// ---------- amostras ----------

const buffers = new Map<SampleId, AudioBuffer>();
let loading: Promise<void> | null = null;

function sampleUrl(id: string) {
  return `${import.meta.env.BASE_URL}audio/${id}.mp3`;
}

/** Baixa e decodifica todos os arquivos (uma vez). Falha de um não impede os outros. */
function loadSamples(): Promise<void> {
  if (loading) return loading;
  const a = ctx;
  if (!a || typeof fetch === 'undefined') return Promise.resolve();
  loading = Promise.all(SAMPLES.map(async (id) => {
    try {
      const res = await fetch(sampleUrl(id));
      if (!res.ok) return;
      buffers.set(id, await a.decodeAudioData(await res.arrayBuffer()));
    } catch { /* sem o arquivo: fica a síntese */ }
  })).then(() => undefined);
  return loading;
}

const SAMPLE_GAIN = 0.55;

interface Voice { src: AudioBufferSourceNode; gain: GainNode }

/**
 * Saída única de todo o áudio do jogo, com um compressor suave: quando vários
 * sons se somam (jingle de gol + explosão da torcida + cantoria), o volume
 * total não dispara.
 */
let bus: AudioNode | null = null;
function out(a: AudioContext): AudioNode {
  if (!bus) {
    const comp = a.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.25;
    comp.connect(a.destination);
    bus = comp;
  }
  return bus;
}

/** `attack` (s): entrada em rampa, para o som não pular na cara. */
function playBuffer(a: AudioContext, buf: AudioBuffer, at: number, d: number | undefined, vol: number, attack = 0): Voice {
  const src = a.createBufferSource();
  src.buffer = buf;
  const g = a.createGain();
  const v = vol * SAMPLE_GAIN;
  if (attack > 0) {
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(v, at + attack);
  } else g.gain.setValueAtTime(v, at);
  if (d !== undefined) {
    // corte curto com rampa, para não estalar
    g.gain.setValueAtTime(v, at + Math.max(0, d - 0.04));
    g.gain.linearRampToValueAtTime(0.0001, at + d);
  }
  src.connect(g).connect(out(a));
  src.start(at, 0, d);
  return { src, gain: g };
}

function hits(list: Hit[]): boolean {
  const a = audio();
  if (!a || !list.every((h) => buffers.has(h.s))) return false;
  const now = a.currentTime + 0.01;
  for (const h of list) playBuffer(a, buffers.get(h.s)!, now + h.t, h.d, h.vol ?? 1);
  return true;
}

// ---------- abertura ----------

let intro: Voice | null = null;

/**
 * Destrava o áudio (precisa vir de um gesto do jogador) e espera a trilha da
 * abertura carregar, no máximo `timeoutMs`. Devolve se ela está pronta.
 */
export async function prepareIntro(timeoutMs = 1500): Promise<boolean> {
  if (!enabled || !audio()) return false;
  await Promise.race([loadSamples(), new Promise((r) => setTimeout(r, timeoutMs))]);
  return buffers.has('intro');
}

/** Toca a trilha da abertura (sincronizada: o pico cai no gol, em 4,0s). */
export function playIntro() {
  const a = audio();
  const buf = buffers.get('intro');
  if (!enabled || !a || !buf) return;
  stopIntro(0.05);
  const at = a.currentTime + 0.01;
  const mine = playBuffer(a, buf, at, undefined, 1.4);
  intro = mine;
  introEnd = at + buf.duration;
  mine.src.onended = () => { if (intro === mine) intro = null; };
}

let introEnd = 0;

/** Para a abertura com um fade curto (pulou a cena ou desligou o som). */
export function stopIntro(fade = 0.35) {
  const a = ctx;
  const cur = intro;
  intro = null;
  if (!a || !cur) return;
  fadeVoice(a, cur, fade);
  // a música que esperava a abertura acabar entra já
  if (music && music.at > a.currentTime + 0.3) {
    const { id } = music;
    const buf = musicBuffers.get(id);
    fadeVoice(a, music.voice, 0.01);
    music = null;
    if (buf) startMusic(a, id, buf);
  }
}

function fadeVoice(a: AudioContext, v: Voice, fade: number) {
  const t = a.currentTime;
  v.gain.gain.cancelScheduledValues(t);
  v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), t);
  v.gain.gain.linearRampToValueAtTime(0.0001, t + fade);
  try { v.src.stop(t + fade + 0.02); } catch { /* já parou */ }
}

// ---------- música ----------

/** Trilhas em loop (public/audio), carregadas só quando a tela pede. */
export const MUSIC = ['menu'] as const;
export type MusicId = (typeof MUSIC)[number];

const MUSIC_GAIN = 0.3;
const musicBuffers = new Map<MusicId, AudioBuffer>();
const musicLoading = new Map<MusicId, Promise<AudioBuffer | null>>();
/** A trilha que a tela atual quer (volta a tocar se o som for religado). */
let wanted: MusicId | null = null;
let music: { id: MusicId; voice: Voice; at: number } | null = null;

function loadMusic(a: AudioContext, id: MusicId): Promise<AudioBuffer | null> {
  let p = musicLoading.get(id);
  if (!p) {
    p = fetch(sampleUrl(id))
      .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(String(res.status)))))
      .then((data) => a.decodeAudioData(data))
      .then((buf) => { musicBuffers.set(id, buf); return buf; })
      .catch(() => { musicLoading.delete(id); return null; });
    musicLoading.set(id, p);
  }
  return p;
}

function startMusic(a: AudioContext, id: MusicId, buf: AudioBuffer) {
  // não pisa na trilha da abertura: entra quando ela está acabando
  const at = Math.max(a.currentTime + 0.05, intro ? introEnd - 0.4 : 0);
  const src = a.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(MUSIC_GAIN, at + 1.2);
  src.connect(g).connect(out(a));
  src.start(at);
  music = { id, voice: { src, gain: g }, at };
}

/** Toca a trilha em loop, com troca suave se outra estiver tocando. */
export function playMusic(id: MusicId) {
  wanted = id;
  if (!enabled || music?.id === id) return;
  const a = audio();
  if (!a) return;
  void loadMusic(a, id).then((buf) => {
    if (!buf || wanted !== id || !enabled || music?.id === id) return;
    fadeOutMusic(0.8);
    startMusic(a, id, buf);
  });
}

export function stopMusic(fade = 1) {
  wanted = null;
  fadeOutMusic(fade);
}

function fadeOutMusic(fade: number) {
  const a = ctx;
  const cur = music;
  music = null;
  if (a && cur) fadeVoice(a, cur.voice, fade);
}

/** A tela declara a trilha que quer (null = silêncio). */
export function useMusic(id: MusicId | null) {
  useEffect(() => { if (id) playMusic(id); else stopMusic(); }, [id]);
}

// ---------- torcida ----------

/** Arquivos da torcida (public/audio/crowd-*.mp3), carregados quando a partida começa. */
export const CROWD_FILES = ['bed', 'chant', ...(Object.keys(CUE_PRIORITY) as CrowdCue[])] as const;
type CrowdFile = (typeof CROWD_FILES)[number];

const CROWD_BED_GAIN = 0.32;
const CROWD_CHANT_GAIN = 0.26;
/** Volume de cada reação (os arquivos já vêm todos no mesmo volume percebido, -20 LUFS). */
const CUE_GAIN: Record<CrowdCue, number> = {
  roar: 0.55, win: 0.55, loss: 0.45, groan: 0.4, boo: 0.4, save: 0.4, ooh: 0.36, applause: 0.36, tension: 0.34,
};
const crowdBuffers = new Map<CrowdFile, AudioBuffer>();
let crowdLoading: Promise<void> | null = null;
let crowd: { bed: Voice; chant: Voice; levels: CrowdLevels } | null = null;
let crowdCue: { cue: CrowdCue; voice: Voice; until: number } | null = null;
/** Até quando o murmúrio fica abafado (depois de um gol contra a casa). */
let duckUntil = 0;

function loadCrowd(a: AudioContext): Promise<void> {
  if (!crowdLoading) {
    crowdLoading = Promise.all(CROWD_FILES.map(async (id) => {
      try {
        const res = await fetch(sampleUrl(`crowd-${id}`));
        if (res.ok) crowdBuffers.set(id, await a.decodeAudioData(await res.arrayBuffer()));
      } catch { /* sem o arquivo: a torcida fica sem essa parte */ }
    })).then(() => undefined);
  }
  return crowdLoading;
}

function loopVoice(a: AudioContext, buf: AudioBuffer): Voice {
  const src = a.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const g = a.createGain();
  g.gain.value = 0.0001;
  src.connect(g).connect(out(a));
  // cada partida começa num ponto diferente do loop, para não soar repetido
  src.start(a.currentTime + 0.02, Math.random() * buf.duration);
  return { src, gain: g };
}

/** Liga a torcida (murmúrio e cantoria em loop, começando em silêncio). */
export function startCrowd(levels: CrowdLevels) {
  if (!enabled || crowd) return;
  const a = audio();
  if (!a) return;
  void loadCrowd(a).then(() => {
    const bed = crowdBuffers.get('bed');
    const chant = crowdBuffers.get('chant');
    if (!enabled || crowd || !bed || !chant || stoppedCrowd) return;
    crowd = { bed: loopVoice(a, bed), chant: loopVoice(a, chant), levels };
    applyCrowd(a, 2);
  });
  stoppedCrowd = false;
}
let stoppedCrowd = false;

function applyCrowd(a: AudioContext, ramp: number) {
  if (!crowd) return;
  const t = a.currentTime;
  const ducked = t < duckUntil;
  const set = (v: Voice, target: number) => {
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), t);
    v.gain.gain.linearRampToValueAtTime(Math.max(0.0001, target), t + ramp);
  };
  set(crowd.bed, crowd.levels.bed * CROWD_BED_GAIN * (ducked ? 0.3 : 1));
  set(crowd.chant, crowd.levels.chant * CROWD_CHANT_GAIN * (ducked ? 0 : 1));
}

/** Ajusta o volume das camadas conforme o jogo (placar, minuto, público). */
export function setCrowd(levels: CrowdLevels) {
  const a = ctx;
  if (!a || !crowd) return;
  crowd.levels = levels;
  if (a.currentTime >= duckUntil) applyCrowd(a, 1.5);
}

/** Reação da torcida. Uma mais forte corta a que está tocando; uma mais fraca espera a vez (e se perde). */
export function cheer(cue: CrowdCue) {
  const a = ctx;
  const buf = crowdBuffers.get(cue);
  if (!enabled || !a || !buf || !crowd) return;
  const t = a.currentTime;
  if (crowdCue && t < crowdCue.until && CUE_PRIORITY[crowdCue.cue] >= CUE_PRIORITY[cue]) return;
  if (crowdCue && t < crowdCue.until) fadeVoice(a, crowdCue.voice, 0.25);
  const size = 0.6 + 0.4 * Math.min(1, crowd.levels.bed / 0.7);
  const voice = playBuffer(a, buf, t + 0.01, undefined, (CUE_GAIN[cue] / SAMPLE_GAIN) * size, 0.08);
  crowdCue = { cue, voice, until: t + buf.duration * 0.8 };
  if (cue === 'groan' || cue === 'loss') {
    // o estádio cala: murmúrio abafado por uns segundos e volta devagar
    duckUntil = t + 5;
    applyCrowd(a, 0.6);
    setTimeout(() => { if (ctx && crowd) applyCrowd(ctx, 3); }, 5000);
  }
}

/** Desliga as camadas contínuas. A reação que estiver tocando (festa, vaia) termina sozinha. */
export function stopCrowd(fade = 3) {
  stoppedCrowd = true;
  const a = ctx;
  const cur = crowd;
  crowd = null;
  if (!a || !cur) return;
  fadeVoice(a, cur.bed, fade);
  fadeVoice(a, cur.chant, fade);
}

// ---------- síntese ----------

interface Note { f: number; t: number; d: number; type?: OscillatorType; vol?: number; vibrato?: number }

function tones(notes: Note[]) {
  const a = audio();
  if (!a) return;
  const now = a.currentTime + 0.02;
  const master = a.createGain();
  master.gain.value = 0.18;
  master.connect(out(a));
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

/** Síntese de cada efeito: o som de reserva quando não há arquivo. */
export const SOUNDS: Record<SoundKind, Note[]> = {
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
  // sirene curta: atleta machucado
  injury: [{ f: 880, t: 0, d: 0.14, type: 'triangle', vol: 0.8 }, { f: 660, t: 0.15, d: 0.14, type: 'triangle', vol: 0.8 }, { f: 880, t: 0.3, d: 0.14, type: 'triangle', vol: 0.8 }, { f: 660, t: 0.45, d: 0.2, type: 'triangle', vol: 0.8 }],
  // blip de cursor
  click: [{ f: 1568, t: 0, d: 0.04, vol: 0.35 }],
};

export function play(kind: SoundKind) {
  if (!enabled) return;
  try {
    const list = SAMPLED[kind];
    if (list && hits(list)) return;
    tones(SOUNDS[kind]);
  } catch { /* áudio indisponível: segue sem som */ }
}

/** Blip em todo clique de botão (menos no botão de som e nos marcados com data-silent). */
export function installClickSound(): () => void {
  const onClick = (e: MouseEvent) => {
    const el = (e.target as Element | null)?.closest?.('button');
    if (!el || el.disabled || el.classList.contains('sound-toggle') || el.hasAttribute('data-silent')) return;
    play('click');
  };
  document.addEventListener('click', onClick, true);
  return () => document.removeEventListener('click', onClick, true);
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
