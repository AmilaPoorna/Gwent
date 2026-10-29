#!/usr/bin/env python3
"""
Builds the board's side fills (www/assets/ui/board_side_l.jpg and board_side_r.jpg) from the board art.

The board is 16:9. On wider screens (most phones are 19.5:9 or 20:9) the space left and right of it shows the
board's plain outer wood carrying on to the edges of the screen. Each fill is the plain strip at that edge of the
board and its mirror image, so it continues the board without a seam and tiles without one either.

Usage: python3 tools/make_board_sides.py
"""
import os
from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
UI = os.path.join(HERE, '..', 'www', 'assets', 'ui')
LEFT = (0, 60)       # plain wood left of the leader and weather frames
RIGHT = (1870, 1920)  # plain wood right of the frame line by the decks

board = Image.open(os.path.join(UI, 'board.jpg')).convert('RGB')


def tile(x0, x1, mirror_first):
    strip = board.crop((x0, 0, x1, board.height))
    halves = [ImageOps.mirror(strip), strip] if mirror_first else [strip, ImageOps.mirror(strip)]
    out = Image.new('RGB', (strip.width * 2, strip.height))
    out.paste(halves[0], (0, 0))
    out.paste(halves[1], (strip.width, 0))
    return out


# The left fill is drawn from its right edge (next to the board) outwards, the right fill from its left edge
tile(*LEFT, mirror_first=False).save(os.path.join(UI, 'board_side_l.jpg'), quality=88)
tile(*RIGHT, mirror_first=True).save(os.path.join(UI, 'board_side_r.jpg'), quality=88)
