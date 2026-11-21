import { describe, expect, it } from 'vitest';
import { classify, hexToRgb, recolorPixel } from '../src/ui/scene/tint';

describe('recolorir atleta do CT', () => {
  it('separa camisa, calção, pele e o resto pelo matiz', () => {
    expect(classify(...hexToRgb('#b2c43c'))).toBe('shirt');
    expect(classify(...hexToRgb('#718220'))).toBe('shirt'); // sombra da camisa
    expect(classify(...hexToRgb('#2948a0'))).toBe('shorts');
    expect(classify(...hexToRgb('#f6ac97'))).toBe('skin');
    expect(classify(...hexToRgb('#0c0908'))).toBe('keep'); // contorno
    expect(classify(...hexToRgb('#f8f5f7'))).toBe('keep'); // meião branco
  });

  it('troca pelas cores do clube mantendo a sombra', () => {
    const colors: [string, string] = ['#c8323c', '#ffffff'];
    expect(recolorPixel(...hexToRgb('#b2c43c'), colors, '#e0a878')).toEqual(hexToRgb('#c8323c'));
    const shadow = recolorPixel(...hexToRgb('#718220'), colors, '#e0a878');
    expect(shadow[0]).toBeLessThan(0xc8); // sombra mais escura que a cor cheia
    expect(recolorPixel(...hexToRgb('#0c0908'), colors, '#e0a878')).toEqual(hexToRgb('#0c0908'));
  });
});
