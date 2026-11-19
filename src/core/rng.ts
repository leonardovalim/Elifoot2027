/**
 * RNG determinístico (mulberry32). Todo o jogo usa esta fonte de aleatoriedade
 * para que uma simulação com a mesma seed produza sempre o mesmo resultado —
 * requisito para o modo online (servidor autoritativo + replay no cliente).
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Estado serializável — persista para continuar a sequência depois. */
  get snapshot(): number {
    return this.state;
  }

  /** Float em [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Inteiro em [min, max] (inclusivo). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick() em lista vazia');
    return items[Math.floor(this.next() * items.length)]!;
  }

  /** Escolha ponderada; pesos <= 0 nunca são escolhidos. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T {
    const weights = items.map((i) => Math.max(0, weight(i)));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return this.pick(items);
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i]!;
      if (r < 0) return items[i]!;
    }
    return items[items.length - 1]!;
  }

  /** Aproximação de normal (soma de 3 uniformes), média 0, desvio ~1. */
  gaussian(): number {
    return (this.next() + this.next() + this.next() - 1.5) * 2;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
    return arr;
  }
}
