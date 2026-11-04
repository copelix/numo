"""Dónde cambian dos capturas: primera fila distinta y recortes lado a lado."""
import sys
from PIL import Image, ImageChops
a, b, out = sys.argv[1:4]
ia, ib = Image.open(a).convert("RGB"), Image.open(b).convert("RGB")
h = min(ia.height, ib.height)
d = ImageChops.difference(ia.crop((0, 0, 390, h)), ib.crop((0, 0, 390, h))).convert("L").point(lambda v: 255 if v > 24 else 0)
box = d.getbbox()
print("primera diferencia:", box)
if box:
    y0 = max(0, box[1] - 120); y1 = min(h, y0 + 420)
    c = Image.new("RGB", (790, y1 - y0), "white"); c.paste(ia.crop((0, y0, 390, y1)), (0, 0)); c.paste(ib.crop((0, y0, 390, y1)), (400, 0)); c.save(out)
