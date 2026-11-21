#!/usr/bin/env python3
"""
Monta uma folha de sprites (strip horizontal) a partir de quadros baixados do PixelLab.

    python3 scripts/pixellab/pack.py <saida.png> <anim>=<pasta>/<prefixo>[:quadros][!] ...

- <prefixo>-<n>.png são os quadros (ex.: k20/chute-east -> k20/chute-east-0.png ...).
- quadros: lista opcional "1,3,4,7" (padrão: todos, em ordem).
- "!" no fim: mantém só a maior mancha conectada de cada quadro (apaga bola/pixels soltos).
- "rot-west" etc. também servem como animação de 1 quadro.

Grava <saida.png> e imprime o manifesto JSON {anim: [início, quantidade]} para colar no código.
Requer Pillow (só no momento de gerar; o jogo não depende dele).
"""
import json
import os
import re
import sys

from PIL import Image


def largest_blob(img):
    w, h = img.size
    px = img.load()
    seen = set()
    best = []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] < 128 or (x, y) in seen:
                continue
            stack, blob = [(x, y)], []
            seen.add((x, y))
            while stack:
                cx, cy = stack.pop()
                blob.append((cx, cy))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen and px[nx, ny][3] >= 128:
                            seen.add((nx, ny))
                            stack.append((nx, ny))
            if len(blob) > len(best):
                best = blob
    keep = set(best)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    o = out.load()
    for (x, y) in keep:
        o[x, y] = px[x, y]
    return out


def harden(img):
    """Alfa binário: pixel art não tem meia transparência."""
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 255) if a >= 128 else (0, 0, 0, 0)
    return img


def frames_for(spec):
    m = re.match(r'^([^=]+)=([^:!]+)(?::([0-9,]+))?(!)?$', spec)
    if not m:
        sys.exit(f'especificação inválida: {spec}')
    name, prefix, pick, clean = m.groups()
    if os.path.exists(prefix + '.png'):
        files = [prefix + '.png']
    else:
        n = 0
        while os.path.exists(f'{prefix}-{n}.png'):
            n += 1
        idx = [int(i) for i in pick.split(',')] if pick else list(range(n))
        files = [f'{prefix}-{i}.png' for i in idx]
    imgs = []
    for f in files:
        im = harden(Image.open(f).convert('RGBA'))
        imgs.append(largest_blob(im) if clean else im)
    return name, imgs


def main():
    out, specs = sys.argv[1], sys.argv[2:]
    anims = [frames_for(s) for s in specs]
    fw, fh = anims[0][1][0].size
    total = sum(len(f) for _, f in anims)
    sheet = Image.new('RGBA', (fw * total, fh), (0, 0, 0, 0))
    manifest, i = {}, 0
    for name, imgs in anims:
        manifest[name] = [i, len(imgs)]
        for im in imgs:
            sheet.paste(im, (i * fw, 0))
            i += 1
    sheet.save(out, optimize=True)
    print(json.dumps({'frame': [fw, fh], 'anims': manifest}))


if __name__ == '__main__':
    main()
