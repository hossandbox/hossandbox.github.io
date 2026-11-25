# Clock 14 — UI design, workflow and creativity audit (Opus 5.5, 2026-11-25)

Tree: `~/hos-build/work-opusdesign` (copy of the live Clock 14 build). Method: fresh build, driven in
Chromium (Playwright) at 412×915 with touch emulation, night and day themes, a seeded 30-hour record
(On Duty, then Driving). Every screen was captured before and after: the Now page, the Log, the Plan
hub, More/Settings, the driving view, the status sheet and the Log editor, and all twelve Plan tools
plus My Week.
Screenshots: `~/hos-build/opusdesign-scratch/shots-before/`, `shots-a/` (night after), `shots-d/`
(day after).

The previous first-run UX audit (Split Decision era, 42 findings, mostly fixed by HANDOFF-AUDITFIX)
was moved to `AUDIT-FIRSTRUN-PRIOR.md`. Nothing in it was deleted.

Ratings: **F** = friction (slows or confuses the task) · **U** = ugliness (looks assembled, not
designed) · **M** = missed idea (conventional where a better idea exists). Each finding is marked
**fixed**, **partly fixed** or **open (why)**.

---

## §0. The cue system, derived from the logo

The logo (`logo-clock14-lorico-pick.jpg`) is a navy rounded square lit from the top. On it sit a
clock with a light-blue bezel ring, a silver inner rim, a royal-blue face, white hour ticks, a "14"
at about 2:05 and an **orange second hand**. A light-blue semi truck with speed streaks runs across
the bottom, and below it is a heavy white CLOCK 14 wordmark with an arrow through the O.
Sampled pixel colours are in brackets.

| Cue | From the logo | In the app (token / rule) |
|---|---|---|
| **Field** | navy square, brighter at the top (rgb 0,84,167 at the top to 1,16,78 at the bottom) | Night: page ground `--ground-hi #0d2a64` → `--ground-lo #050e26`; header, dock and tab bar `--chrome #06112e`; surfaces `--panel #0b1a3c`, `--panel2 #11244d`, wells `--screen #06122f`. Day: cool blue-white paper (`--panel #f8fbff`, ground `#edf2f9`→`#dbe4f0`) with **navy ink** `--text #071331` (the logo field becomes the type colour). |
| **Bezel** | clock ring and truck (rgb 92,200,230 / 144,228,252) | `--ring` = `--accent` **#5ccbea** (day #0b56c0). Rule: **every indicator is a ring.** That covers tool icons, the capstone icon, the selected meter, focus rings, the tab lamp and the dial's arc. |
| **Face** | royal-blue clock face (rgb 10,96,169) | `--accent-solid` **#1857c8** (day #0b56c0). Rule: one solid commit key per screen (`button.primary`), with a bezel-tinted edge. |
| **Hand** | the orange second hand (rgb 243,115,28) | `--hand` **#ff7a1f** (day #d4570a). Rule: **orange means NOW and nothing else.** It marks the dial's moving tip, the timeline's present edge and the live clock in the header. It is never a status, a warning or a button. Warnings stay amber `--warn #ffbd4a`, which is pushed a little further toward yellow so the two are never confused. |
| **Ticks** | white hour marks around the face | Rule: section labels (`.card > h2`, `.plan-section-head`) are led by a 3×12 px tick in `--ring`. The dial and graph scales stay ticked. |
| **Shapes** | the rounded-square tile, the circular dial | Rule: **containers are rounded squares** (cards r18, hero r26, capstone r22, the logo tile's proportion). **Indicators are circles** (icon bezels, LEDs, the hand dot, the dial). |
| **Type** | heavy, wide, tight wordmark; white | Atkinson Hyperlegible Next (kept on purpose: it is a low-vision face, and that matters more at 3 AM than matching the wordmark's geometry) at 800 weight with tight tracking for screen titles (`h1.screen-title` 27 px, −.01em). Small uppercase tracked labels only. Every clock and figure is in Atkinson Mono. |
| **Ink** | wordmark white-blue (rgb 214,231,241) | `--text #eef5fd`; muted `#a3b6d4` (cool, not the old warm beige `#aaa79d`, which clashed with navy). |
| **Motion** | speed streaks behind the truck | Not used as decoration. The existing motion system (sheets that morph from their opener, room cross-fades) already says "moving forward". Streaks on a driving screen would be a distraction. |

All 44 + 44 WCAG pairs in `test/contrast.mjs` pass in both themes (tightest pair: 1.16× the required
ratio in day, 1.34× in night). `test/nightlight.mjs` also passes: the light budget, ⚠/✕ graphic
contrast, and colour-vision separation of the four statuses under protan/deutan simulation.

**One conflict I could not resolve inside the hard lines:** the browser-chrome / splash colour
(`<meta theme-color>`, manifest `background_color` / `theme_color`) and `--bg` are pinned to the
old carbon **#090c10** by smoke (patch 16) and c3 M14a. So the phone's status bar and the install
splash stay near-black rather than logo navy. The app paints navy everywhere else (`--chrome` and the
ground), so on screen the seam is a near-black status bar above a navy header. It reads acceptably,
because the logo's own outer field is near-black navy (rgb 0,13,47). See the handoff for the
one-line pin change that would finish it.

Two smaller pinned holdovers work the same way:
- The two-way rockers keep their carbon slot (polish.mjs pins the literal RGB; see A5).
- The tab bar's text, muted and lamp colours are re-declared, on the bar only, to the old literal
  values that layout.mjs (e) pins.

Both are listed in the handoff (§5) with the pin re-aim that removes them.

---

## §1. Whole-app findings

**A1. The palette contradicted the logo — U — fixed.** The app was a carbon/charcoal "instrument
cluster" (`#090c10` / `#11161c`, warm beige muted text) with a sky-blue accent. The logo is navy and
royal blue with a light-blue bezel and an orange hand. With the logo on the home screen, opening the
app felt like a different product. The whole token set is now derived from the logo (§0), in both
themes, and the 280 ms theme cross-fade uses the same values (`@property` initial values updated).

**A2. Nothing in the UI echoed the brand mark — M — fixed.** There was no recurring motif. Now three
logo elements recur on every screen: the **ring** (indicators), the **tick** (section labels) and the
**hand** (now). They are applied as rules, not decoration, so a new screen inherits them for free.

**A3. "Now" had no consistent visual — M — fixed.** The dial's moving tip was white-blue, the
timeline had no present-moment mark, and the header clock was muted grey. All three are now the orange
hand, so the eye learns one thing: orange = this minute.

**A4. Header looked crowded and wrapped — U/F — fixed.** At 412 px the status pill wrapped to two lines
("On Duty ·" / "20m") because the theme key carried a word as well as an icon. The theme key is now
icon-only on phones (the word stays in the DOM and in `aria-label`, and shows from 440 px up), and
the pill holds one line from 380 px up. The live clock got the hand dot and full-strength ink, so it
reads as a clock, not a caption.

**A5. Black wells inside navy panels — U — fixed.** Inputs, toggles, the sheet's finger slot and the
switch wells used `--bg` (near-black), which looked like holes punched in the panel. Input fields,
the switch wells and the finger slot now use `--screen` (deep navy), the same recessed tone as the log
screen and the meters. **Exception:** the two-way rockers (`.toggle`: Day|Night, Timeline|Dial,
70/60) keep their carbon slot (chosen key `#19212a` on a `#090c10` track). polish.mjs pins those
exact night RGB values, and quickfix pins the day key against `--bg`. They read as a physical rocker
switch set into the navy panel, which is acceptable, but it is the one place the old palette shows.

**A6. Copy tone of tool names is inconsistent — U — open (pinned).** Four tools use sentence case
("Plan a sleeper split", "Can I take this load?"). Eight use Title Case or marketing voice ("Do I Make
It Back or Motel?", "Can I Legally Use It?", "Miles Left in My 70", "Flip My Clock"). One voice would
help. Recommendation: sentence case throughout ("Make it back, or motel?", "Can I legally use it?",
"Miles left in my 70", "Flip my clock"). **Not done:** the exact titles are pinned verbatim by
revisions W1/R1, legal/flip/miles/motel/rescue pins and the tool `<h1>` checks.

**A7. Mono used for sentences in the newer tools — U — open (scope).** The newer tools (Stack, Motel,
Miles, My Week) set whole verdict sentences and labels in Atkinson Mono, e.g. "−2,071 max legal miles
(no 34)". The original four tools keep Mono for figures only. Mono is right for clocks and for the
copy-to-dispatch text blocks, but wrong for prose. Fixing it means editing class lists inside ~3,000
lines of tool markup, and each changed tool's pins would need re-checking. I left it as the top item
for a follow-up typography pass.

**A8. Status colours vs the logo — note, deliberately kept.** OFF grey, SB violet, D green and ON
amber are not logo colours, and they shouldn't be: they are the ELD's duty-status language, which
drivers read across every log they have ever kept. They are also protan/deutan-separated and gated
by nightlight.mjs. The logo governs the field, chrome and indicators; the status colours stay a
separate, functional channel. (The lit On Duty key is a flood of amber. That is loud, but it is pinned
by reimagine — "ink on its face" — and it does make the current status impossible to miss.)

---

## §2. Now

Task: *"How long can I drive, and when must I stop?"* — answered in **0 taps**; *"I'm changing
status"* — **1 tap** on the dock.

**N1. The answer card is strong — no change.** The dial plus a large "3h 20m", "STOP BY 05:03" as its
own readout, and "limited by 11-hour" as a plate below. A tired driver gets the answer from across the
cab. The redesign only re-skins it: a royal-blue glow at the centre of the hero (the clock face), a
bezel-blue arc, and the orange hand at the tip.

**N2. Four gauges below the hero repeat what the hero says — F (mild) — open (pinned).** 11-hr
Driving "3h 20m left" duplicates the hero's figure, so a full screen-height is spent before the Log
graph. reimagine.mjs pins "clocks sit directly under the answer card". I would collapse the cluster to
the three *other* limits, but that is a layout pin, so it stays.

**N3. The read-aloud question pops over the first non-Driving status tap — F — open (behaviour).** The
modal appears the moment the driver taps Off Duty and covers the "Off Duty since 01:43 · Undo" chip,
which is the 8-second safety net for that tap. It is deliberate (C1 taste note) and not a style
issue. Recommendation: ask after the undo window closes, or ask on the next visit to Now.

**N4. "PC, yard move, or started earlier…" — F (mild) — kept.** It is the door to the less common
statuses, and it sits right under the thumb. It works. The ellipsis copy is long, but it says exactly
what is behind it.

## §3. Driving view

**D1. Right decision, right weight — no structural change.** One number, a stop time, and a 112 px
"I've stopped" key. It now sits on the same navy field as the rest of the app (it used to be carbon),
and the dial tip is the orange hand. Nothing else belongs on this screen.

## §4. Log

Task: *"Fix or add an entry"* — the Log is **1 tap** away, an entry is **1 tap** to edit, and "Add a
break or something I forgot" is a pinned bottom key (1 tap → 4-step sheet).

**L1. Section labels looked like loose captions — U — fixed.** "ENTRIES ON THIS DAY (2)" and
"VIOLATIONS IN YOUR LOG" now carry the tick, so they read as the gauge face's hour marks: one system
across Now, Log, More and every tool card.

**L2. The day graph is good — no change.** It is a recessed log screen with stair steps and hour
labels. Its wells re-tone to navy automatically.

## §5. Plan hub

Task: *"Find the right tool"*. Before: 3 screens of scroll for 13 rows. After: the capstone plus all
12 tools fit in about 1.6 screens.

**P1. A list of thirteen identical rows — U/F — fixed.** Twelve 84 px rows with long two-line
subtitles meant the last four tools (Motel, Legal, Flip, Miles) were three thumb-flicks down, and
every row looked the same. The tools are now a **two-column rack of tiles**:
- a bezel-ring icon on top (the logo's dial);
- the title in 16 px/800;
- the subtitle clamped to three lines (the full text stays in the DOM for screen readers and pins).

The chevron is gone, because the whole tile is the door. DOM order is unchanged (it is pinned and is
the reading order).

**P2. My Week (the capstone) didn't look like the capstone — U — fixed.** It was a box with a thick
accent left-border, the same idiom as a warning callout. It is now the "clock" of the Plan screen: a
uniform 2 px bezel ring, a faint outer halo, a royal-blue face glow from the top-right and a 56 px
ringed icon. The verdict tones (good/warn/bad) still recolour the ring.

**P3. Grouping by time horizon — M — open (pinned).** The best structure for 12 tools is by the
driver's question:
- **Right now:** Can I legally use it?, Split-sleeper rescue, Make it back or motel?
- **This load:** Can I take this load?, When to roll & PTA, Plan a run, Stack my stops
- **This shift:** Plan a sleeper split, Flip my clock
- **This week:** Hours coming back, Weekly recap vs 34, Miles left in my 70

I didn't build it, because the DOM order of the twelve `.plan-item`s is pinned by index (revisions
W1/R1, polish.mjs `nth(i)`, `planPg[4]`/`[5]` clicks). Faking the groups with CSS `order` would break
reading/focus order, which is worse than no grouping. The heading "The toolbox" replaces "Single-load
& shift tools", which was no longer true (8 of the 12 are multi-load or week tools). See the handoff
for the pin edits that would unlock P3.

## §6. Plan tools (12) + My Week

**T1. Two generations of tool design — U — partly fixed.** The four founding tools (Load, Split, Trip,
Recap) have no screen title, or a flow header ("Can I take this load?" with a step bar). The eight
newer tools have "‹ Plan" + a 27 px title + a muted subtitle + a verdict banner. The newer pattern is
better: verdict first, then evidence. The shared re-skin makes them read as one family: the same
chrome, ticks, rings, commit key and wells. Adding `<h1>` titles to Split and Trip is the next
step. I left it out of this pass because those two screens carry the most layout pins (Split's sticky
now/after strip, Trip's three-way itinerary). Each would need its own browser-lane run, and I chose to
spend the session on the system-wide changes instead.

**T2. Verdict banners are the app's best idea — no change.** BREAKS AT STOP 2 / NO RESCUE / MOTEL /
TIGHT CYCLE, shaped like road signs (⚠ / ✕ / ✓ glyphs, not colour alone). They inherit the new
palette.

**T3. Copy-to-dispatch blocks — kept.** The Mono pre-formatted text is right here: it is what lands
in a dispatcher's message.

**T4. Can I take this load? — the 4-step flow with one question per screen is the gold standard for
3 AM — no change.** The +/−50 steppers and the 250…900 chips are thumb-sized. The "Next: when you
leave" commit key now uses the face (royal) colour with a bezel edge.

**T5. Can I Legally Use It? — M (open).** Five exception rows, each an 84 px card with a CFR cite. A
driver who already knows which exception they want hunts by reading. Recommendation: a one-line
"What happened?" chip row above the list (Weather / Personal use / Yard / Big day / Safe haven). That
would be a new control on a tool, so it is out of scope for a glass-only pass.

## §7. More / Settings

**S1. Reached by the gear in the header — 1 tap — fine.** The back key names where you came from
("‹ Plan", "‹ Now"). Sections (Rules / Planning / Screen / Driving alerts / …) now carry the tick.

**S2. Screen theme exists twice (the header key and More → Screen) — F (none) — kept.** The header
key is the 3 AM path, and More is where a setting lives. Both are correct.

## §8. Home-screen icon (Lorico's catch, Nov 25)

**I1. The emblem read off-centre in the circular mask — U — fixed.** Measured cause:
- The old icons were square crops of the logo that kept the rounded-square **bevel along the top
  edge**.
- The clock ring's centre sat about 34 px (of 512) **below** the canvas centre.
- The truck pushed the mass further down and right.

In a circle mask that reads as "sliding off to the lower right".

New icons are generated from the master by `web/tools/make-logo-icons.sh`:
1. The emblem is cut out: clock disc plus truck silhouette, no wordmark, no bevel.
2. Its **optical** centre goes on the canvas centre. That is logo pixel (518,435), between the ring
   centre (512,438) and the bright-pixel centroid (532,427), because the truck carries weight to the
   right.
3. It is placed on a clean navy radial field taken from the logo's square.

Results:
- **Maskable:** emblem at 0.58×, so the ring sits inside Android's 40% safe circle.
- **Any-purpose (192/512):** emblem at 0.66× for iOS's rounded square.

All three are 8-bit opaque RGB, and the contrast gate's full-bleed corner check passes. Previews are
in circle and rounded-square masks at `~/hos-build/opusdesign-scratch/icon/preview.png`.

---

## Summary table

| # | Screen | Rating | Status |
|---|---|---|---|
| A1 | all | U | fixed: logo palette, both themes |
| A2 | all | M | fixed: ring / tick / hand rules |
| A3 | Now, Driving, header | M | fixed: orange = now |
| A4 | header | U/F | fixed: one-line pill, icon theme key |
| A5 | all forms | U | fixed: navy wells (rockers excepted, pinned) |
| A6 | Plan, tools | U | open: titles pinned verbatim |
| A7 | newer tools | U | open: Mono for prose, follow-up pass |
| N2 | Now | F | open: layout pinned |
| N3 | Now | F | open: behaviour, not glass |
| P1 | Plan | U/F | fixed: two-column rack, 3 → ~1.6 screens |
| P2 | Plan | U | fixed: capstone as the bezel |
| P3 | Plan | M | open: grouping blocked by index pins |
| T1 | tools | U | partly fixed: one family by skin; headers not unified |
| T5 | Legal | M | open: new control, out of scope |
| I1 | icon | U | fixed: optically centred, regenerated |
