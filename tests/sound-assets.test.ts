import { CROWD_FILES, JINGLES, MUSIC, SAMPLED, SAMPLES, SOUNDS } from '../src/ui/sound';

// só os nomes importam: o glob lista o que existe em public/audio
const files = Object.keys(import.meta.glob('../public/audio/*.mp3', { query: '?url', eager: true }))
  .map((p) => p.split('/').pop()!.replace(/\.mp3$/, ''));

describe('arquivos de som', () => {
  it('toda amostra e trilha declarada existe em public/audio', () => {
    for (const id of [...SAMPLES, ...MUSIC, ...CROWD_FILES.map((c) => `crowd-${c}`), ...JINGLES.map((j) => `jingle-${j}`)]) expect(files, `${id}.mp3`).toContain(id);
  });

  it('efeitos com arquivo usam só amostras declaradas e têm síntese de reserva', () => {
    for (const [kind, hits] of Object.entries(SAMPLED)) {
      expect(SOUNDS[kind as keyof typeof SOUNDS], kind).toBeDefined();
      for (const h of hits!) expect(SAMPLES).toContain(h.s);
    }
  });
});
