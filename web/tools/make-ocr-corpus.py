#!/usr/bin/env python3
"""Synthetic ELD clocks screens for Patch 12's OCR corpus (web/test/ocr-corpus/).

No real ELD screenshots are available to this project, so the corpus is
rendered: ten screens in plausible ELD styles — two-column rows, labels
stacked above values, a 2x2 card grid, "7h 15m" unit shapes, a cluttered
screen with decoys (a clock-of-day, and an info line that merely contains a
label word: "Shift started 06:00"), a low-contrast screen, a slightly rotated
screen, a small-text screen whose values sit exactly on the field maxima,
a screen whose labels carry their clocks' limits as clock-shaped tokens
("Cycle (70h) Left"), and one whose header names a clock ("Last break
06:00") above the real rows (the last two are checkpoint 1's D1/D2 shapes).
Checkpoint 2 added three more: two screens whose limit-carrying row has its
value cropped at the image's right edge, so nothing of the value survives
but its label's limit token (D4), and a screen whose "Last break 06:00"
header is the ONLY break text on it — no real row beneath (D5).
Checkpoint 3 added three more: the lone header in its natural wording,
"Last 30-min break 06:00" (D7 — a word between the marker and the label
word defeated checkpoint 2's immediate-predecessor test), and a
"Clock | Limit | Remaining" table in two variants, whole and cropped
through the Remaining column (D6 — the limits sit in their own column, at
value-column distance from the labels, where no closeness rule can tell
them from values; the D6b policy, not geometry, is what keeps them out).

These images prove the reader + extractor behave on RENDERED text in these
layouts. They do not prove accuracy on photographs of real ELD screens —
glare, moiré, vendor fonts and camera blur are a field check, like the Pixel
checks trailing the other patches. See HANDOFF-12.md.

Regenerate (deterministic for a given Pillow version):
    python3 tools/make-ocr-corpus.py
Writes the PNGs plus manifest.json (the expected extraction per image) into
web/test/ocr-corpus/. Run the corpus with:
    node tools/ocr-corpus-run.mjs [best|best_int]
"""
import json
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "test", "ocr-corpus")
os.makedirs(OUT, exist_ok=True)

DEJAVU = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
DEJAVU_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
LIB = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
LIB_B = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
if not os.path.exists(LIB_B):
    LIB_B = DEJAVU_B

DARK = (16, 18, 22)
LABEL_D = (210, 215, 220)
WHITE = (255, 255, 255)
AMBER = (255, 200, 60)

manifest = {}


def rows_screen(name, values, *, value_texts=None, size=(900, 620), bg=DARK,
                label_fill=LABEL_D, value_fill=WHITE, label_font=DEJAVU,
                value_font=DEJAVU_B, label_size=40, value_size=64,
                title="ELD CLOCKS", rotate=0):
    img = Image.new("RGB", size, bg)
    d = ImageDraw.Draw(img)
    lf = ImageFont.truetype(label_font, label_size)
    vf = ImageFont.truetype(value_font, value_size)
    if title:
        d.text((40, 30), title, font=ImageFont.truetype(DEJAVU_B, 44), fill=AMBER)
    labels = ["Drive Time Left", "Shift Time Left", "Break Due In", "Cycle Time Left"]
    y = 140
    for i, (lab, val) in enumerate(zip(labels, values)):
        d.text((40, y + 10), lab, font=lf, fill=label_fill)
        d.text((620, y), value_texts[i] if value_texts else val, font=vf, fill=value_fill)
        y += 125
    if rotate:
        img = img.rotate(rotate, resample=Image.BICUBIC, expand=True, fillcolor=bg)
    img.save(os.path.join(OUT, name))
    manifest[name] = {"filled": {
        "driveLeft": values[0], "windowLeft": values[1],
        "breakDueIn": values[2], "cycleLeft": values[3]}}


# 1 — the clean dark screen (the probe layout, DejaVu)
rows_screen("clean-dark.png", [435, 580, 330, 3720],
            value_texts=["7:15", "9:40", "5:30", "62:00"])

# 8 (rendered here, numbered in the runner's order) — small text, all values
# exactly on their field maxima: a value equal to the max must still fill.
rows_screen("small-text.png", [660, 840, 480, 4200],
            value_texts=["11:00", "14:00", "8:00", "70:00"],
            label_size=20, value_size=32, title=None, size=(800, 560))

# 7 — the clean screen, rotated two degrees like a quick phone photo
rows_screen("rotated.png", [435, 580, 330, 3720],
            value_texts=["7:15", "9:40", "5:30", "62:00"], rotate=2)

# 6 — low contrast: grey on grey; reads may blank, they must not go wrong
rows_screen("low-contrast.png", [435, 580, 330, 3720],
            value_texts=["7:15", "9:40", "5:30", "62:00"],
            bg=(96, 96, 96), label_fill=(148, 148, 148), value_fill=(170, 170, 170),
            title=None)

# 4 — unit shapes instead of colons
rows_screen("hm-style.png", [435, 580, 330, 3720],
            value_texts=["7h 15m", "9h 40m", "5h 30m", "62h 00m"], value_size=56)

# 2 — clean light screen, labels stacked above values (Liberation)
img = Image.new("RGB", (900, 640), (238, 240, 242))
d = ImageDraw.Draw(img)
lf = ImageFont.truetype(LIB, 30)
vf = ImageFont.truetype(LIB_B, 56)
blocks = [("Drive Time Left", "6:05", 365), ("Shift Time Left", "8:20", 500),
          ("Break Due In", "3:45", 225), ("Cycle Time Left", "41:30", 2490)]
y = 30
for lab, txt, _mins in blocks:
    d.text((40, y), lab, font=lf, fill=(60, 64, 70))
    d.text((40, y + 42), txt, font=vf, fill=(20, 22, 26))
    y += 140
img.save(os.path.join(OUT, "clean-light.png"))
manifest["clean-light.png"] = {"filled": {
    "driveLeft": 365, "windowLeft": 500, "breakDueIn": 225, "cycleLeft": 2490}}

# 3 — 2x2 card grid, small caps labels above big values
img = Image.new("RGB", (1000, 700), (22, 24, 28))
d = ImageDraw.Draw(img)
lf = ImageFont.truetype(DEJAVU, 26)
vf = ImageFont.truetype(DEJAVU_B, 84)
cards = [((30, 30), "DRIVE TIME LEFT", "10:58", 658),
         ((515, 30), "SHIFT TIME LEFT", "13:12", 792),
         ((30, 360), "BREAK DUE IN", "7:59", 479),
         ((515, 360), "CYCLE TIME LEFT", "69:44", 4184)]
for (cx, cy), lab, txt, _mins in cards:
    d.rounded_rectangle([cx, cy, cx + 455, cy + 300], radius=18, fill=(34, 38, 44))
    d.text((cx + 28, cy + 26), lab, font=lf, fill=(170, 178, 186))
    d.text((cx + 28, cy + 84), txt, font=vf, fill=WHITE)
img.save(os.path.join(OUT, "grid-2x2.png"))
manifest["grid-2x2.png"] = {"filled": {
    "driveLeft": 658, "windowLeft": 792, "breakDueIn": 479, "cycleLeft": 4184}}

# 5 — cluttered: header identity, a clock-of-day decoy, the "Shift started"
# info-line trap, footer numbers. Decoys must stay unplaced.
img = Image.new("RGB", (1000, 780), DARK)
d = ImageDraw.Draw(img)
hf = ImageFont.truetype(DEJAVU, 28)
tf = ImageFont.truetype(DEJAVU_B, 40)
lf = ImageFont.truetype(DEJAVU, 36)
vf = ImageFont.truetype(DEJAVU_B, 58)
d.text((40, 26), "J. DRIVER", font=hf, fill=LABEL_D)
d.text((40, 62), "TRUCK 4521", font=hf, fill=LABEL_D)
d.text((800, 30), "08:42", font=tf, fill=AMBER)
d.text((40, 108), "Friday, Nov 7, 2026", font=hf, fill=LABEL_D)
d.text((40, 152), "Shift started 06:00", font=hf, fill=LABEL_D)
rows = [("Drive Time Left", "4:22"), ("Shift Time Left", "6:03"),
        ("Break Due In", "2:17"), ("Cycle Time Left", "28:51")]
y = 230
for lab, txt in rows:
    d.text((40, y + 8), lab, font=lf, fill=LABEL_D)
    d.text((640, y), txt, font=vf, fill=WHITE)
    y += 118
d.text((40, 726), "DOT 1234567 - MC 789012", font=hf, fill=(140, 146, 152))
img.save(os.path.join(OUT, "cluttered.png"))
manifest["cluttered.png"] = {
    "filled": {"driveLeft": 262, "windowLeft": 363, "breakDueIn": 137, "cycleLeft": 1731},
    # The "Shift started 06:00" time (360) is read cleanly and must stay
    # unplaced. The header clock-of-day (08:42) is NOT listed: the reader
    # garbles the amber digits into a non-time word, so it never becomes a
    # candidate at all — checked by eye in the run log, not by assertion.
    "unplacedIncludes": [360]}

# 9 — limits printed inside the labels (checkpoint 1, D1): each label carries
# its clock's statutory limit as a clock-shaped token — "Cycle (70h) Left" —
# and the token sits nearer the label than the row's real value does. The
# limit must never take the box: every clock on this screen stays BLANK, and
# both numbers are reported. Any fill at all is a wrong read.
img = Image.new("RGB", (900, 620), DARK)
d = ImageDraw.Draw(img)
lf = ImageFont.truetype(DEJAVU, 40)
vf = ImageFont.truetype(DEJAVU_B, 64)
d.text((40, 30), "ELD CLOCKS", font=ImageFont.truetype(DEJAVU_B, 44), fill=AMBER)
limit_rows = [("Drive (11h) Left", "4:22", 660, 262), ("Shift (14h) Left", "6:03", 840, 363),
              ("Break (8h) Left", "2:17", 480, 137), ("Cycle (70h) Left", "28:51", 4200, 1731)]
y = 140
for lab, txt, _lim, _mins in limit_rows:
    d.text((40, y + 10), lab, font=lf, fill=LABEL_D)
    d.text((620, y), txt, font=vf, fill=WHITE)
    y += 125
img.save(os.path.join(OUT, "limit-labels.png"))
manifest["limit-labels.png"] = {
    "filled": {},
    # The limits and the true values alike are read and reported, never used.
    "unplacedIncludes": [660, 262, 840, 363, 480, 137, 4200, 1731]}

# 10 — an info line naming a clock, above the real rows (checkpoint 1, D2):
# "Last break 06:00" claims the break clock from the header, against the real
# "Break Due In 2:17" row. Two different values claim one clock, so the break
# box stays BLANK and both are reported; the other three rows read normally.
img = Image.new("RGB", (1000, 780), DARK)
d = ImageDraw.Draw(img)
hf = ImageFont.truetype(DEJAVU, 28)
lf = ImageFont.truetype(DEJAVU, 36)
vf = ImageFont.truetype(DEJAVU_B, 58)
d.text((40, 152), "Last break 06:00", font=hf, fill=LABEL_D)
rows = [("Drive Time Left", "4:22"), ("Shift Time Left", "6:03"),
        ("Break Due In", "2:17"), ("Cycle Time Left", "28:51")]
y = 230
for lab, txt in rows:
    d.text((40, y + 8), lab, font=lf, fill=LABEL_D)
    d.text((640, y), txt, font=vf, fill=WHITE)
    y += 118
img.save(os.path.join(OUT, "last-break-header.png"))
manifest["last-break-header.png"] = {
    "filled": {"driveLeft": 262, "windowLeft": 363, "cycleLeft": 1731},
    "unplacedIncludes": [360, 137]}

# 11 — a value cropped at the screenshot's right edge (checkpoint 2, D4):
# the cycle row's value is drawn starting at x=800 on a 900-wide canvas, so
# the image cuts it mid-digits and no readable value survives — only the
# label's own limit token, "(70h)". With the real value unread, that token
# was left as the cycle's only claimant and filled the box with 70:00.
# Ground truth: cycleLeft does NOT fill at all; the untouched rows read
# normally (their labels are plain, so no contest).
def cropped(name, rows):  # rows: (label, value, value_x)
    img = Image.new("RGB", (900, 620), DARK)
    d = ImageDraw.Draw(img)
    lf = ImageFont.truetype(DEJAVU, 40)
    vf = ImageFont.truetype(DEJAVU_B, 64)
    d.text((40, 30), "ELD CLOCKS", font=ImageFont.truetype(DEJAVU_B, 44), fill=AMBER)
    y = 140
    for lab, txt, vx in rows:
        d.text((40, y + 10), lab, font=lf, fill=LABEL_D)
        d.text((vx, y), txt, font=vf, fill=WHITE)
        y += 125
    img.save(os.path.join(OUT, name))

cropped("cropped-cycle.png", [("Drive Time Left", "4:22", 620),
                              ("Shift Time Left", "6:03", 620),
                              ("Break Due In", "2:17", 620),
                              ("Cycle (70h) Left", "28:51", 800)])
manifest["cropped-cycle.png"] = {
    "filled": {"driveLeft": 262, "windowLeft": 363, "breakDueIn": 137},
    "unplacedIncludes": [4200]}

# 12 — the same crop on the drive row: "(11h)" in the label, "4:22" cut at
# the edge. Ground truth: driveLeft does NOT fill with its 11:00 limit.
cropped("cropped-drive.png", [("Drive (11h) Left", "4:22", 820),
                              ("Shift Time Left", "6:03", 620),
                              ("Break Due In", "2:17", 620),
                              ("Cycle Time Left", "28:51", 620)])
manifest["cropped-drive.png"] = {
    "filled": {"windowLeft": 363, "breakDueIn": 137, "cycleLeft": 1731},
    "unplacedIncludes": [660]}

# 13 — a LONE "Last break 06:00" header (checkpoint 2, D5): the header is
# the only break text on the screen — there is no "Break Due In" row for it
# to contest. Round 1 blanked the header only when a real row existed;
# alone, its time of day filled the break box. Ground truth: breakDueIn
# does NOT fill; 06:00 is reported among the unplaced numbers, and the
# three real rows read normally.
img = Image.new("RGB", (1000, 780), DARK)
d = ImageDraw.Draw(img)
hf = ImageFont.truetype(DEJAVU, 28)
lf = ImageFont.truetype(DEJAVU, 36)
vf = ImageFont.truetype(DEJAVU_B, 58)
d.text((40, 152), "Last break 06:00", font=hf, fill=LABEL_D)
rows = [("Drive Time Left", "4:22"), ("Shift Time Left", "6:03"),
        ("Cycle Time Left", "28:51")]
y = 230
for lab, txt in rows:
    d.text((40, y + 8), lab, font=lf, fill=LABEL_D)
    d.text((640, y), txt, font=vf, fill=WHITE)
    y += 118
img.save(os.path.join(OUT, "lone-last-break.png"))
manifest["lone-last-break.png"] = {
    "filled": {"driveLeft": 262, "windowLeft": 363, "cycleLeft": 1731},
    "unplacedIncludes": [360]}

# 14 — the lone header in its natural wording (checkpoint 3, D7): "Last
# 30-min break 06:00" — the wording a US ELD uses for the §395.3(a)(3)(ii)
# break, with a word standing between the marker and the label word. Same
# ground truth as screen 13: the break box does NOT fill, 06:00 is only
# reported, and the three real rows read normally.
img = Image.new("RGB", (1000, 780), DARK)
d = ImageDraw.Draw(img)
hf = ImageFont.truetype(DEJAVU, 28)
lf = ImageFont.truetype(DEJAVU, 36)
vf = ImageFont.truetype(DEJAVU_B, 58)
d.text((40, 152), "Last 30-min break 06:00", font=hf, fill=LABEL_D)
rows = [("Drive Time Left", "4:22"), ("Shift Time Left", "6:03"),
        ("Cycle Time Left", "28:51")]
y = 230
for lab, txt in rows:
    d.text((40, y + 8), lab, font=lf, fill=LABEL_D)
    d.text((640, y), txt, font=vf, fill=WHITE)
    y += 118
img.save(os.path.join(OUT, "last-30min-header.png"))
manifest["last-30min-header.png"] = {
    "filled": {"driveLeft": 262, "windowLeft": 363, "cycleLeft": 1731},
    "unplacedIncludes": [360]}


# 15/16 — a "Clock | Limit | Remaining" table (checkpoint 3, D6): each
# row's limit stands in its OWN column as a bare-hours token ("11h",
# "70h"), at value-column distance from the label — the geometry that no
# closeness rule can separate from a value column. Whole, every row stays
# BLANK: the limit claims its label but by policy can never fill, and it
# blocks its row's real value from claiming the label, so the two numbers
# are only reported. Cropped through the Remaining column, the values are
# gone and the limits are the only reads left; they still fill nothing.
def limit_table(name, crop_x=None):
    img = Image.new("RGB", (1000, 600), DARK)
    d = ImageDraw.Draw(img)
    hf = ImageFont.truetype(DEJAVU, 26)
    lf = ImageFont.truetype(DEJAVU, 36)
    vf = ImageFont.truetype(DEJAVU_B, 58)
    d.text((40, 40), "Clock", font=hf, fill=(150, 150, 160))
    d.text((420, 40), "Limit", font=hf, fill=(150, 150, 160))
    d.text((700, 40), "Remaining", font=hf, fill=(150, 150, 160))
    y = 110
    for lab, lim, val in [("Drive", "11h", "4:22"), ("Shift", "14h", "6:03"),
                          ("Break", "8h", "2:17"), ("Cycle", "70h", "28:51")]:
        d.text((40, y + 8), lab, font=lf, fill=LABEL_D)
        d.text((420, y + 8), lim, font=lf, fill=(170, 170, 180))
        d.text((700, y), val, font=vf, fill=WHITE)
        y += 110
    if crop_x:
        img = img.crop((0, 0, crop_x, 600))
    img.save(os.path.join(OUT, name))


limit_table("limit-table.png")
manifest["limit-table.png"] = {
    "filled": {},
    # Both numbers on every row are read and reported, never used. The
    # drive row's limit (660) is NOT listed: the reader drops the small
    # "11h" at the confidence floor in this layout (it is still a word on
    # the row, so it still blocks the value's claim) — seen in the run
    # log, not asserted.
    "unplacedIncludes": [262, 363, 137, 1731, 840, 480, 4200]}

limit_table("limit-table-crop.png", crop_x=760)
manifest["limit-table-crop.png"] = {
    "filled": {},
    "unplacedIncludes": [840, 480, 4200]}

# 17 — a 2x2 tile dashboard whose break tile's title WRAPS (checkpoint 4,
# D9): "PREVIOUS" on one line, "BREAK" on the next, the tile's time below.
# The title is an info line — when the previous break was — so its 06:00
# must not fill the break box; the other three tiles read normally. The
# geometry is the verifier's measured one: fragment and label share a
# left edge, the fragment ends right of the label's right edge, and the
# value sits a full value-row below the label.
img = Image.new("RGB", (1000, 700), DARK)
d = ImageDraw.Draw(img)
tf = ImageFont.truetype(DEJAVU, 40)
vf = ImageFont.truetype(DEJAVU_B, 64)
for (x, y) in [(40, 40), (520, 40), (40, 340), (520, 340)]:
    d.rounded_rectangle([x, y, x + 420, y + 280], radius=24, outline=(120, 120, 120), width=3)
d.text((57, 60), "DRIVE", font=tf, fill=LABEL_D)
d.text((57, 118), "4:22", font=vf, fill=WHITE)
d.text((537, 60), "SHIFT", font=tf, fill=LABEL_D)
d.text((537, 118), "6:03", font=vf, fill=WHITE)
d.text((57, 355), "PREVIOUS", font=tf, fill=LABEL_D)
d.text((57, 399), "BREAK", font=tf, fill=LABEL_D)
d.text((58, 477), "06:00", font=vf, fill=WHITE)
d.text((537, 360), "CYCLE", font=tf, fill=LABEL_D)
d.text((537, 418), "28:51", font=vf, fill=WHITE)
img.save(os.path.join(OUT, "wrapped-tiles.png"))
manifest["wrapped-tiles.png"] = {
    "filled": {"driveLeft": 262, "windowLeft": 363, "cycleLeft": 1731},
    "unplacedIncludes": [360]}

# 18 — the colon-format limit table WITH its header row (checkpoint 4,
# D10, the cheap partial): the limits written as full clocks in the
# "Limit" column, cropped through the Remaining column so the limit
# column is the only read left. The header heads the column, so nothing
# fills and the refused limits are only reported. The same table WITHOUT
# the header row is the documented residual — indistinguishable from a
# lone full clock, which must fill (pin (p)).
img = Image.new("RGB", (1000, 600), DARK)
d = ImageDraw.Draw(img)
hf = ImageFont.truetype(DEJAVU, 26)
lf = ImageFont.truetype(DEJAVU, 36)
d.text((40, 40), "Clock", font=hf, fill=(150, 150, 160))
d.text((420, 40), "Limit", font=hf, fill=(150, 150, 160))
d.text((700, 40), "Remaining", font=hf, fill=(150, 150, 160))
y = 110
for lab, lim in [("Drive", "11:00"), ("Shift", "14:00"),
                 ("Break", "8:00"), ("Cycle", "70:00")]:
    d.text((40, y + 8), lab, font=lf, fill=LABEL_D)
    d.text((420, y + 8), lim, font=lf, fill=(170, 170, 180))
    y += 110
img = img.crop((0, 0, 680, 600))
img.save(os.path.join(OUT, "colon-limit-header.png"))
manifest["colon-limit-header.png"] = {
    "filled": {},
    "unplacedIncludes": [660, 840, 480, 4200]}

with open(os.path.join(OUT, "manifest.json"), "w") as f:
    json.dump(manifest, f, indent=2, sort_keys=True)
print("wrote", len(manifest), "corpus images to", os.path.normpath(OUT))
