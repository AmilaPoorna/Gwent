#!/usr/bin/env python3
"""
Builds the deck-builder card faces (www/assets/cards/db/) from the full card faces (www/assets/cards/lg/).

In The Witcher 3 the deck builder draws each card's name itself, in large type, with no flavour quote, and puts
the copy count ("x3") below it, so these faces need a blank parchment.

All cards that share a frame (same faction, hero or not, same image size) have an identical parchment: only
the printed name and quote differ. For each pixel of the parchment, the template averages the cards that have
no ink at that spot (ink = much darker than the lightest card there); the few spots inked on every card are
filled from their neighbours. Each card then gets that clean parchment below its gold divider line, so the
faction ribbon's tip is kept and everything above the line (art, strength badge, icons) is untouched.
Frames that only appear on one or two cards borrow the template of the same frame type, resized.

Usage: python3 tools/make_deck_faces.py
"""
import json
import os
import re
import subprocess
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', 'www', 'assets', 'cards')
SRC, DST = os.path.join(ROOT, 'lg'), os.path.join(ROOT, 'db')
OUT_WIDTH = 280  # shown at 187px wide in the deck builder; 1.5x for high-DPI screens
MIN_GROUP = 4    # smaller groups borrow a template from a bigger group of the same frame type


def card_meta():
    """id -> {faction, type, hero}, read from www/js/cards.js with node."""
    js = ("const fs=require('fs'),vm=require('vm');const c=vm.createContext({});"
          "vm.runInContext(fs.readFileSync(process.argv[1],'utf8')+';this.C=CARDS',c);"
          "const o={};for(const t of Object.values(c.C)) o[t.id]={faction:t.faction,type:t.type,hero:!!t.hero};"
          "console.log(JSON.stringify(o));")
    out = subprocess.run(['node', '-e', js, os.path.join(HERE, '..', 'www', 'js', 'cards.js')], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def frame_key(m):
    if m['type'] == 'leader':
        return ('leader',)
    if m['type'] != 'unit':
        return ('special',)
    return (m['faction'], m['hero'])


def parchment_top(im):
    """First row below the gold divider line that separates the art from the parchment."""
    W, H = im.size
    px = im.load()

    def gold(y):
        row = [px[x, y] for x in range(int(W * 0.3), int(W * 0.7), 4)]
        return sum(1 for r, g, b in row if r > 150 and g > 100 and b < 135 and r - b > 60) > len(row) * 0.6
    # scan up from the parchment: the first gold rows met are the divider (never warm-coloured art above it)
    y = next(y for y in range(int(H * 0.86), int(H * 0.6), -1) if gold(y))
    return y + 2


def build_template(images, ink_drop=28):
    """Clean parchment for a group of cards with the same frame (see module docstring)."""
    W, H = images[0].size
    top = min(parchment_top(im) for im in images) - 1
    region = (0, top, W, H)
    data = [list(im.crop(region).getdata()) for im in images]
    n = len(data[0])
    lum = lambda p: 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]
    out, known = [None] * n, [False] * n
    for i in range(n):
        vals = [d[i] for d in data]
        light = max(lum(v) for v in vals)
        clean = [v for v in vals if lum(v) > light - ink_drop]
        # median, not mean: JPEG ringing around the text would otherwise leave a faint light band
        if len(clean) >= max(2, len(vals) // 3) or (len(clean) == len(vals)):
            out[i] = tuple(sorted(v[c] for v in clean)[len(clean) // 2] for c in range(3))
            known[i] = True
    # fill spots that are inked on (almost) every card from their known neighbours
    w, h = W, H - top
    pending = [i for i in range(n) if not known[i]]
    for _ in range(40):
        if not pending:
            break
        nxt = []
        for i in pending:
            x, y = i % w, i // w
            nb = [out[j] for j in (i - 1, i + 1, i - w, i + w, i - w - 1, i - w + 1, i + w - 1, i + w + 1)
                  if 0 <= j < n and known[j] and abs(j % w - x) <= 1]
            if len(nb) >= 2:
                out[i] = tuple(sum(p[c] for p in nb) // len(nb) for c in range(3))
                known[i] = True
            else:
                nxt.append(i)
        pending = nxt
    tpl = images[0].copy()
    patch = Image.new('RGB', (w, h))
    patch.putdata([p if p is not None else (200, 190, 175) for p in out])
    tpl.paste(patch, (0, top))
    return tpl


def main():
    meta = card_meta()
    files = sorted(f for f in os.listdir(SRC) if f.endswith('.jpg'))
    groups = {}
    for f in files:
        base = f[:-4]
        cid = base if base in meta else re.sub(r'_\d+$', '', base)
        im = Image.open(os.path.join(SRC, f)).convert('RGB')
        groups.setdefault((frame_key(meta[cid]), im.size), []).append((f, im))

    templates = {}
    for (key, size), items in groups.items():
        if len(items) >= MIN_GROUP:
            templates[(key, size)] = build_template([im for _, im in items])

    # Hero groups are small (4-5 cards) and their names overlap, so text survives in their templates.
    # Every hero shares the same gold parchment: build it from all heroes of the common size and use it for
    # everything right of the faction ribbon; the ribbon strip still comes from the faction's own template.
    hero_items = [im for (key, size), items in groups.items() if len(key) == 2 and key[1] and size == (410, 775) for _, im in items]
    if hero_items:
        all_heroes = build_template(hero_items)
        for (key, size), tpl in list(templates.items()):
            if not (len(key) == 2 and key[1]):
                continue
            base = all_heroes if size == all_heroes.size else all_heroes.resize(size, Image.LANCZOS)
            W, H = size
            strip = int(W * 0.24)
            merged = base.copy()
            if key[0] == 'neutral':
                # no ribbon: the shared template's left strip has ghosts of the faction ribbons, so keep our own
                merged.paste(tpl.crop((0, 0, strip, H)), (0, 0))
            else:
                # keep the faction's own strip down to the ribbon tip; below it the strip is plain parchment
                a, b = tpl.load(), base.load()
                top = parchment_top(tpl)
                def matches(y):
                    xs = range(2, strip, 2)
                    return sum(1 for x in xs if sum(abs(a[x, y][c] - b[x, y][c]) for c in range(3)) < 60) >= len(xs) * 0.85
                tip = next((y for y in range(top + 6, H) if all(matches(y + k) for k in range(4) if y + k < H)), H)
                merged.paste(tpl.crop((0, 0, strip, tip)), (0, 0))
            templates[(key, size)] = merged

    # Final pass: replace isolated dark specks (bits of letters inked on every card) with the local median.
    # Large dark areas such as the black Nilfgaard ribbon have a dark median themselves and are left alone.
    for k, tpl in templates.items():
        W, H = tpl.size
        top = parchment_top(tpl)
        region = tpl.crop((0, top, W, H))
        med = region.filter(ImageFilter.MedianFilter(9))
        rp, mp = region.load(), med.load()
        lum = lambda p: 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]
        for y in range(region.height):
            for x in range(W):
                if lum(rp[x, y]) < lum(mp[x, y]) - 30:
                    rp[x, y] = mp[x, y]
        tpl.paste(region, (0, top))

    def template_for(key, size):
        if (key, size) in templates:
            return templates[(key, size)]
        # borrow from the largest group with the same frame type and resize it
        donors = [(k, s) for (k, s) in templates if k == key]
        if not donors:
            raise SystemExit(f'no template for frame {key}')
        donor = max(donors, key=lambda ks: len(groups[ks]))
        return templates[donor].resize(size, Image.LANCZOS)

    os.makedirs(DST, exist_ok=True)
    for (key, size), items in groups.items():
        tpl = template_for(key, size)
        for f, im in items:
            top = parchment_top(im)
            out = im.copy()
            out.paste(tpl.crop((0, top, size[0], size[1])), (0, top))
            w, h = out.size
            out.resize((OUT_WIDTH, round(h * OUT_WIDTH / w)), Image.LANCZOS).save(os.path.join(DST, f), quality=86, optimize=True)
    print(f'{len(files)} deck-builder faces written; {len(templates)} parchment templates from {len(groups)} frame groups')


if __name__ == '__main__':
    main()
