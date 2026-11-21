import { mainCluster } from '../src/ui/scene/legacyThumb';

const canvas = (w: number, h: number, painted: [number, number][]) => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (const [x, y] of painted) d[(y * w + x) * 4 + 3] = 255;
  return d;
};

describe('miniatura do objeto do CT: objeto principal', () => {
  it('objetos espalhados: fica o maior grupo', () => {
    // grupo A com 2 pixels no canto, grupo B com 4 pixels longe dele
    const d = canvas(30, 10, [[0, 0], [1, 0], [20, 5], [21, 5], [20, 6], [21, 6]]);
    expect(mainCluster(d, 30, 10)).toMatchObject({ x: 20, y: 5, w: 2, h: 2, count: 4 });
  });

  it('pixels a até 3 px de distância contam como o mesmo objeto', () => {
    expect(mainCluster(canvas(12, 3, [[0, 1], [3, 1], [6, 1]]), 12, 3)).toMatchObject({ x: 0, w: 7, count: 3 });
  });

  it('nada pintado devolve null', () => {
    expect(mainCluster(canvas(5, 5, []), 5, 5)).toBeNull();
  });
});
