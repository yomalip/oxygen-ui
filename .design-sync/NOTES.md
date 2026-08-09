# design-sync notes — Oxygen UI

Project: `Oxygen UI Design System` (`e7a79865-b341-438f-b4e9-a2eda9e8c70b`)
Shape: `storybook` (`packages/oxygen-ui-docs/.storybook`)

## Environment

- `[GENERAL]` **Node 24 is mandatory for every command in this sync.** Repo `engines.node` is
  `>=24.0.0`, but the shell here defaults to `v20.15.1`. Prefix commands with
  `export PATH="$HOME/.nvm/versions/node/v24.12.0/bin:$PATH"` (or `nvm use 24.12.0`).
  Two distinct failures on Node 20:
  - `storybook build` refuses outright (needs 20.19+ / 22.12+).
  - Worse and non-obvious: a `pnpm i` run under Node 20 **silently skips**
    `@oxc-parser/binding-darwin-arm64` (optional native dep). The Storybook build then dies with
    `Cannot find module '@oxc-parser/binding-darwin-universal'` even after switching to Node 24.
    Fix: re-run `pnpm i` under Node 24 to pull the binding.
  - No `.nvmrc` exists in the repo, so nothing catches this. Adding one would prevent it.

- `[GENERAL]` **`pnpm i --frozen-lockfile` currently fails, and it is unrelated to this sync.**
  `ERR_PNPM_OUTDATED_LOCKFILE` on `packages/oxygen-data/package.json`. Cause: uncommitted WIP
  packages (`packages/oxygen-data`, `packages/oxygen-features`, `samples/three-layer-demo`) sit
  inside the `packages/*` / `samples/*` workspace globs and reference
  `"@tanstack/react-query": "catalog:"`, but that catalog entry is not in `pnpm-workspace.yaml`
  and the specs are not in `pnpm-lock.yaml`. None of those three packages are part of the design
  system sync (they have no stories). The existing `node_modules` builds all 11 projects fine,
  so the sync proceeds on it. If a clean install is ever needed, either add the catalog entry
  back or stash the WIP packages first.

## Build inputs

- DS entry: `packages/oxygen-ui/dist/index.js` (Storybook aliases `@wso2/oxygen-ui` straight to it).
- `--node-modules`: `packages/oxygen-ui/node_modules` — confirmed to contain `react` + `react-dom`,
  so no need to fall back to the repo root.
- Reference storybook built from `packages/oxygen-ui-docs` with `-c .storybook` and a repo-root
  absolute `-o`. Result: 629 stories across 104 titles.

## Title mapping

- `[GENERAL]` **`titleMap` keys are the whitespace-STRIPPED last title segment, not the display
  title.** `lib/common.mjs:74` does `parts.map(s => s.replace(/\s+/g,''))` before lookup, so
  `Inputs/Date Picker` keys as `DatePicker` and `Getting Started` keys as `GettingStarted`.
  Writing the spaced form silently does nothing — it cost one full build cycle to spot.

- `[GENERAL]` Only ~73 of 104 storybook titles map to a package export out of the box. Reasons,
  in descending frequency:
  1. **Story titles that are demos, not components** — page templates (`Templates/*`),
     multi-export showcases (`Utils/Transitions` = Fade/Grow/Slide/Collapse/Zoom,
     `Inputs/Transfer List` = List+Checkbox+Button composite). No single export exists to bind
     them to, so they are excluded.
  2. **camelCase hooks/factories** — the converter's `exportedSet` is PascalCase-only, so
     `useTheme`, `useMediaQuery`, `useColorScheme`, `useThemeContent`, `useAppShell`, and
     `createOxygenTheme` can *never* map. Excluded by construction, not by choice.
  3. **Real components under a different name** — mapped explicitly:
     `FloatingActionButton→Fab`, `FormElements→Form`, `Progress→CircularProgress`,
     `Icons→Icon`, `DatePicker→DatePickers`. Each was confirmed by reading the story's own
     import line, which is the authority.
  4. **Sibling-package-only exports** — `Charts/RadarChart` and `Charts/RadialBarChart` live only
     in `@wso2/oxygen-ui-charts-react`. The other four charts (Area/Bar/Line/Pie) map because
     MUI X's surface already supplies those names. Fixed with
     `cfg.extraEntries: ["@wso2/oxygen-ui-charts-react"]` — note the build auto-detects only the
     *icons* sibling (`[ICON_PKG]`), never the charts one.

- `[GENERAL]` **Charts need a symlink — fresh-clone setup step.** All six chart components live
  only in `@wso2/oxygen-ui-charts-react`, which is a dependency of `oxygen-ui-docs`, **not** of
  `oxygen-ui`. So it is absent from `packages/oxygen-ui/node_modules` and
  `cfg.extraEntries: ["@wso2/oxygen-ui-charts-react"]` fails with `[UNRESOLVED_IMPORT]`.
  Recreate this link after any fresh clone or `pnpm i` (it is inside gitignored `node_modules`):

  ```
  ln -sfn ../../../oxygen-ui-charts-react \
    packages/oxygen-ui/node_modules/@wso2/oxygen-ui-charts-react
  ```

  A bare specifier is required rather than a relative path: `lib/story-imports.mjs:134` filters
  relative `extraEntries` out of the import-redirect map, so a relative entry would put the charts
  on the global **without** redirecting story imports to it.

  Worth knowing *why* this matters beyond the two missing charts — **confirmed**, not suspected:
  `AreaChart`, `BarChart`, `LineChart`, and `PieChart` are absent from `packages/oxygen-ui/dist`
  and `src` entirely (verified by grep), yet they mapped to components on the first build. The
  `[EXPORT_COLLISION]` line names them: they are **lucide chart ICONS** exported by
  `@wso2/oxygen-ui-icons-react`. So before this fix, four chart cards were bound to icon
  components while their stories imported the real charts from the sibling package. After adding
  `extraEntries`, the real chart implementations win the global merge (main package + extraEntries
  beat the icon sibling) and the collision list grows 13 → 18 as expected. All six charts are now
  consistent. Still check the chart sheets in the compare loop — it is the oracle.

- `[GENERAL]` **Sibling-vs-sibling export collisions need an entry shim — the converter's built-in
  mitigation does NOT cover them.** This is the subtlest problem in this repo; read before touching
  `entry` or `extraEntries`.

  `@wso2/oxygen-ui-charts-react` and `@wso2/oxygen-ui-icons-react` both export `AreaChart`,
  `BarChart`, `LineChart`, `PieChart`, and `Radar`. The converter merges siblings with `export *`
  (`package-build.mjs:341`), and **ESM drops ambiguous star re-exports to `undefined`** — it does
  not pick a winner. Symptoms: `✗ [BUNDLE_EXPORT] 4/80 not a component on window.OxygenUI`,
  `✗ [RENDER] root empty` on all four chart previews, and RadarChart throwing
  "Element type is invalid ... got: undefined" because `Radar` was gone too.

  `package-build.mjs:315` documents the converter's mitigation — export main's namespace as
  `__dsMainNs` and `Object.assign` it over the global last — but that only rescues
  **main-vs-sibling** collisions. Here both sides are siblings, so nothing rescued them.

  Fix: `packages/oxygen-ui/.design-sync-entry.mjs`, wired via `cfg.entry`. It does
  `export * from './dist/index.js'` plus an **explicit** named re-export of the five names.
  Explicit exports beat `export *` within a module, and that module *is* `__dsMainNs`, so the
  footer's `Object.assign` lands the real charts on the global.

  Two constraints on that file, both load-bearing:
  1. **It must live inside `packages/oxygen-ui/`.** `PKG_DIR` is derived by walking up from the
     entry to the first *named* `package.json` (`package-build.mjs:164`). From `.design-sync/` the
     walk reaches the workspace root, which breaks type extraction and reports version `0.0.0`.
     `--inputs` does not pin `PKG_DIR`.
  2. **Deliberate trade-off:** on the global those five names are now the CHART components, not the
     same-named lucide icons. Charts are five real components with their own cards; the icons are
     five of ~1000 and stay importable from the icons package directly.

  Verified before paying a full rebuild by replicating the generated entry + IIFE footer in a
  throwaway esbuild + chromium probe — all five went `UNDEFINED` → `function` with no regression to
  `Button`/`Form`/`StatCard`/`ListingTable`. Worth repeating that probe if the sibling set changes.

- **Name collisions are real.** `Surfaces/ClickableCard` and `App Elements/Form Elements` both
  build on `Form`. Two titles cannot map to one export (the second would overwrite the first), so
  `FormElements` (15 stories) claims `Form` and `ClickableCard` (3 stories, a `Form.CardButton`
  demo) is excluded. Revisit if `ClickableCard` ever becomes its own export.

- `[EXPORT_COLLISION]` `@wso2/oxygen-ui-icons-react` exports 13 names the main package also
  exports (`Badge`, `Box`, `Container`, `Form`, `Grid`, `Icon`, …). The main package wins the
  global merge, so stories importing those names *from the icons package* would render the wrong
  binding. Fixed with `cfg.storyImports.bundle: ["@wso2/oxygen-ui-icons-react"]`.
  **Watch for `[FILE_TOO_LARGE]`**: `Utils/Icons` does `import * as OxygenIcons` (every icon), and
  bundling icons-as-code into that preview is exactly the case the 12 MB per-file cap is meant to
  catch. If it fires, that component is the one to slim or drop.

## Scope decisions

- Documentation-only titles excluded via `titleMap: {<title>: null}` — they are prose pages, not
  components, and would produce meaningless cards: `Welcome`, `Getting Started`,
  `How To Contribute`, `How To Add Runtime Theme Support`, `Accessibility`.
  Note `HowToContribute.stories.tsx` also defines a real `Components/Custom Card` title, which is
  deliberately **kept** — exclusion is per-title, not per-file.
- Kept despite looking doc-like: `Templates` (bare title, 1 real story "List Templates") and
  `Theming/Colors` (colour-swatch stories). Both render real visual content.
- Hook-ish titles kept for now (`App Elements/useAppShell`, `Theming/useTheme`,
  `Theming/useThemeContent`, `Theming/createOxygenTheme`, `Utils/useColorScheme`,
  `Utils/useMediaQuery`) — their stories render real demos. Revisit if they fail to pair.

## Grading guidance — read this before judging any sheet

- `[GENERAL]` **The contact sheet shrinks each panel INDEPENDENTLY, so the preview routinely looks
  40-50% smaller than the storybook render. This is an artifact, not a styling bug.** Storybook
  crops tightly to the story; the preview screenshots a full ~910px page canvas. Shrunk to equal
  sheet columns, the preview's content therefore appears much smaller.
  **Always open the `raw/…__sb.png` / `raw/…__ds.png` pair before grading anything as a size,
  scale, or typography difference.** Verified on Button, Typography, and ImageList/Quilted: every
  apparent scale gap vanished at full resolution — identical button sizes, identical type scale,
  identical quilt spans and container widths. Do not "fix" this; there is nothing to fix, and a
  size-based `close` grade on this basis is wrong.

- `[GENERAL]` The storybook panel has a faint gray canvas background; the preview page is white.
  Surroundings, not the component — ignore per the rubric.

- `[GENERAL]` **Interaction-driven stories show the closed state on BOTH sides — grade `match`, not
  `mismatch`.** Dialog's five stories render only their "OPEN …" trigger button in storybook too,
  because nothing clicks them. Same for other overlay triggers. The card will not show an open
  dialog; that is faithful to the reference, which is the contract. Do **not** neutralize or force
  open state in an owned `.tsx` to "improve" it — that destroys the fidelity being verified.

- `[GENERAL]` **The preview page inset is exactly 24px per side — a hard constant, not "about 24px".**
  Measured twice independently (`Container/Disable Gutters` bar at x 24-875; `Layout/With Navbar`
  navbar at x 24-875) on a 900x700 canvas. Storybook renders flush at 0,0. This matters because it
  turns "framing" from an excuse into arithmetic that either closes or doesn't — for
  `Container/Default` it closed to the pixel. On components wide enough to reflow it produces a
  *real* pixel difference that is still pure framing (e.g. AppShell's footer wraps its version string
  and `Privacy Policy` onto a second line in the preview only). There is no knob. Grade `match`; do
  NOT chase it with an owned preview or an `sx` tweak.

- `[GENERAL]` **Flex-shrink amplifies the 24px inset into a VARIABLE, story-specific delta — the trap
  for layout primitives.** `Layout`'s `width:240` sidebar measured 9-12px narrower in the preview
  across four stories, which looks like a real regression until you notice the slope is a stable CSS
  constant (9/48 = 0.1875 of the width loss). The way to prove it: find the story *not* in the shrink
  regime — `Layout/With Navbar` is exactly 240px on both panels. Do the same before believing any
  width delta on a flex container.

- `[GENERAL]` **Crop-then-stack's background auto-detect INVERTS when content bleeds to every image
  edge** — the border pixels are then content, not background. `Container/Disable Gutters` reported
  sb 174x20 vs ds 858x59 on an identical render. Tells: a bbox far *smaller* than the visibly
  rendered content, or a wild height disagreement. Fall back to a row/column pixel run-scan there.

- `[GENERAL]` **Width/pitch spread is the horizontal twin of the same artifact.** Any story whose
  root fills its parent (`TableContainer`/`Paper` at `width:100%`, a full-width `Stack` with
  `justifyContent="space-between"`, a `Divider` rule) renders WIDER in the preview. Because the two
  panels are shrunk by *different* factors, equal-looking widths in the sheet imply unequal heights
  — which is why Table's rows looked ~25% shorter in pitch and Tooltip's LEFT/RIGHT buttons looked
  pushed to opposite page edges. At full res Table's row pitch is 52px on both sides and
  Tooltip/Placements' is 53px on both. Same remedy: read the raw pair, change nothing.

- `[GENERAL]` **The `Badge` main-vs-sibling export collision resolves correctly — verified from the
  render, not just the build log.** `@wso2/oxygen-ui-icons-react` also exports `Badge`, but the
  preview renders the MUI-based component (orange count pill on an avatar), matching storybook pixel
  for pixel. This confirms the `__dsMainNs` `Object.assign` footer does cover main-vs-sibling
  collisions as documented — it is only *sibling-vs-sibling* that needed the entry shim. Recheck
  this render if the merge order in `package-build.mjs` ever changes.

- `[GENERAL]` Storybook's faint gray canvas makes a white `Paper` visible (e.g. List `Default`) that
  is invisible against the preview's white page. Surroundings — ignore.

- `[GENERAL]` **A `[GRID_OVERFLOW] … wide` flag says NOTHING about render fidelity — do not
  pre-suspect a flagged story.** `SpeedDial/Directions` is the flagged-wide story, yet its four FABs
  land at exactly +8px/+8px of their storybook coordinates with identical diameters and zero reflow.
  The flag is purely about the product card's cell clip, which `cardMode: "column"` already handles.
  It is not a grading signal.

- `[GENERAL]` **The closed-state rule covers navigation and overlay components too, with no portal
  bleed.** `Drawer` (Temporary Left, Anchors, Persistent) and all 5 `SpeedDial` stories render the
  closed state on both panels — trigger button / bare FAB only, no drawer paper, no action buttons,
  no tooltips — and both report `portal: false` in their capture facts. Same explanation as `Dialog`
  and `Menu`'s `[RENDER_THIN]`. Graded `match`; nothing to force open.

- `[GENERAL]` **The preview canvas is a fixed 900x700 viewport, so content taller than ~650px is
  clipped at the bottom** — the vertical twin of the ~24px inset. Seen on `ListingTable / Selection`
  (sb content 770px, ds 646px) and `ListingTable / Built-in Search` (sb 789px, ds 650px): every
  visible row is identical, the preview simply stops at the canvas edge. Framing — grade `match`.

- `[GENERAL]` **For a fixed/portal overlay that is OPEN in its story, the `__sb.png` can look blank
  or truncated while the PREVIEW looks complete — and the preview is right.** Storybook centres the
  story root vertically and the sb shot is an *element* screenshot of `#storybook-root`. Measured on
  `NotificationPanel / Live Announcements`: `#storybook-root` sits at page y=289 (h=122) in the 700px
  viewport while the drawer paper is `position:fixed` at `{x:520,y:0,380x700}`, so the element clip
  captures rows 289-411 — the empty area *below* the notification items. Re-rendering the same
  sb-reference story at a full 900x700 viewport diffs against the preview at mean-abs-diff 0.02/255,
  i.e. identical. Grade `match`, and read the DOM/paper geometry before believing any
  "preview shows more than storybook" delta. Reusable probe recipe: serve
  `.design-sync/sb-reference` over `python3 -m http.server`, then drive
  `iframe.html?id=<story-id>&viewMode=story` with playwright imported from
  `.ds-sync/node_modules` (the repo-root playwright has no browser installed; `.ds-sync`'s does).

- `[GENERAL]` **Mean-abs-diff is unreliable on tiny text-only crops** — the same 1px-shift inflation
  NOTES documents for `%pixels>threshold`. MUI text buttons are transparent, so an interaction-driven
  trigger story's content bbox is pure glyphs ~12px tall. `Backdrop/Default` scored MAD 24.0 and
  `Backdrop/Invisible` 29.9 — well over the 14/255 bar — on visually identical renders; a dx=+1
  alignment search drops them to 18.2 and 12.15. **The 14/255 bar is only meaningful on crops with
  substantial solid-colour area.** Conversely, stories that pin their own width
  (`sx={{minWidth:900}}`) make both panels render identically wide and collapse to MAD 0.05/255.

- `[GENERAL]` **Assets are NOT blocked in this environment — confirmed positively, not inferred
  from a missing warning.** ImageList's 16 Unsplash images and `PageTitle/With Avatar`'s remote
  photo all render on *both* panels at full res. So `[ASSETS_BLOCKED]`'s false-pass trap (both
  sides blanking identically) is not in play for this run, and image-bearing grades are sound.

- `[GENERAL]` **Crop-then-stack is the technique that removes the scale artifact entirely** — worth
  reusing. Crop both raw PNGs to their own content bounding box, then stack the two crops 1:1 in one
  image. Detect the background as the most common border-pixel colour (storybook's canvas is faint
  grey and the preview is white, so a fixed white test fails), and pad slightly. The printed crop
  dimensions then give a hard size check — every pair in the inputs batch agreed within 1px.
  Caveat on any `%pixels>threshold` metric: a 1px width difference shifts every text glyph and
  inflates it to ~8-11% while the render is identical (Checkbox `With Label`, Switch `With Label`,
  RadioGroup `Sizes` all did this and all visually matched). Trust the mean absolute difference
  (all were < 14/255) and your eye, not the percentage.

- `[GENERAL]` **Form-control theming/label plumbing is confirmed intact end-to-end** — palettes
  (primary orange / secondary grey / success green / error red / warning orange), disabled
  opacities, small/medium/large size scales, Inter label typography, and outlined-input notched-label
  geometry all match across all 7 form controls plus Button. Upstream's `inputProps` → `slotProps`
  aria-label migration produced **zero** visual delta. A widespread control-styling failure in a
  later batch would therefore be a NEW global issue worth stopping on.

- **`[RENDER_THIN]` on `Menu` is a confirmed FALSE POSITIVE — do not author an owned preview for it.**
  `Navigation/Menu.stories.tsx` gives every story the same `useState`-driven
  `<Button>Open Menu</Button>` trigger, and nothing clicks it, so **storybook itself renders all four
  stories identically** (verified: all four sb crops are byte-identical at 92x20). The validator's
  "variants render identically" is therefore describing the reference, not a preview defect. The
  divider / icons / disabled MenuItem all live inside the closed popover on both panels. Faithful —
  graded `match`.

- **`[RENDER_THIN]` on `Modal` is also a confirmed FALSE POSITIVE — both of the run's thin warnings
  are resolved.** `Utils/Modal.stories.tsx` gives all three stories `useState(false)` plus an
  identical `<Button onClick>Open Modal</Button>` trigger, and nothing clicks it. Proven by md5: the
  three `__sb.png` files are byte-identical to each other, and so are the three `__ds.png` files, and
  the preview reproduces the reference exactly (93x12 content crop, same orange text button). The
  Cancel/Confirm actions and the nested child modal all live inside the never-opened modal in
  storybook too. No owned preview — forcing it open would destroy the fidelity being verified.
  **Neither thin warning needs action on future syncs; both describe the reference.**

- Fonts render identically in both panels (Inter Variable, confirmed at full res on Typography), so
  a font difference in a sheet would be a real finding — but none was seen across the solo set.

## Charts: the compare oracle cannot prove series fidelity (accepted limitation)

- `[GENERAL]` **Recharts entry animations are NOT stabilized by the compare harness, so every chart
  story is captured mid-animation on BOTH panels at a run-to-run-random progress.** This is the one
  place in this sync where the oracle cannot do its job. All 6 chart components / 35 stories are
  accepted at `close` because of it.

  Symptom: axes, grids, legends, series colours, container geometry and radii are pixel-identical,
  but the *data series* is drawn only partway — areas/lines clipped along X, bars at partial height,
  pie/radial arcs partly swept, radar polygons at partial radius. Storybook typically lands ~85%,
  the preview ~0-50%.

  Root cause: `@wso2/oxygen-ui-charts-react` bundles `recharts@3.3.0`, which defaults to
  `isAnimationActive: true, animationDuration: 1500` (see
  `packages/oxygen-ui-charts-react/src/components/charts/BarChart/BarChart.tsx:55-57`) and animates
  through `react-smooth`'s **requestAnimationFrame JS interpolation**, not CSS. The harness's only
  stabilizers are CSS/WAAPI-level — `emulateMedia({reducedMotion:'reduce'})` (recharts ignores the
  media query) and the screenshot's `animations:'disabled'` (`compare.mjs:319-325`) — and
  `settleRender()` awaits only `document.fonts.ready` plus image decode, never an rAF quiesce. The
  preview panel is systematically *earlier* because its single inline bundle reaches `networkidle`
  far sooner than the storybook iframe's chunk graph.

  **Proven nondeterministic, not a fixed offset:** back-to-back captures produce different md5s and
  visibly different geometry on *both* the `__sb` and `__ds` shots. The reference is equally
  unsettled — `PieChart/Basic` sb shows an ~85% sweep for data summing to a full circle.

  Why nothing was done, and what NOT to do next time:
  - `compare.mjs` exposes only `--force`, `--components`, `--max-stories`, `--out`,
    `--storybook-static`, `--spot-check*`. **There is no settle/delay flag.** Verified.
  - The fix is harness-level (an rAF quiesce, or a settle longer than `animationDuration`, or
    programmatic animation fast-forward) applied to both panels. Worth reporting upstream.
  - **Do NOT pin `isAnimationActive={false}` in an owned `.tsx`.** It is a per-component workaround
    for a pipeline-level cause, it diverges the shipped preview from the DS's real animated
    behaviour that a claude.ai/design agent would get, and as an owned preview it would persist and
    SHADOW the corrected generated preview forever once the harness is fixed.
  - **Do NOT fork `compare.mjs`.** The oracle is never forked.

  **The bundle itself is intact** — this is purely a verification-harness artifact. The shipped
  previews are fully animated and settle correctly, so nothing a design agent builds from this
  bundle is wrong.

- `[GENERAL]` **BOUNDARY — the harness's CSS/WAAPI stabilizers DO work; the gap is rAF-specific.**
  Confirmed positively on `CircularProgress`, the direct counter-case: all 6 stories crop to
  byte-identical content bounding boxes (208x35, 188x40, 294x70, 400x64, 400x64, 398x4) with
  mean-abs-diff 0.66-4.54/255 and **zero** pixels differing by more than 32/255. The indeterminate
  spinner sits at the *same rotation phase* on both panels across all 9 spinners in that batch, and
  the indeterminate LinearProgress sweep and LinearBuffer dot stipple land on the same frame.
  `Accordion/Expanded` likewise settles its expand transition identically on both sides.
  So `emulateMedia({reducedMotion})` + the screenshot's `animations:'disabled'` genuinely freeze
  infinite CSS keyframes to a fixed frame and fast-forward finite ones.
  **Never reuse the recharts "captured mid-animation" excuse for a CSS or WAAPI animation.** That
  limitation is specific to `requestAnimationFrame` JS interpolation (react-smooth); a CSS-animated
  component that disagrees only in animation phase is a REAL finding.

## Icons stroke-weight inconsistency — a genuine repo finding, not a sync artifact

- `[GENERAL]` **The icons package sets its stroke width via a SIDE-EFFECT stylesheet, so whether an
  icon gets that stroke depends on how the importing module imports it — and Storybook is therefore
  inconsistent with ITSELF from one story to the next.** The preview is the consistent side here;
  this is the one place in the whole sync where the preview is more faithful than the reference.

  `@wso2/oxygen-ui-icons-react`'s `dist/index.js` begins with `import "./icons.css"`, which carries
  `.lucide:not(.lucide-logo){stroke-width:1.5px}` and `.lucide *{vector-effect:non-scaling-stroke}`.
  Because that is a side-effect import, it survives or vanishes with tree-shaking:
  - `Utils/Icons.stories.tsx` does `import * as OxygenIcons` (namespace) → the module stays alive →
    computed style in the sb-reference is `stroke-width: 1.5px`, `vector-effect: non-scaling-stroke`.
  - `ListingTable`'s **named** imports tree-shake straight through to `export * from 'lucide-react'`
    and drop the stylesheet → computed style is `stroke-width: 2px`, `vector-effect: none`, i.e.
    lucide's default 2-viewBox-unit stroke, which SCALES with `size`.

  The preview ships one `_ds_bundle.css` for every card, so it always gets the 1.5px non-scaling
  stroke. Visible consequence, measured on `ListingTable / Empty State` (`<Inbox size={64} />`):
  sb glyph bbox 60x48 with a ~5.3px stroke, ds 56x44 with a ~1.5px stroke. Invisible around
  size 18-20 (2·20/24 = 1.67px ≈ 1.5px), which is why every other ListingTable story (icons at
  14/16/20) matches perfectly.

  **Correction to an earlier version of this note:** the cause is NOT that
  `.storybook/preview.js` imports only `./docs.css`. Storybook does load the icons CSS — just
  per-story-chunk, depending on the import style above. Verified by reading computed styles out of
  the sb-reference for both stories.

  Real fix is upstream: set the stroke via props or a wrapper component rather than a side-effect
  stylesheet, so it cannot be tree-shaken away. **Do NOT author an owned preview for it** — that
  would shadow the corrected generated preview forever. Reported, not worked around.

- `[PORTAL?]` fires on AreaChart, BarChart and LineChart and is a **false positive** — recharts
  mounts its tooltip as an absolutely-positioned sibling of the chart surface, which trips the
  detector, but nothing hovers these stories so no tooltip ever paints and no overlay bleed appears
  in any sheet. PieChart/RadarChart/RadialBarChart have identical tooltip machinery and were not
  flagged. Keep `cardMode: "column"`; do **not** switch these to `"single"`.

## Fonts and CSS

- **Fonts are self-contained — `[FONT_MISSING]` should never legitimately fire here.** The DS uses
  exactly one family, `'Inter Variable'` (from `@fontsource-variable/inter`), and the workspace's
  own `@wso2/esbuild-plugin-inline-css-fonts` inlines it: `packages/oxygen-ui/dist/index.js`
  carries 7 `@font-face` rules with 7 base64 data-URI payloads. There is no `dist/fonts.css` and
  no `.css` file anywhere under `dist/` — `src/fonts.css` is compiled into the JS. There is also no
  `.storybook/preview-head.html`. So `cfg.extraFonts` is not needed.
  If `[FONT_MISSING]` ever *does* fire, suspect the inline plugin's build rather than a missing
  config knob.

## Docs and theming

- `docs: 0/80 components matched` is expected and acceptable. The repo has **no** `.mdx` and no
  per-component `.md` files; its prose docs are four aggregate files in
  `packages/oxygen-ui/.claude/` (`components.md` 1431 lines, `patterns.md` 1197,
  `theming.md` 334, `migration.md`). `cfg.docsDir`/`docsMap` map *per-component* files, so they
  cannot consume these. The converter synthesizes each `.prompt.md` from the `.d.ts` + previews
  instead. Those aggregate files are still the best source material when writing
  `.design-sync/conventions.md`.

- **Theme names — verified against the bundle global, not inferred from docs.** Present as real
  exports: `WSO2Theme`, `ClassicTheme`, `AcrylicOrangeTheme`, `AcrylicPurpleTheme`,
  `HighContrastTheme`, `PaleGrayTheme`, `PaleIndigoTheme`, **and also** `OxygenTheme` and
  `PaleBaseTheme`. **Only `ChoreoTheme` is genuinely absent** (removed by "Remove product names from
  the default themes").

  Method note worth keeping: an earlier version of this file claimed `OxygenTheme` and `PaleBaseTheme`
  were removed too — inferred from `.storybook/preview.js`'s import list, which simply doesn't use
  every theme. Wrong. The authoritative check is loading `ds-bundle/_ds_bundle.js` in chromium and
  reading `window.OxygenUI`; a throwaway playwright probe does it in seconds. **Never infer an export
  list from a docs file or from what storybook happens to import.**

  Still genuinely stale: root `CLAUDE.md` and `.claude/theming.md` both reference `ChoreoTheme`, and
  root `CLAUDE.md` documents a `Charts` namespace that `dist/index.d.ts` does not export (charts live
  in `@wso2/oxygen-ui-charts-react`).

- `OxygenUIThemeProvider` API (from `theming.md`, verified against `preview.js`): usable bare
  (`<OxygenUIThemeProvider>`), with a single `theme={X}`, or with `themes={[{key,label,theme}]}`
  plus `initialTheme`. The storybook decorator uses the multi-theme form; `globalTypes` defaults
  `theme` to `'classic'` and `colorScheme` to `'system'`, so the reference renders
  **ClassicTheme** by default (the decorator's own `?? 'wso2'` fallback never fires because
  `globalTypes.defaultValue` always populates the global).

## Re-sync risks

- **AppShell's `With Notification Banner` / `With Error Banner` render no banner on either panel.**
  Graded `match` because both sides are identical and nothing dispatches a banner in a static
  render — but "no banner" is currently indistinguishable from "banner broken". If upstream ever
  makes those banners render statically, those two grades must be re-earned.

- **`[STORY_CAP]` — components whose tail stories were captured but never individually graded**
  (compare captures at most 6 stories per component by default): AppShell 6/11, PageTitle 6/8,
  Sidebar 6/7, Chip 6/8 (uncaptured tail: `WithAvatar`, `Disabled` — `WithAvatar` is the only tail
  story in that batch carrying a composition the graded set doesn't cover), NotificationPanel 6/7
  (uncaptured tail: `LeftAnchored`, the only left-anchored composition — use `--max-stories 7` if
  anchor handling ever needs verifying).

  **Two components were deliberately captured ABOVE the cap and should stay that way on re-sync:**
  `ListingTable --max-stories 23` (the default 6 hides the card variant, toolbar, sorting, selection,
  pagination, row actions and the entire Provider section — i.e. every feature the flagship exists to
  demonstrate; all 23 are graded) and `UserMenu --max-stories 8` (to include
  `Without Custom Avatar`).

  The graded stories cover every distinct variant visible in the sheets, but these
  components count as verified-in-full on future syncs even though the tail was never judged.
  Raise `--max-stories` if those tail stories ever carry distinct variants worth verifying.

- **`Dialog` and other interaction-driven stories are verified only in their closed state.** The
  open dialog is never rendered by either panel, so nothing downstream proves the open state works.

- **`ParticleBackground` is accepted at `close` and is unverifiable for a DIFFERENT reason than the
  charts: random seeding, not animation timing.** Reduced motion draws one static frame, but
  `ParticleBackground.tsx:116,137` seeds particle positions with `Math.random()`, so no two renders
  agree. Two consecutive renders of the *same reference story* have a particles-only IoU of **0.005**.
  Two lessons: (a) whole-image mean-abs-diff is BLIND to faint sparse marks — it stayed at 0.37/255
  across those same two renders, so use an ink-mask IoU for canvas content; (b) variant fidelity can
  still be checked statistically — ink coverage sb/ds came out 2.19/2.06%, 0.72/0.78%, 3.50/3.57%,
  correctly preserving subtle < default < energetic. To make this verifiable, seed the RNG.

- **All 6 chart components (35 stories) are accepted at `close`, NOT verified.** Their data series
  were never captured in a settled state on either panel — see the charts section above. If the
  harness gains an rAF quiesce, re-capture the charts first; they are the only components in this
  sync whose core visual content the oracle never confirmed. `PieChart / Recharts Composable Way` is
  the extreme case (series absent in the preview, a bare sliver in storybook).

- **`TextField` has NO adornment story at all**, so adornment geometry is unverified for the
  library's most-used input (11 stories, 6 captured; none exercise `InputAdornment`). Raising
  `--max-stories` would not help — the coverage gap is upstream in the story file. Worth adding a
  story rather than working around it here.

- **`TreeView / Selected Tree View` never paints its selection highlight** — the selected node sits
  inside a collapsed parent, on both panels. Graded `match` because the two sides agree, but the
  selected-state styling is therefore unproven.

- **`Card / With Media` can never grade `match`.** Its media src is `https://picsum.photos/345/140`,
  a random image service, so the two panels legitimately show different photos every capture. The
  card structure was verified identical. Do not "fix" it.

- **`ColorSchemeSVG`'s two `?react` SVG-import stories are skipped, not verified** — see the
  svg-as-component section above. If the converter ever gains an svg-to-React loader, un-skip them.

- **The `.design-sync-entry.mjs` shim is load-bearing and lives in the DS package.** If someone
  "tidies up" `packages/oxygen-ui/.design-sync-entry.mjs`, or drops `cfg.entry`, four chart
  components silently rebind to lucide icons of the same name. There is no test guarding this — the
  symptom is `[BUNDLE_EXPORT] 4/80 not a component` plus four `[RENDER] root empty`.

## Fresh clone / re-sync checklist

Run these before the driver on a machine that has not synced this repo before:

1. `nvm use 24.12.0` (or prefix everything with the PATH export). **Non-negotiable** — see Environment.
2. `pnpm i` **under Node 24** (a Node 20 install silently skips the oxc-parser native binding).
3. Recreate the charts symlink (inside gitignored `node_modules`, so it never survives a clone):
   `ln -sfn ../../../oxygen-ui-charts-react packages/oxygen-ui/node_modules/@wso2/oxygen-ui-charts-react`
4. Re-copy the staged converter scripts, then install its deps + chromium:
   `mkdir -p .ds-sync && cp -r <skill-base>/{package-build.mjs,package-validate.mjs,resync.mjs,lib,storybook,non-storybook} .ds-sync/`
   then `(cd .ds-sync && npm i esbuild ts-morph @types/react playwright && npx playwright install chromium)`
5. Rebuild the DS packages and the reference storybook together (they must move as a pair):
   `pnpm --filter @wso2/oxygen-ui --filter @wso2/oxygen-ui-icons-react --filter @wso2/oxygen-ui-charts-react build`
   then from `packages/oxygen-ui-docs`:
   `npx storybook build -c .storybook -o "$(git rev-parse --show-toplevel)/.design-sync/sb-reference"`
6. Fetch the anchor: `DesignSync(get_file, path: "_ds_sync.json")` → `.design-sync/.cache/remote-sync.json`,
   then run `resync.mjs … --remote .design-sync/.cache/remote-sync.json`.

No `.design-sync/previews/` and no `.design-sync/overrides/` exist — **the first sync needed zero owned
previews and zero lib forks**, so nothing in this repo shadows a regenerated preview. Keep it that way
if you can; prefer a config knob or an upstream fix over an owned `.tsx`.
