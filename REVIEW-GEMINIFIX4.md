VERDICT: SHIP

# REVIEW — Clock 14 geminifix4 (micro fix for the REVIEW-GEMINIFIX3 341–359px Timeline band)

Probes live in `/tmp/gf4/`. The tree was not modified. All runs used rsync copies:
- `fx` = geminifix4.
- `fb` = geminifix4 with the geminifix3 `public/` + `dist/styles.css` swapped in (fail-before).
- `g3` = geminifix3.

The browser lanes ran with `HOS_PLAYWRIGHT=~/.hermes/hermes-agent/` and `HOS_BROWSER=~/.cache/ms-playwright/chromium_headless_shell-1234/.../chrome-headless-shell`, the same browser as my geminifix3 review, so the numbers can be compared directly with REVIEW-GEMINIFIX3. `legeom4.mjs` is the geminifix4 lebrowser plus 359 and 341 in the loop and a per-case GEOM dump line. That is the only difference.

## Per-item

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Change is exactly as specified | **CONFIRMED** | **styles.css:** `diff work-geminifix3/web/public/styles.css work-geminifix4/...` is a single hunk, `1098c1098`: `@media (max-width: 340px) {` → `@media (max-width: 359px) {`. Line 1098 is the media query inside the appended Timeline override block (1090–1102), and the block body is unchanged. `dist/styles.css` is byte-identical to `public/styles.css`. **lebrowser.mjs** has two hunks: the header comment at line 9 now lists the new widths, and the loop at line 92 adds `[350, 640], [344, 882]`. Nothing else changed. |
| 2 | Geometry 320–412, both themes | **CONFIRMED** | `/tmp/gf4/le-fx.log`: lebrowser gives **252 pass / 0 fail, LOGEDIT BROWSER OK** (6 widths × 42). `/tmp/gf4/geom-fx.log`: legeom4 at 8 widths gives **336/0 OK**. minClear is the same in day/night and OFF/ON at each width, and there are zero overlaps. The table follows. |
| 3 | Fail-before | **CONFIRMED** | The geminifix4 lebrowser run against geminifix3 CSS (`/tmp/gf4/le-fb.log`) gives **244 pass / 8 fail, LOGEDIT BROWSER FAIL**. The 8 failures are exactly `item 6: neighbouring hour labels keep >= 4px clear` at 350×640 (2.78px) and 344×882 (1.31px), in day/night × OFF/ON. 412, 360, 340 and 320 pass, as expected. legeom4 on geminifix3 (`geom-g3.log`) gives 324/12 FAIL: 341 → 0.61px, 344 → 1.34px, 350 → 2.81px, 359 → 5.02px (passes). This reproduces the gap I reported, so the new loop entries now catch it. |
| 4 | Invariants / scope | **CONFIRMED** | **Engine:** the aggregate sha256 (`find engine -type f \| sort \| xargs sha256sum \| sha256sum`) is `0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d` in both trees. **Scope:** `diff -rq` vs geminifix3, excluding node_modules, lists exactly 5 files: `public/styles.css`, `test/dom/lebrowser.mjs`, `dist/styles.css`, `dist/app.js` and `dist/sw.js`. The `sw.js` diff is only the build stamp (`05:38` → `07:07`). `web/src` is identical (`diff -rq` clean), including `store.ts` (cmp equal), so the N1 storage fix and the other geminifix2/3 fixes are untouched. **Storage keys** in src: `hos-sandbox-v1`, `-v1-backup`, `-v1-sim`, `hos-sandbox-undo-v1`, unchanged. **Smoke** on the `fx` copy: `TZ=UTC npm run smoke` exit 0 and `TZ=America/Chicago npm run smoke` exit 0. Every DOM suite is green: no fail lines besides `0 fail` counters and an R7 test title, and myweek is 19/19. |

### Geometry (geminifix4, legeom4, all 4 theme×status cases identical per width)

| viewport | `.taxis` columns | track | minClear | cycle value | vs geminifix3 |
|---|---|---:|---:|---|---|
| 412×915 | `88px 141px 109px` | 139 | 17.8 | nowrap, h16 (1 line) | identical cols/nowrap/h16 |
| 360×640 | `88px 89px 109px` | 87 | 5.2 | nowrap, h16 (1 line) | identical cols/nowrap/h16 |
| 359×640 | `64px 153.5px 67.5px` | 151.5 | 20.9 | normal, h32 (2 lines) | was 5.0 |
| 350×640 | `64px 144.5px 67.5px` | 142.5 | 18.7 | normal, h32 | was 2.8 ❌ |
| 344×882 | `64px 138.5px 67.5px` | 136.5 | 17.2 | normal, h32 | was 1.3 ❌ |
| 341×640 | `64px 135.5px 67.5px` | 133.5 | 16.5 | normal, h32 | was 0.6 ❌ |
| 340×640 | `64px 134.5px 67.5px` | 132.5 | 16.3 | normal, h32 | unchanged |
| 320×568 | `64px 114.5px 67.5px` | 112.5 | 11.4 | normal, h32 | unchanged |

- **360 and 412:** the GEOM lines differ from geminifix3 only in wall-clock text. The runs were a minute apart: `07:17` vs `07:18/07:19`, and `62h 00m` vs `61h 59m`. That moves minClear by under 0.1px (5.17 vs 5.25, 17.83 vs 17.97). Computed columns, `white-space` and heights are identical. That is expected, because the only CSS change is the boundary of a `max-width` query, which by definition does not match at ≥360.
- **Fix 6 goal at ≥360:** it still holds. The day/time and cycle values are `nowrap`, one line (h16), at 360 and 412.

## Nits (non-blocking)

- **N1.** The handoff's geometry table, e.g. 412 → `88px 142.812px 107.188px` and 360 minClear 4.66, came from `/usr/bin/chromium` with different font metrics. My numbers come from the pinned headless shell and match my geminifix3 numbers. Neither browser shows a failure, but with system chromium the 360px margin (4.66px) is closer to the 4px floor. That is the same edge case as geminifix3 N3: 360 is now the tightest width, and it stays in the loop.
- **N2.** Carried over: the original `@media (max-width: 340px)` rule at `styles.css:637` is now dead code, and its 340 value no longer matches the 359 override. Delete it or leave a pointer comment.
- **N3.** Carried over: the layout.mjs wall-clock flakes (grid-line `m <= to`, and the motionSeed before-03:00 CST seed), plus the geminifix2 nits N2–N6. All are out of scope.
