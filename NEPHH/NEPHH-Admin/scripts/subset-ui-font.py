"""Rebuild the bundled OFL Chinese UI subset: python subset-ui-font.py --font /path/to/NotoSansSC-VF.ttf."""
import argparse
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

parser = argparse.ArgumentParser()
parser.add_argument('--font', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
chars = set(range(32, 256)) | set(range(0x2000, 0x2070)) | set(range(0x3000, 0x3040))
# GB2312 level-one characters cover common user names as well as the static UI.
for high in range(0xB0, 0xD8):
    for low in range(0xA1, 0xFF):
        try:
            chars.update(map(ord, bytes([high, low]).decode('gb2312')))
        except UnicodeDecodeError:
            pass
for source_root in [root / 'src', root.parent / 'NEPHH-backend/src/main/java']:
    for path in source_root.rglob('*'):
        if path.suffix in {'.vue', '.ts', '.css', '.java'}:
            chars.update(map(ord, path.read_text(encoding='utf-8')))
font = TTFont(args.font)
for record in font['name'].names:
    if record.nameID in {1, 4, 16}:
        record.string = 'Nephh Sans UI'.encode(record.getEncoding())
    elif record.nameID == 6:
        record.string = 'NephhSansUI-Regular'.encode(record.getEncoding())
options = subset.Options()
options.name_IDs = ['*']
options.name_legacy = True
options.name_languages = ['*']
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=chars)
subsetter.subset(font)
font.flavor = 'woff2'
output = root / 'public/fonts/nephh-sans-ui.woff2'
output.parent.mkdir(parents=True, exist_ok=True)
font.save(output)
print(f'{output.name}: {output.stat().st_size} bytes, {len(font.getBestCmap())} mapped characters')
