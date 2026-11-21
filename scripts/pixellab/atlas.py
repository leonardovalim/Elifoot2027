#!/usr/bin/env python3
"""
Junta PNGs soltos num atlas (uma imagem só) e grava o manifesto com o retângulo de cada um.

    python3 scripts/pixellab/atlas.py <pasta-com-pngs> <saida.png> <saida.json>

Cada PNG é recortado na parte opaca e tem o alfa endurecido (0 ou 255). O manifesto
fica {nome: [x, y, w, h]}. Requer Pillow (só na geração; o jogo não depende dele).
"""
import glob
import json
import os
import sys

from PIL import Image


def load(path):
    im = Image.open(path).convert('RGBA')
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 255) if a >= 128 else (0, 0, 0, 0)
    box = im.getchannel('A').getbbox()
    return im.crop(box) if box else im


def main():
    src, out_png, out_json = sys.argv[1:4]
    items = sorted(((os.path.basename(f)[:-4], load(f)) for f in glob.glob(os.path.join(src, '*.png'))),
                   key=lambda t: -t[1].height)
    width, pad = 256, 1
    x = y = row_h = 0
    rects = {}
    for name, im in items:
        if x + im.width > width:
            x, y, row_h = 0, y + row_h + pad, 0
        rects[name] = [x, y, im.width, im.height]
        x += im.width + pad
        row_h = max(row_h, im.height)
    sheet = Image.new('RGBA', (width, y + row_h), (0, 0, 0, 0))
    for name, im in items:
        sheet.paste(im, tuple(rects[name][:2]))
    sheet.save(out_png, optimize=True)
    with open(out_json, 'w') as f:
        json.dump(dict(sorted(rects.items())), f, separators=(',', ':'))
    print(f'{len(rects)} objetos, atlas {sheet.size[0]}x{sheet.size[1]}')


if __name__ == '__main__':
    main()
