"""Pack generated source PNGs for Phaser; keep source artwork unchanged.

Optional authoring tool: Python + Pillow. Runtime/build uses committed outputs.
Run from the project root: python scripts/build-assets.py
"""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'public' / 'assets'
SOURCE = ROOT / 'art-source'
TARGETS = {
    'momonga': (256, 224), 'momonga-crouch': (320, 128), 'dekatsuyo': (320, 224),
    'food-pudding': (96, 96), 'food-pancake': (96, 96), 'food-cream-puff': (96, 96),
    'obstacle-rock': (160, 128), 'obstacle-log': (384, 128), 'obstacle-vines': (220, 416),
}
HOME = {'momonga', 'dekatsuyo', 'food-pudding', 'food-pancake', 'food-cream-puff'}
atlas = Image.new('RGBA', (2048, 2048))
sprites = {}
for character, target in [('momonga', (256, 224)), ('dekatsuyo', (448, 320))]:
    sheet = Image.open(SOURCE / f'{character}-run-sheet.png').convert('RGBA')
    cells = []
    for i in range(4):
        cell = sheet.crop((i % 2 * sheet.width // 2, i // 2 * sheet.height // 2,
                           (i % 2 + 1) * sheet.width // 2, (i // 2 + 1) * sheet.height // 2))
        cells.append(cell.crop(cell.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()))
    factor = min((target[0]-4)/max(c.width for c in cells), (target[1]-4)/max(c.height for c in cells))
    for i, cell in enumerate(cells):
        cell = cell.resize((round(cell.width*factor), round(cell.height*factor)), Image.Resampling.LANCZOS)
        sprite = Image.new('RGBA', target)
        sprite.paste(cell, ((target[0]-cell.width)//2, target[1]-cell.height-2))
        name = f'{character}-run-{i}'
        TARGETS[name] = target
        sprites[name] = sprite
frames, source_frames = {}, {}
x = y = row_height = 2
for name, size in TARGETS.items():
    if name in sprites:
        original = sprites[name]
    else:
        original = Image.open(SOURCE / f'{name}.png').convert('RGBA')
    box = original.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    l, t, r, b = box
    source_frames[name] = {'x': l, 'y': t, 'w': r-l, 'h': b-t}
    cropped = original if name in sprites else original.crop(box)
    if name in HOME:
        home = cropped.copy()
        home.thumbnail((512, 512) if name in {'momonga', 'dekatsuyo'} else (160, 160), Image.Resampling.LANCZOS)
        home.save(ASSETS / f'{name}.webp', lossless=True, method=6, exact=True)
    sprite = cropped.copy(); sprite.thumbnail(size, Image.Resampling.LANCZOS)
    w, h = sprite.size
    if x + w + 2 > atlas.width:
        x = 2; y += row_height + 4; row_height = 0
    if y + h + 2 > atlas.height:
        raise RuntimeError('Atlas exceeds 2048x2048; reduce targets or add a page')
    atlas.paste(sprite, (x, y))
    frames[name] = {'frame': {'x': x, 'y': y, 'w': w, 'h': h}, 'rotated': False,
                    'trimmed': False, 'spriteSourceSize': {'x': 0, 'y': 0, 'w': w, 'h': h},
                    'sourceSize': {'w': w, 'h': h}}
    x += w + 4; row_height = max(row_height, h)
used_height = y + row_height + 2
atlas = atlas.crop((0, 0, atlas.width, 1 << (used_height - 1).bit_length()))
atlas.save(ASSETS / 'game-atlas.webp', lossless=True, method=6, exact=True)
metadata = {'frames': frames, 'meta': {'image': 'game-atlas.webp', 'format': 'RGBA8888',
                                     'size': {'w': atlas.width, 'h': atlas.height}, 'scale': '1'}}
(ASSETS / 'game-atlas.json').write_text(json.dumps(metadata, indent=2), encoding='utf-8')
(SOURCE / 'frames.json').write_text(json.dumps(source_frames, indent=2), encoding='utf-8')
print('Atlas:', (ASSETS / 'game-atlas.webp').stat().st_size, 'bytes; frames:', len(frames))
print('Home:', sum((ASSETS / f'{k}.webp').stat().st_size for k in HOME), 'bytes')
