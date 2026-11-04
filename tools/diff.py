"""Compara dos carpetas de capturas y dice qué vistas cambiaron (y cuánto)."""
import sys, os
from PIL import Image, ImageChops
a, b = sys.argv[1], sys.argv[2]
for name in sorted(os.listdir(a)):
    ia, ib = Image.open(os.path.join(a, name)).convert("RGB"), Image.open(os.path.join(b, name)).convert("RGB")
    if ia.size != ib.size:
        print(f"{name}: tamaño distinto {ia.size} → {ib.size}"); continue
    diff = ImageChops.difference(ia, ib).convert("L").point(lambda v: 255 if v > 24 else 0)
    changed = sum(diff.histogram()[255:]) / (ia.size[0] * ia.size[1]) * 100
    print(f"{name}: {changed:.2f}% de píxeles distintos" if changed > 0.05 else f"{name}: igual")
