"""One-time asset step (already applied). The current game, with the free DLCs installed, shows ten neutral cards
with their DLC art (def_gwint_cards_final.xml: dlcPicture="neu_*_dlc"). This puts that art, taken from the card
faces in matt77hias/Gwent, into our card faces (keeping our parchment, name and quote) and our board textures.

usage: python3 tools/apply_dlc_art.py "<matt77hias/Gwent checkout>/res/Gwent/Neutral Units"
then:  python3 tools/make_deck_faces.py   (deck-builder faces)
"""
import sys
from pathlib import Path
from PIL import Image

CARDS = Path(__file__).resolve().parent.parent / 'www' / 'assets' / 'cards'
SOURCES = {  # our card id -> matt77hias/Gwent file name (" 2" is the DLC art)
    'geralt': 'Geralt of Rivia', 'ciri': 'Cirilla Fiona Elen Rianno', 'yennefer': 'Yennefer of Vengerberg',
    'triss': 'Triss Merigold', 'avallach': 'Mysterious Elf', 'vesemir': 'Vesemir', 'zoltan': 'Zoltan Chivay',
    'dandelion': 'Dandelion', 'villen': 'Villentretenmerth', 'regis': 'Emiel Regis Rohellec Terzieff',
}


def rows(im, test, share):
    """y -> whether at least `share` of the row's pixels pass `test`."""
    W = im.size[0]
    px = im.load()
    return lambda y: sum(test(*px[x, y]) for x in range(0, W, 4)) >= share * len(range(0, W, 4))


def gold(r, g, b):
    return r > 150 and g > 100 and b < 135 and r - b > 60


def beige(r, g, b):
    return r > 170 and g > 150 and b > 110


def divider_top(im):
    """First row of the gold line between the art and the parchment."""
    H = im.size[1]
    is_gold, is_beige = rows(im, gold, .6), rows(im, beige, .8)
    y = next(y for y in range(int(H * .6), H) if is_gold(y) or is_beige(y))
    return y - 2


def main(src_dir):
    for cid, name in SOURCES.items():
        src = Image.open(Path(src_dir) / f'{name} 2.png').convert('RGB')
        sw = src.size[0]
        art_h = divider_top(src)

        face_path = CARDS / 'lg' / f'{cid}.jpg'
        face = Image.open(face_path).convert('RGB')
        W, top = face.size[0], divider_top(face)
        scale = max(W / sw, top / art_h)
        art = src.crop((0, 0, sw, art_h)).resize((round(sw * scale), round(art_h * scale)), Image.LANCZOS)
        face.paste(art.crop((0, 0, W, top)), (0, 0))  # anchored top left, where the strength badge is
        face.save(face_path, quality=90)

        # board texture: the art right of the badge column
        tex_path = CARDS / 'sm' / f'{cid}.jpg'
        tw, th = Image.open(tex_path).size
        x0 = round(sw * .26)
        w = sw - x0
        h = round(w * th / tw)
        if h > art_h:
            h = art_h
            w = round(h * tw / th)
            x0 = sw - w
        src.crop((x0, 0, x0 + w, h)).resize((tw, th), Image.LANCZOS).save(tex_path, quality=90)
        print(f'{cid}: face art 0..{top}, texture from x {x0}')


if __name__ == '__main__':
    main(sys.argv[1])
