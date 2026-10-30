# TASK-001 — Shell diagnostic: header clearance and bottom band

Issue #559 · REQ-001, REQ-002 · foundation-provider for JOURNEY-001.
Branch `agent-runner/task-001-a1-f2365901`, base `ac04390`.
Task-owned progress record. For this body it stands in for the shared daily journal, under the
owner-selected task-owned exception.

## Outcome intended

Run the production shell in a real mobile browser at its actual routed, guard, boot and
crash-fallback boundaries. Record baseline captures and geometry, then state what reproduces, the
shared cause the evidence supports, and what stays device-only. This task repairs nothing: TASK-002
owns the shared shell repair and turns the same spec into its repair proof.

## Sources read

- Primary: `sources/source-01-DECISIONS.md` (global scope; "Technical work" says the cause is still
  to be established), `sources/source-02-GLOBAL-PATTERNS.md` (GLOBAL-01/02 and the shared architecture
  and consumer list), and `sources/source-03-VISUAL-REFERENCE.md` (01.1, 01.4, 02.8, 08.2).
- Images opened and viewed:

  | Reference | Size | Regions used |
  | --- | --- | --- |
  | `sources/source-04-B05-01-home.jpg` | 614,536 bytes | 01.1 header row; 01.4 bottom |
  | `sources/source-05-B05-02-generate.jpg` | 513,288 bytes | header title; 02.8 bottom |
  | `sources/source-11-B05-08-settings.jpg` | 422,628 bytes | header; 08.2 bottom |

- Supporting: `source-13-CODE-REFERENCES.md`, `source-17-B05-12-task-owned-progress.md`.

## Reference observations (viewed images; no pixel sampling)

- **B05-01.1:** the header row (TODAY plus the framed Settings control) sits directly under the status
  bar. The upper part of the title glyphs and the control show reduced contrast under a lighter,
  scanlined band across the header. The owner calls this the "blur effect" and wants to keep it.
  B05-02's upper title line (GENERATE) shows the same wash. In B05-08 the SETTINGS title looks less
  affected.
- **B05-01.4, B05-02.8, B05-08.2:** at the bottom of each phone image there is a flat, near-black
  band, full width, without scanlines or atmosphere colour. It is roughly the lowest 6% of the phone
  height. Directly above it, the atmosphere continues for a short strip below the last footer action
  (Home, Generate) or below the last card (Settings, which has no footer).
- The references are in a purple skin (B05-08 shows Vapour selected). The local captures use the
  product default `clear` skin, so colours differ by design and only geometry is compared.

## Code facts (current tree, `ac04390`)

- `src/ui/atmosphere.tsx` + `src/styles/atmosphere.css`: the atmosphere is `position: fixed` with
  vendor `inset: 0`, at z-index 0 under `.clr-shell__content` (z-index 1). Its only blur is the
  vendor `filter: blur(--atmosphere-blur)` on the blobs. The structure blob is anchored at
  top −26% / left −12%, behind the title corner.
- `AppHeader` (vendor) has no background and no backdrop-filter, and `src/styles/shell.css` adds
  neither. The header is a sibling above `<main>`. Its top is the shell's
  `padding-top: max(--spacing-500, env(safe-area-inset-top))`.
- Vendor `.clr-shell--fixed`: `height: 100dvh`. `shell.css`:
  `padding-bottom: max(--spacing-500, env(safe-area-inset-bottom))`. The pinned `PhoneFooter` adds
  `--spacing-300` (12px) under the action. `--spacing-500` resolves to 20px.
- `BootSequence` renders its own copy of the same shell markup and atmosphere, above the router.
- `ErrorBoundary` (in `main.tsx`, above both shells) renders a bare `<main>` + `ErrorView`, with no
  shell, no atmosphere and no `env()` padding.
- React Router 7 catches render errors inside the route tree with its default boundary. The first
  run confirmed this ("Error handled by React Router default ErrorBoundary"). So the top-level crash
  fallback is reachable only from outside the router.

## Fixture: `e2e/ui-polish-b05-shell.spec.ts`

The spec uses a synthetic intercepted session for a fictional user (`example.invalid`) and synthetic
reads. Writes are blocked and counted, and the count is asserted 0. It makes no model call and uses
no real account. Safe-area values come from Chromium's `Emulation.setSafeAreaInsetsOverride`, which
only changes what CSS `env()` reads. No stylesheet is edited or injected.

The crash case arms one thrown render fault while boot holds the router back: the boot atmosphere's
own `matchMedia` read throws on the next reduced-motion change, so the real top-level `ErrorBoundary`
renders.

When the local harness has no public Supabase URL or anon key (as in this worktree), the file serves
its own Vite dev server. It runs on port 5290+ with non-secret placeholders on the reserved `.invalid`
domain, so that the synthetic session renders. All Supabase traffic is still intercepted. A named
external target, or a configured local one, is used unchanged.

Each case writes `<id>.png` and `<id>.json` to its test output directory and attaches both to the
report. The JSON holds:

- source identity (`git rev-parse HEAD` plus a dirty flag), the served origin, browser/project, and
  viewport, insets, family, consumer and state;
- the capture's SHA-256;
- rendered boxes only: shell, atmosphere and unpainted height; `vh`/`dvh`/`svh`/`lvh`, `innerHeight`
  and the `visualViewport` height; shell padding; header, title and header-control boxes with
  five-point `elementFromPoint` hit-tests, including the upper quarter that 01.1 marks; `main`,
  footer and footer-control boxes, and the gaps beneath them; html/body grounds; document scroll.

## Baseline results (local run, source `ac04390` plus this task's uncommitted files)

Mobile project: Chromium emulation, deviceScaleFactor 3.

| Case | Insets t/b | Title y · clear | Controls | Gap below `main` | Gap below last action | Unpainted below atmosphere | Capture SHA-256 (prefix) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| routed-home-phone 390×844 | 47/34 | 47 · yes | Settings @47 clear | 34 | 46 | 0 | `9037f4c88e42` |
| routed-generate-phone | 47/34 | clear | Home clear | 34 | 46 | 0 | `6aa1e31e4cf9` |
| routed-settings-phone (no footer) | 47/34 | clear | Back clear | 34 | — | 0 | `3d1f9ef4933c` |
| routed-not-found-phone (no header) | 47/34 | clear | — | 34 | — | 0 | `e8225a002c7d` |
| routed-home before/after CDP freeze→active | 47/34 | identical | identical | 34 | 46 | 0 | `9037f4c88e42` (both) |
| routed-home-narrow 320×568 | 20/0 | clear | clear | 20 | 32 | 0 | `87bea3e28ffb` |
| routed-home-short 390×480 | 47/0 | clear | clear | 20 | 32 | 0 | `60cb3912b25f` |
| routed-home-zero-inset 390×844 | 0/0 | clear | clear | 20 | 32 | 0 | `619cd8c6b8b4` |
| guard-signed-out-phone → `/welcome` | 47/34 | clear | — | 34 | — | 0 | `e069036aea9c` |
| boot-checking-phone | 47/34 | clear | — | 34 | — | 0 | `c7197fc952af` |
| boot-failed-phone (Retry footer) | 47/34 | clear | — | 34 | 46 | 0 | `906dba627933` |
| crash-fallback-phone | 47/34 | alert at y 0 | — | 690 | — | no atmosphere | `adbf949140d8` |

In every shell instance, `vh` = `dvh` = `svh` = `lvh` = `innerHeight` = the visual viewport height =
the viewport. The body ground is `rgb(23, 23, 23)`, and the html ground is transparent.

Visual comparison of the local captures against the reference regions:

- **Home header (01.1):** the local TODAY title and Settings control render fully crisp. The washed
  upper title in B05-01 does not appear.
- **Home/Generate bottom (01.4, 02.8):** the local atmosphere runs to the viewport bottom, with 46px
  of atmosphere below the action. That matches the short atmosphere strip in the references. The flat
  band below it does not appear.
- **Crash fallback:** the alert starts at y 0, inside the 47px top inset, with no gutter and no
  atmosphere.

## Diagnosis

**REQ-002, bottom band: the flat band is not reproduced locally (device-only limit).** The shell-owned
part is reproduced and measured.

- Inside the viewport the page receives, every pixel is painted by the fixed `inset: 0` atmosphere
  (unpainted 0 in all shell cases). The reference band is flat and has no scanlines, so it lies
  outside the region the atmosphere paints: on the pictured device, the viewport the page laid out
  against ended above the physical screen bottom.
- Chromium emulation makes every viewport unit equal to the screen (measured above), so it cannot
  produce that band. Why the installed device's viewport is shorter is **not established**, and no PWA
  cause is assigned.
- **Reproduced shared contribution:** all empty space below `<main>` is the contained shell's
  `max(--spacing-500, env(bottom))` padding, and the footer adds 12px under the last action: 46px at
  a 34px inset. When no inset is reported (zero-inset, short and narrow cases), the shell still
  reserves a 20px dead strip.
- That relationship (`shell.css` content padding plus `PhoneFooter` in the `ScrollRegion` foot,
  duplicated by the boot shell) is the shared owner TASK-002 must correct. It must stay correct if
  the device's viewport differs from emulation.

**REQ-001, header clearance: element occlusion is not reproduced locally (device-only limit).**

- No layer covers the title or header controls in any routed, guard or boot case. All sit at or
  below the top inset, and they are the top hit-test target at all five points, upper quarter
  included.
- The only blur in the shell is the atmosphere blob layer underneath the content, which makes it a
  candidate for the contrast "wash". It is not confirmed: the local capture shows no wash in the
  default skin, and the reference is a different skin on an installed device.
- Whether the installed app positions the header differently relative to its status bar is a
  device-only question, still pending.

**Crash fallback: header clearance reproduced, in the shared composition.**

- The independent fallback renders outside both shells, without atmosphere, gutters or `env()`
  clearance. Its alert begins at y 0 inside the 47px top inset, so on a notched phone the status bar
  would cover its top.
- The spec asserts this. It is a shared-composition gap for TASK-002, not a per-route offset.

The physical installed-iPhone result for both requirements stays pending outside the DAG until it is
actually observed. Nothing is repaired here.

## Failures and corrections

1. **Early tool approvals.** Several early tool calls (`python3`, `shasum`, standalone `node`, and an
   ad-hoc single-test Playwright run) needed approval and were not run. Reference SHA-256 values and
   pixel sampling of the references were therefore not computed; the reference observations are
   visual only. The exact controller commands were approved later and ran.
2. **First spec run: 7 of 9 failed.** The cause was the environment. The worktree has no
   `.env.local` / `.env.runner.local`, so the bundle had no Supabase config ("Supabase configuration
   is missing"), never read the synthetic session, and landed signed-out. The only passes were Not
   found and the guard.
   - Correction: when public config is absent, the per-worker synthetic origin described above is
     used.
3. **The crash fault was caught by the router.** That first run also showed the fault from the
   router-tree atmosphere being handled by React Router's default boundary. The crash case now arms
   the fault while boot holds the router, and it reaches the real `ErrorBoundary`.
4. **Measured value corrected.** `--spacing-500` is 20px, not 24px as first assumed in this record.

## Verification (this worktree, after the corrections)

- `npx playwright test e2e/ui-polish-b05-shell.spec.ts --project=mobile`: 9 passed (6.7s).
- `npm test`: 237 files, 5809 tests passed.
- `npm run lint:ds`: exit 0.
- `npm run build`: exit 0 (existing chunk-size warning only).
- `npm run lint`: 0 errors. The 143 warnings are all pre-existing, none in the new spec.
- `npm run typecheck`: exit 0.
- `npm run gen:types -- --check`: `src/data/database.types.ts` is current.
- `python3 scripts/gen-issues.py --check`: exit 0 ("71 requirements, 136 edges").

## Unresolved

- Reference image SHA-256 and pixel-sampled region comparison: not computed (tool approval).
- Cause of the shorter installed-device viewport and of the 01.1 header wash: device-only, not
  established.
- Physical installed-iPhone UAT: pending outside the DAG.

## Next safe action

TASK-002 corrects the shared bottom/top geometry:

- the contained-shell padding and footer relationship;
- the boot copy;
- the crash fallback's missing shell, atmosphere and clearance.

It then replaces this spec's diagnostic assertions with the repaired expected geometry, keeping the
same cases and recorded evidence.
