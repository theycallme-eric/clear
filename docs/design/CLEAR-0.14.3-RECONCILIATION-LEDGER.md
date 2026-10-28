# CLEAR 0.14.3 reconciliation ledger

**Status:** ACTIVE · maintained by TASK-025 (#371) · REQ-001, REQ-002, REQ-028
**Contract:** `docs/specs/design/ATOMIC.md` (what to build with) · this file (why, from where, by whom)

This ledger maps every 0.9.7 → 0.14.3 rule change to its source evidence, the current
implementation, the recovery 012 task that landed it, and its rendered or tested evidence. It
also records the owner's disposition for each discrepancy found inside the 0.14.3 export, and every
app-owned exception to "compose the public surface".

## Precedence

The owner confirmed on 2026-10-01 that the 0.14.3 components are accurate and the export's README
is out of date in places. In order:

1. Component implementations and declarations (`components/*/*.jsx`, `*.d.ts`), through the public
   entry `index.js` / `index.d.ts`.
2. Shipped CSS (`styles.css` → `css/foundation.css`, `css/motion.css`, `css/skins.css`).
3. The latest entries in `exports/clear-design-system-0.14.3/docs/decisions.md` and
   `exports/clear-design-system-0.14.3/CHANGELOG.md`. A later release overrides an
   earlier entry.
4. Rendered specimens (`preview/`, `components/*/card.html`).
5. README, `exports/clear-design-system-0.14.3/docs/patterns.md`,
   `exports/clear-design-system-0.14.3/docs/register-status.md` and the worked app's notes: context only,
   where they agree with 1–4.

Qualified `exports/` paths are repository-relative; other package entries above are relative to
`exports/clear-design-system-0.14.3/`, which is byte-identical to the
runtime copy `src/design-system/`. Stale prose never triggers a vendor edit. Rejected explorations
were deleted by the export itself (CHANGELOG 0.10.0–0.10.1), and none is promoted here.

## Rule changes (RULE)

Recovery 012 task numbers. PR numbers are the merged pull requests.

| ID | 0.14.3 rule | Source evidence | Implementation | Task | Evidence |
|---|---|---|---|---|---|
| RULE-01 | Every form sits in one card. Group headings sit inside it, and fields keep their labels above. | `exports/clear-design-system-0.14.3/CHANGELOG.md` 0.9.8–0.9.9; `exports/clear-design-system-0.14.3/docs/decisions.md` | `src/ui/card.tsx` composed by the auth, onboarding, Generate, Settings, Places and debrief routes | TASK-010 (#411), TASK-011 (#410), TASK-012 (#412), TASK-016 (#413), TASK-023 (#415), TASK-024 (#423), TASK-022 (#430) | `docs/design/evidence-0143/entry-forms/manifest.json` |
| RULE-02 | Public `Card`: the 12px bar is mandatory and comes in one width, with an automatic corner | CHANGELOG 0.11.0, 0.14.3; `exports/clear-design-system-0.14.3/components/Card/Card.jsx` | `src/ui/card.tsx` (heading adapter, EXC-01) | TASK-003 (#400) | `src/ui/card.test.tsx` |
| RULE-03 | Card ground is 70% (`--card-ground-alpha`), and element frames stay solid | CHANGELOG 0.12.3; `exports/clear-design-system-0.14.3/css/foundation.css` | Vendor CSS, unmodified | TASK-002 (#398), TASK-003 (#400) | `src/app/contained-shell.test.tsx`, `src/ui/card.test.tsx` |
| RULE-04 | Every stroke and letter emits a tight `--emit-near` and wide `--emit-far` halo. Only the primary action adds the 6px `--glow-spread`. | CHANGELOG 0.12.0; `exports/clear-design-system-0.14.3/css/foundation.css` | Vendor `.clr-bleed`, carried by the components | TASK-002 (#398), TASK-004 (#401) | `docs/design/evidence-0143/workout-lifecycle/manifest.json` |
| RULE-05 | Ring border with a stroke-only halo; layers draw only their own edge line, and the footer only its top | CHANGELOG 0.12.2 | Shell over `.clr-footer` / `.clr-band` | TASK-005 (#402) | `src/app/contained-shell.test.tsx` |
| RULE-06 | One atmosphere with long-axis blobs and transform-only breathing. The modes were removed. | CHANGELOG 0.11.1, 0.11.2, 0.12.0–0.12.1; `exports/clear-design-system-0.14.3/css/motion.css` | `src/app/RootLayout.tsx`, `src/ui/atmosphere.tsx`, `src/app/atmosphere.ts` | TASK-005 (#402) | `src/app/atmosphere.test.tsx` |
| RULE-07 | Dialog, Toast and failed ScanLoader own their motion. Arrivals stagger 40ms; the README moment lookup is used. | CHANGELOG 0.13.0; `exports/clear-design-system-0.14.3/css/motion.css` | `src/ui/motion.ts`, `src/ui/app-dialog.tsx`, `src/ui/toast-host.tsx`, `src/ui/view-state.tsx` | TASK-006 (#403), TASK-007 (#404), TASK-008 (#405), TASK-009 (#406) | `src/ui/motion.test.ts`, `src/ui/app-dialog.test.tsx`, `src/ui/toast-host.test.tsx` |
| RULE-08 | TimerDisplay, ScanLoader and EmptyState are already cards, and a card never holds another card | CHANGELOG 0.10.2 | `src/ui/card-context.ts`, `src/ui/view-state.tsx`, `src/ui/workout-chrome.tsx` | TASK-003 (#400), TASK-009 (#406), TASK-032 (#407) | `src/ui/view-state.test.tsx`, `src/ui/workout-chrome.test.tsx` |
| RULE-09 | Shared responsive action row, including the critical button. A dismissible toast may overlap the footer. | CHANGELOG 0.10.2, 0.14.0 | `src/ui/app-dialog.tsx`, `src/ui/blocking-dialog.tsx`, `src/ui/toast-host.tsx` | TASK-007 (#404), TASK-008 (#405) | `src/ui/blocking-dialog.test.tsx`, `src/ui/toast-host.test.tsx` |
| RULE-10 | 8px field cut with wrapper emission, in-field unit and warning glyph; the textarea grows without a grip | CHANGELOG 0.14.0–0.14.1; `exports/clear-design-system-0.14.3/components/Input/Input.jsx` | Public `Input` / `FormField`; `src/ui/select.tsx` (EXC-04) | TASK-004 (#401) | `src/ui/select.test.tsx`, `src/test/design-system-0.9.7.test.tsx` |
| RULE-11 | Public `TextAction`: link or button, chevron, 40px target | CHANGELOG 0.14.0; `exports/clear-design-system-0.14.3/components/TextAction/TextAction.jsx` | Public `TextAction` | TASK-004 (#401) | `src/ui/text-action.test.tsx` |
| RULE-12 | Round line-drawn mood faces; SmilePlus has no plus | CHANGELOG 0.14.2 | `src/ui/mood.tsx` over the public icons | TASK-039 (#408) | `src/ui/mood.test.tsx` |
| RULE-13 | Removed: legacy frame shapes and props, hue and font aliases, EmptyState actions, ChamferedFrame glow, the large bar | CHANGELOG 0.9.7, 0.10.1, 0.11.2, 0.14.3; `exports/clear-design-system-0.14.3/index.d.ts` | Production guard and lint gate | TASK-002 (#398), TASK-003 (#400), TASK-025 (#371) | `src/test/design-system-097-deprecations.test.ts`, `src/test/adherence-gate.test.ts` |
| RULE-14 | Progress shows 20 real lit and unlit segments; ChoiceGroup composes Chip; AppHeader has a left slot | CHANGELOG 0.11.0 | Public `Progress`, `ChoiceGroup`, `AppHeader` | TASK-013 (#409), TASK-005 (#402) | `docs/design/evidence-0143/collections-settings/manifest.json` |
| RULE-15 | Body line height is 1.25 (15 / 17.5px), and padding clears the corner cut including its diagonal | CHANGELOG 0.12.2, 0.14.0; `exports/clear-design-system-0.14.3/css/foundation.css` | Vendor tokens, unmodified | TASK-002 (#398) | `docs/design/evidence-0143/entry-forms/manifest.json` |
| RULE-16 | The worked app is current visual intent on older content; `_source/` is historical; rejected explorations are gone | `exports/clear-design-system-0.14.3/ui_kits/app/README.md`; CHANGELOG 0.10.0–0.10.1 | Lint gate refuses kit, template, preview and `_source` imports | TASK-025 (#371) | `src/test/adherence-gate.test.ts` |

## Export discrepancies (DISC)

These are inconsistencies inside the export itself; the comparison audit supplied with the owner
brief identified them. The owner disposed of them on 2026-10-01: DISC-01 to DISC-05 are stale
documentation, DISC-06 and DISC-07 are regression-test targets, and DISC-08 preserves the product.
None is an open product question.

| ID | Discrepancy | Owner disposition | Actual implementation | Evidence |
|---|---|---|---|---|
| DISC-01 | README "Calibrated defaults" and "Terms" describe a solid ground, but 0.12.3, the decisions and the CSS give cards a 70% ground | Stale prose; follow the CSS | Cards use the vendor 70% `--card-ground-alpha`, and element frames stay solid | `exports/clear-design-system-0.14.3/css/foundation.css`; `src/ui/card.test.tsx` |
| DISC-02 | README "Screen layout" puts the heading above the card, while README "Containment", the Card definition and the decisions put it inside | Follow the current Card: headings inside, field labels above | `src/ui/card.tsx` renders a real `Heading` inside the public card body (EXC-01) | `exports/clear-design-system-0.14.3/components/Card/Card.jsx`; `src/ui/card.test.tsx` |
| DISC-03 | The decision index and kit notes still call light a "2px bleed" | Stale prose; follow the dual-halo emission, and keep the primary glow separate | Vendor `.clr-bleed` halo through the components, with glow only on the primary `Button` | `exports/clear-design-system-0.14.3/css/foundation.css` |
| DISC-04 | README calls `--chamfer-xl` deprecated, but 0.10.1 and the CSS removed it | Treat as removed; use sm, md, lg or auto | Lint gate and production guard reject `xl` frames | `scripts/adherence/ds-config.mjs`; `src/test/design-system-097-deprecations.test.ts` |
| DISC-05 | `exports/clear-design-system-0.14.3/docs/register-status.md` says "as of 0.10.1" but records 0.14.0 work; the index icon comment says no curves despite the 0.14.2 faces | Stale metadata; use the current TextAction and the explicit mood-face exception | Public `TextAction`; `src/ui/mood.tsx` | `src/ui/text-action.test.tsx`; `src/ui/mood.test.tsx` |
| DISC-06 | The critical Dialog sets an urgency border while its surface and halo stay in the card role | Verify before acting; keep the exact vendor; add an adapter only for a reproduced defect | Exact vendor. The critical appearance is not restyled; the critical button and the title carry severity in text. No defect was reproduced, so there is no adapter. | `exports/clear-design-system-0.14.3/components/Dialog/Dialog.jsx`; `src/ui/blocking-dialog.test.tsx` |
| DISC-07 | README says no input waits for animation, but the native Dialog stays modal through its 200ms exit | Adopt the component-owned exit; regression-test close, reopen, Esc, backdrop and reduced motion | `src/ui/app-dialog.tsx` reports each user dismissal once after the vendor exit, and reduced motion closes at once (EXC-02) | `src/ui/app-dialog.test.tsx` |
| DISC-08 | Kit notes describe sample View all, abandon and save behaviours on older content | Visual behaviour only; preserve the real product | Routes keep the product's navigation, persistence and recovery 011 behaviour | `docs/design/evidence-0143/workout-lifecycle/manifest.json` |

Further stale prose, the same kind as DISC-01 to DISC-05:

| ID | Stale text | Follow |
|---|---|---|
| STALE-01 | The README motion token table lists `--stagger` as 60ms | `css/motion.css` declares 40ms, as RULE-07 records |
| STALE-02 | The `index.d.ts` header comment still says Version 0.5.0 | `VERSION`, `package.json` and the archive say 0.14.3 (ATOMIC.md §1) |
| STALE-03 | README, kit notes and `_source/` still describe solid ground, forms on atmosphere, atmosphere modes and the optional bar | The current components (RULE-01 to RULE-06) |

## App-owned exceptions (EXC)

Each one is named, narrowly tested and recorded here. None edits the vendor. An adapter exists only
where integration needed one. The production guard
(`src/test/design-system-097-deprecations.test.ts`) pins EXC-01, EXC-03 and EXC-04 by file. It fails
if hand-assembled card markup, a public `Card` import or a raw `<select>` appears anywhere else, or
if EXC-03 is no longer needed.

| ID | File | What it adds | Why | Test |
|---|---|---|---|---|
| EXC-01 | `src/ui/card.tsx` | Renders the card heading as a real `Heading` at the outline level; a nested card becomes a ruled sub-group | The public heading slot is a `span`, and a card never holds a card (owner component authority) | `src/ui/card.test.tsx` |
| EXC-02 | `src/ui/app-dialog.tsx` | Reports each user dismissal exactly once across the vendor's delayed close; a controlled close stays silent | DISC-07: the vendor schedules the close after its exit | `src/ui/app-dialog.test.tsx` |
| EXC-03 | `src/ui/workout-chrome.tsx` | `TimerFrame` draws the shipped timer card markup by hand, for `GlobalTimer` and the movement countdown (REQ-014) | `TimerDisplay` always draws its own card and counts down into its low state. A count-up session clock cannot use it, and neither timer can sit inside a card through it. This is a composition gap, not a vendor defect. | `src/ui/workout-chrome.test.tsx`; `src/app/movement-countdown.test.tsx` |
| EXC-04 | `src/ui/select.tsx` | Native `<select>` framed with the public `.clr-field` | The export ships no Select (DS-04b) | `src/ui/select.test.tsx` |
| EXC-05 | `src/styles/skin-clear.css` | CLEAR skin values with self-hosted fonts in place of the vendor font CDN import | DS-02 font delivery from CLEAR's own origin | `src/styles/fonts.test.ts` |

## Open findings

These are outside TASK-025's writable ownership. They are recorded here rather than fixed in place.

- **F-01:** since TASK-007, nothing in production applies the `.clr-app-dialog-enter` rules in
  `src/styles/app-motion.css`, yet `src/styles/app-motion.test.ts` still asserts them. They are
  inert, but they describe a local dialog entrance beside the Dialog's own motion. Next safe action:
  delete them in a change that owns the global styles.
- **F-02:** the header comment in `src/styles/skin-clear.css` still says not to load the vendor
  `styles.css`. `src/main.tsx` correctly loads it once, as REQ-001 requires. Only the comment is
  stale.
- **F-03:** `AtmosphereLevel` in `src/app/atmosphere.ts` still names the removed modes, but only for
  the dev gallery switcher in `src/dev/GalleryRoute.tsx`. Production selects only `full`, and the
  guard enforces this. The gallery now lists only the one shipped atmosphere, so a follow-up that
  owns the switcher can narrow the union.
- **F-04:** the specs in `docs/specs/structures/` point at `.claude/skills/chamfered-component.md`,
  which does not exist, and teach the retired ChamferedFrame + LeftColumn card. They are behaviour
  specs owned by the workout structures. Their card wording should point at ATOMIC.md §3–§4.

## Historical material

These remain as evidence only. None overrides the current contract.

- `docs/design/exports/clear-design-system-0.9.7/`, `-0.6.0/` and `-0.5.0/`: earlier exports
- `docs/design/CLEAR-0.9.7-RECONCILIATION-AUDIT.md` and the VIBE-A to VIBE-D audits: 0.9.7 migration records
- `docs/specs/design/visual-language-rules.md` and `docs/specs/design/chamfered-component.md`:
  pre-0.9 visual guidance
- `exports/clear-design-system-0.14.3/_source/`: historical input inside the current export
