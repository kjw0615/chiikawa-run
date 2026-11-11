"""Pack generated mini-game art into one small WebP sheet. Python + Pillow, authoring only."""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
NAMES = ['chiikawa', 'hachiware', 'usagi', 'mob', 'lemon']
sheet = Image.new('RGBA', (1024, 256))
frames = {}
for n, name in enumerate(NAMES):
    source = Image.open(ROOT / 'art-source' / f'event-{name}.png').convert('RGBA')
    box = source.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    sprite = source.crop(box)
    sprite.thumbnail((180, 208), Image.Resampling.LANCZOS)
    x, y = n * 196 + 2, 2
    sheet.paste(sprite, (x + (192 - sprite.width) // 2, y + 220 - sprite.height))
    frames[name] = {'frame': {'x': x, 'y': y, 'w': 192, 'h': 224}, 'rotated': False, 'trimmed': False,
                    'spriteSourceSize': {'x': 0, 'y': 0, 'w': 192, 'h': 224}, 'sourceSize': {'w': 192, 'h': 224}}
out = ROOT / 'public' / 'assets'
sheet.save(out / 'event-atlas.webp', lossless=True, method=6, exact=True)
(out / 'event-atlas.json').write_text(json.dumps({'frames': frames, 'meta': {
    'image': 'event-atlas.webp', 'format': 'RGBA8888', 'size': {'w': 1024, 'h': 256}, 'scale': '1'}}, indent=2), encoding='utf-8')
print('Event atlas bytes:', (out / 'event-atlas.webp').stat().st_size)
