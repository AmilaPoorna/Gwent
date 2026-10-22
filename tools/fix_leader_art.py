#!/usr/bin/env python3
"""
One-time fix for the leader card images taken from gwent-classic.

In those images the leader art and the printed name plate were paired up wrongly for several leaders.
The correct pairing was checked against footage of the original game's "Choose a Leader" screen
(The Witcher 3 deck builder, one recording per faction). For each leader this takes the art half from the
image that carries that leader's art, and the name-plate half (name + quote) from the image whose plate
already names that leader. Both halves come from the same card template, so they join on the gold divider.

Usage: python3 tools/fix_leader_art.py   (then re-run tools/make_deck_faces.py)
"""
import os
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'www', 'assets', 'cards')

# leader id -> file whose ART belongs to that leader (the plate of the leader's own file is already correct)
ART_SOURCE = {
    'foltest_king': 'foltest_siegemaster',        # sitting by the window, hand on chin
    'foltest_lord': 'foltest_steelforged',        # on the throne, fleur-de-lis robe
    'foltest_siegemaster': 'foltest_king',        # at the siege-engine table
    'foltest_steelforged': 'foltest_lord',        # at the war table with a candle
    'emhyr_imperial': 'emhyr_relentless',         # seated in a dark, rainy hall
    'emhyr_whiteflame': 'emhyr_imperial',         # holding a wine glass, sun banner
    'emhyr_relentless': 'emhyr_whiteflame',       # holding a letter, hooded aide
    'francesca_queen': 'francesca_pureblood',     # lightning and fire
    'francesca_beautiful': 'francesca_daisy',     # pointing, archers behind
    'francesca_daisy': 'francesca_queen',         # on the throne
    'francesca_pureblood': 'francesca_beautiful', # close-up, blue magic in hand
    'eredin_bringer': 'eredin_destroyer',         # blue flame in hand, smoke
    'eredin_destroyer': 'eredin_king',            # two burning figures
    'eredin_king': 'eredin_bringer',              # pointing across a smoking battlefield
}


def divider_row(im):
    """Top of the gold line that separates the art from the parchment."""
    W, H = im.size
    px = im.load()
    for y in range(int(H * 0.6), int(H * 0.85)):
        row = [px[x, y] for x in range(int(W * 0.3), int(W * 0.7), 4)]
        gold = sum(1 for r, g, b in row if r > 150 and g > 100 and b < 90 and r - b > 80)
        if gold > len(row) * 0.6:
            return y
    raise ValueError('divider not found')


def main():
    lg = {k: Image.open(os.path.join(ROOT, 'lg', f'{k}.jpg')).convert('RGB') for k in set(ART_SOURCE) | set(ART_SOURCE.values())}
    sm = {k: Image.open(os.path.join(ROOT, 'sm', f'{k}.jpg')).convert('RGB') for k in lg}
    for leader, src in ART_SOURCE.items():
        plate, art = lg[leader], lg[src]
        y = divider_row(plate)
        out = plate.copy()
        out.paste(art.crop((0, 0, art.width, y)), (0, 0))
        out.save(os.path.join(ROOT, 'lg', f'{leader}.jpg'), quality=92)
        sm[src].save(os.path.join(ROOT, 'sm', f'{leader}.jpg'), quality=92)
        print(f'{leader}: art from {src}, divider at y={y}')


if __name__ == '__main__':
    main()
