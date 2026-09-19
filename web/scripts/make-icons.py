"""Render the PWA icon (clock motif) at 192/512 with Pillow — no SVG rasterizer on this box."""
from PIL import Image, ImageDraw
import math, sys

def icon(size: int, out: str):
    s = size * 4  # supersample
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = s * 96 // 512
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=r, fill=(15, 20, 32, 255))
    c = s // 2
    R = s * 170 // 512
    w = s * 28 // 512
    d.ellipse([c - R, c - R, c + R, c + R], outline=(46, 204, 113, 255), width=w)
    # purple arc = "excluded" split time, from -90° sweeping 125°
    d.arc([c - R, c - R, c + R, c + R], start=-90, end=35, fill=(124, 92, 255, 255), width=w)
    hw = s * 22 // 512
    d.line([c, c, c, c - s * 126 // 512], fill=(255, 255, 255, 255), width=hw)
    d.line([c, c, c + s * 94 // 512, c + s * 44 // 512], fill=(245, 166, 35, 255), width=hw)
    hub = s * 18 // 512
    d.ellipse([c - hub, c - hub, c + hub, c + hub], fill=(255, 255, 255, 255))
    im = im.resize((size, size), Image.LANCZOS)
    im.save(out)
    print("wrote", out)

base = sys.argv[1] if len(sys.argv) > 1 else "public"
icon(192, f"{base}/icon-192.png")
icon(512, f"{base}/icon-512.png")
