"""Generate the maskable app icon.

Android crops a maskable icon to whatever shape the launcher uses (circle, squircle, teardrop), so:
  * the background must be FULL-BLEED — no rounded corners, which would leave transparent notches;
  * the artwork must sit inside the central 80% safe zone.

The clock artwork is reused unchanged from icon.svg: ring r=170, stroke 28 -> outer radius 184,
against a safe radius of 0.8 * 256 = 204.8. It already fits, so nothing is scaled.

Drawn at 4x and downsampled for anti-aliasing (PIL's primitives are not anti-aliased).
"""
from PIL import Image, ImageDraw
import pathlib

# resolve against this file, so it runs from any cwd: web/tools/ -> web/public/
OUT = pathlib.Path(__file__).resolve().parents[1] / "public" / "icon-maskable-512.png"

S = 512
K = 4                      # supersample factor
W = S * K
BG = "#0f1420"
px = lambda v: int(round(v * K))

# RGBA with an opaque fill: colour type 6, so the full-bleed claim is checkable from the pixels
# (the contrast gate reads the corner alpha). Opaque everywhere is what a maskable icon needs.
img = Image.new("RGBA", (W, W), BG)
d = ImageDraw.Draw(img)
cx = cy = px(256)

def ring(radius, colour, width, start=None, end=None):
    box = [cx - px(radius), cy - px(radius), cx + px(radius), cy + px(radius)]
    w = px(width)
    if start is None:
        d.ellipse(box, outline=colour, width=w)
    else:
        d.arc(box, start, end, fill=colour, width=w)

def capsule(p0, p1, colour, width):
    d.line([p0, p1], fill=colour, width=px(width))
    r = px(width) / 2
    for (x, y) in (p0, p1):                      # round caps, as SVG stroke-linecap="round"
        d.ellipse([x - r, y - r, x + r, y + r], fill=colour)

R = 170
ring(R, "#2ecc71", 28)                            # full green ring
# purple overlay: dasharray 380 of circumference 2*pi*170 = 1068.14, rotated -90deg so it starts
# at 12 o'clock and sweeps clockwise. 380/1068.14*360 = 128.08deg. PIL angles: 0 = 3 o'clock,
# increasing clockwise, so 12 o'clock is 270.
sweep = 380.0 / (2 * 3.141592653589793 * R) * 360.0
ring(R, "#7c5cff", 28, 270, 270 + sweep)

capsule((cx, cy), (px(256), px(130)), "#ffffff", 22)
capsule((cx, cy), (px(350), px(300)), "#f5a623", 22)
r18 = px(18)
d.ellipse([cx - r18, cy - r18, cx + r18, cy + r18], fill="#ffffff")

img = img.resize((S, S), Image.Resampling.LANCZOS)
img.save(OUT, "PNG", optimize=True)
print(f"wrote {OUT.relative_to(OUT.parents[2])}  {S}x{S}  sweep={sweep:.2f}deg")
