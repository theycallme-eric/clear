# CLEAR — visual asset handoff

Prepared 3 November 2026, America/Chicago; updated through R145. Self-contained context for the visual-work channel; attach or paste this document when consolidating work from other chats.

## What this brief is for

Consolidate CLEAR's icons and general imagery into one visual backlog. The confirmed new asset need from this workout-refinement thread is equipment-icon coverage. Broader imagery below is a set of areas to scope, not a claim that every illustration has been requested or approved. Merge any additional decisions from the visual channel into this inventory with their source and status.

CLEAR is a workout application with a low-tech sci-fi / cyberpunk instrument-panel feel: industrial, utilitarian, stamped glyphs, angular frames and a coordinated CRT treatment. The repository and executable shared-component gallery are the authoring authority. Existing 0.14.3 files are preserved historical inputs; new approved assets belong in shared app-owned source.

Current context: Round 6 visual intake is complete; a local Round 7 comparison is ready. It carries dialog-based logging, compact ladder prescriptions, tracked ladder progress with Undo, shared spacing/frame fixes and timer urgency. Section 4 A / equipment beside movement names is selected over the previous dedicated line (R132). During Round 7 intake, Eric selected A / Balanced dialog focus. Compact equipment beside movement names is also selected (R132); other choices should not be inferred as approved merely because they appear in the preview.

## 1. Confirmed equipment coverage

The current setup and Locations taxonomy has 16 equipment IDs. Create a coherent equipment family that can support movement rows, Required equipment summaries and setup/location choices. These are possible reuse contexts, not authorization to redesign every surface. Keep readable labels with the selected compact equipment placement; icon artwork is a separate visual decision.

| Equipment | Current setup ID | Asset status / next step |
| --- | --- | --- |
| Bodyweight | `bodyweight` | No dedicated equipment glyph. Decide whether text is sufficient; the existing User icon is not automatically the right meaning. |
| Resistance bands | `resistance_bands` | Dedicated glyph wanted. |
| Foam roller | `foam_roller` | Dedicated glyph wanted. |
| Dumbbells | `dumbbells` | Reuse existing `Dumbbell`. |
| Kettlebells | `kettlebells` | Dedicated glyph wanted; directly visible in the reviewed workouts. |
| Pull-up bar | `pullup_bar` | Dedicated glyph wanted. |
| Barbell | `barbell` | Dedicated glyph wanted; `WeightPlate` is not an equivalent symbol. |
| Plyo box | `box` | Dedicated glyph wanted. |
| Cable machine | `cable_machine` | Dedicated glyph wanted. |
| Rowing machine | `rowing_machine` | Dedicated glyph wanted. |
| Assault bike | `assault_bike` | Dedicated glyph wanted. |
| Battle ropes | `battle_ropes` | Dedicated glyph wanted. |
| Assisted pull-up / dip | `assisted_pullup_dip` | Dedicated glyph wanted; preserve the current combined category. |
| Leg press | `leg_press` | Dedicated glyph wanted. |
| Leg curl / extension | `leg_curl_extension` | Dedicated glyph wanted; preserve the current combined category. |
| Hack squat | `hack_squat` | Dedicated glyph wanted. |

Additional coverage:

- **Medicine ball:** dedicated glyph wanted for the Wall ball review example. Medicine ball is a fixture equipment label, not one of the 16 current setup IDs. Do not invent a new catalog ID or assume taxonomy work is approved.
- **Weight plate:** `WeightPlate` already exists. Use it when the meaning is plates.

Suggested first comparison batch: existing Dumbbell + WeightPlate as references, then **Kettlebell, Medicine ball and Barbell**. Resolve Bodyweight as a text-versus-glyph decision. This ordering is a recommendation for the visual channel, not a previously approved asset priority.

## 2. Reuse the existing UI icon vocabulary

There are **75 exported icon components**, not an empty icon library. Existing controls and domain concepts do not need speculative replacements:

| Family | Examples already available |
| --- | --- |
| Navigation and actions | Arrows, chevrons, Menu, X, Plus, Minus, Check, Search, Filter, Sliders, Pencil, Copy, Share, upload/download |
| Timer and workout structure | Clock, Stopwatch, Rest, Play, Pause, Stop, Skip, Circuit, Ladder, Superset, Log |
| Feedback and state | Warning/check/error/info/help badges, loading/refresh, visibility and notification glyphs |
| Fitness, progress and goals | Dumbbell, WeightPlate, Pulse, Streak, Trophy, Target, Crosshair, Gauge, Flame, Star, Zap |
| Account and access | User, Lock, Unlock, Key, LogIn, LogOut |
| Effort expressions | Frown, Meh, Smile, SmilePlus, ThumbsDown, ThumbsUp |

**Preserve the approved face exception.** Most icons are solid angular glyphs, but the current source explicitly retains four round, line-drawn faces after comparison. Set/block Effort reuses Frown, Meh and Smile. The session's separate five-step feeling question currently shows numbers 1–5. Do not redraw the faces into squares, replace the effort control, or make these two questions share a new scale.

The historical `icon-set-prompt.md` predates the present implementation. Its “new icons” list contains many icons that now exist, and its no-round-faces instruction is superseded by the explicit current-source exception. Use it as historical design context, not a live production queue.

## 3. General imagery — consolidate and scope

No new general illustration or photography set was selected in the workout-refinement discussion. The inspected app UI is primarily text, shared SVG glyphs, geometric frames and procedural effects. Review screenshots and old design uploads are evidence, not a production image library.

Bring these areas into the visual channel's consolidated inventory, marking each as **existing**, **proposed**, **approved** or **deferred**:

| Area | Current context / decision to make |
| --- | --- |
| Brand marks | `ClearLogo` wordmark/icon already exists. The app also has a geometric C mark, four skin favicons and generated install/touch icons. Reuse these before proposing a new mark. |
| App/install icons | Existing scalable icon plus generated 192px, 512px, maskable 512px and Apple touch 180px outputs. A brand revision needs a coordinated source update, not individually redrawn exports. No revision is selected here. |
| Social/share imagery | A historical 1200×630 `og-image.svg` exists. Decide whether a refreshed social card or reusable workout/report share-card template is wanted. Do not assume that historical asset is currently wired to production metadata. |
| Movement imagery | Exercise demonstrations, pose illustrations or schematic movement plates are possible future work. No movement image list, medium, coverage count or placement has been approved in this thread. Scope against the real catalog before producing a large set. |
| Goal/body-area/pattern visuals | Possible diagrams or glyphs for training goals, body areas and movement patterns. Existing Target/Crosshair/Gauge glyphs may already fit. No one-icon-per-category requirement has been selected. |
| Empty/first-use/recovery/completion art | Consider only where an illustration helps a specific state. Existing shared state views and Trophy/Streak/Rest glyphs may be enough. No blanket illustration replacement is selected. |
| Environment/background artwork | The established atmosphere is mainly procedural CRT/glass treatment. Any additional art or texture should have a named use and avoid competing with readable workout data. No new bitmap backdrop is selected. |

For any proposed image, name its destination, purpose, dimensions/crop behavior and whether it is decorative or conveys information. This will let the implementation channel adopt a concrete asset instead of guessing its use.

## 4. Shared visual rules

For new equipment and utility icons:

- Use editable SVG masters, a 24×24 viewBox and `currentColor`; match the existing solid geometric family and optical weight.
- Keep orthogonal/45-degree geometry, angular or chamfered silhouettes and details that survive 16px rendering. The four approved expression faces remain their documented exception.
- Review at 16, 20, 24 and 32px; show the whole proposed family together with the existing Dumbbell and WeightPlate.
- Check Clear, Signal, Vapour and Mono. Read semantic roles/currentColor; do not bake a single skin's neon colors into shared icon paths.
- Keep a text fallback and accessible meaning. An equipment glyph should support the label; icon-only equipment presentation is not selected.
- Keep glow, Echo, shadows and scanlines out of SVG paths and image masters. Effects are applied by the shared rendering system.

For larger imagery, agree on vector versus raster per use. Retain an editable source, intended crop/aspect ratio, and a transparent version when the art is a cutout. Supply an unprocessed master so shared effects can be composed consistently.

## 5. Effects coordination — context for the visual channel

Phosphor Echo and CRT glass are already separate shared-system work, not a request to draw another set of raster overlays:

- **Echo:** one canonical kernel/preset and source-role colors; soft, translucent filled rear silhouette offset left/down and masked beneath the foreground. No baked-in duplicate shadow/glow variant per asset.
- **Eligibility:** standalone timer outer frames and dialog outer silhouettes can own Echo. Contents, nested timers, text, inputs and buttons stay sharp according to the shared containment rules. Check the actual API on the destination branch; paths may change when the effects work merges.
- **CRT glass:** one coordinated scanline/grain/vignette/edge-softness layer in front of app content, including native dialogs, with pointer events passing through. Do not add a separate local CRT layer to every asset or component.
- **Logging backdrop:** dialog is preferred. Darker dimming, more blur, darker outer corners and softer separation are being compared; foreground content stays readable. R127 selects the reviewed A / Balanced strength; B/C are too dark. The separate long-log frame/surface scrolling bug (R128/R129) has been corrected locally with inner scrolling and a stationary complete frame.
- **Deadline cue:** R133 calls for a soft, blurred, faded warning vignette with a smooth pulse; the current hard outline/stepped pulse is not approved. Low-time color at 10 seconds remaining, stronger peripheral pulse at 5; apply to actual countdowns/deadlines including EMOM and count-up caps. Elapsed-only session clocks do not warn. No full-screen flash; reduced motion retains a steady cue. R135 supplies the exact recovered effect:inset70px urgency-a400 shadow,1.5s ease-in-out,.2→.8→.2 opacity; reduced motion static.5. Visual authority is limited to that effect. The shared restoration is applied in the final local Round 7 preview at http://127.0.0.1:64457/#urgency; do not import other old preview patterns.

Round 7 does not claim that the final effects branch is integrated. Asset work should coordinate with it rather than fork it.

## 6. What to hand back

1. One asset inventory with semantic ID, status, intended use, existing reference, source/export paths and any open meaning question.
2. The small equipment comparison batch first, then the remaining agreed coverage.
3. SVG masters plus a contact sheet at working sizes and in all four skins. Raster imagery gets agreed dimensions/crops and editable originals.
4. Explicit design choices and unresolved questions. Keep optional image ideas distinct from approved production assets.

This document requests consolidation and visual development. It does not authorize a new logo, equipment taxonomy changes, production UI adoption, merging the effects branch or deployment.

## Source references

Repository-relative paths are lookup hints; commits and semantic owners identify the work if files move.

- `docs/design/library/EQUIPMENT-ICON-WANTED-LIST.md` — grounded equipment inventory.
- `docs/design/library/WORKOUT-REVIEW-FEEDBACK-2026-10-31.md` — 24 consolidated items, R01–R136; especially equipment/icon notes R121–R122 and selected placement R132, backdrop R110/R127 and timer scope R126.
- `src/state/onboarding.ts` — current 16 equipment IDs, shared with Locations.
- `src/design-system/assets/icons.tsx` and `src/design-system/index.d.ts` — actual public icons and the approved face exception.
- `src/design-system/assets/ClearLogo.tsx`, `public/icon.svg`, `public/icons/favicon-*.svg`, `scripts/generate-pwa-icons.mjs`, `public/manifest.webmanifest` — brand/app icon sources and outputs.
- `src/design-system/assets/og-image.svg` — historical social preview asset.
- `src/ui/set-effort.tsx`, `src/ui/feeling-row.tsx` — distinct effort/feeling presentations.
- [Pinned Phosphor Echo handoff reference](https://github.com/theycallme-eric/clear/blob/80a089b3f9f32726105eae83a033c724d2537692/docs/effects/README.md) — verify the merged API before implementation.
- Round 7 application source: local commit `96a9745`, branch `codex/workout-review-r7-2026-11-03`; handoff receipt `docs/design/library/ROUND-7-LOCAL-REVIEW-2026-11-03.md`. Local review at `http://127.0.0.1:64454/` requires the server on Eric's computer.
- [Preserved hosted Round 6](https://clear-o8ssjcili-erics-projects-0ade0dda.vercel.app/workout-review-r6/) — visual context preceding Round 7, not the latest implementation.

## Appendix — all 75 existing icon exports

`ChevronRight`, `ChevronLeft`, `ChevronDown`, `ChevronUp`, `ArrowRight`, `ArrowLeft`, `ArrowUp`, `ArrowDown`, `SortAsc`, `SortDesc`, `Menu`, `X`, `Plus`, `Minus`, `Check`, `Search`, `Filter`, `Sliders`, `Trash`, `Copy`, `Download`, `Upload`, `Share`, `Play`, `Pause`, `Stop`, `Skip`, `Pencil`, `Maximize2`, `Lock`, `Unlock`, `Key`, `LogIn`, `LogOut`, `Calendar`, `CalendarCheck`, `Clock`, `Stopwatch`, `Rest`, `RefreshCw`, `Loader2`, `CircleCheck`, `CircleX`, `CircleAlert`, `AlertCircle`, `AlertTriangle`, `HelpCircle`, `Info`, `Eye`, `EyeOff`, `Bell`, `BellOff`, `Zap`, `Flame`, `Star`, `Trophy`, `Dumbbell`, `WeightPlate`, `Pulse`, `Streak`, `Circuit`, `Ladder`, `Superset`, `Log`, `FileText`, `Gauge`, `Target`, `Crosshair`, `User`, `Frown`, `Meh`, `Smile`, `SmilePlus`, `ThumbsDown`, `ThumbsUp`.

## Latest Section 5 decision — R144

The recovered soft outside aura is confirmed as the intended appearance. Section 5 is approved subject to synchronizing the active deadline timer and aura pulse rhythm/phase. Coordinate both visual pulses using the accepted smooth 1.5-second cycle, independently of numeric countdown ticks; preserve the recovered soft vignette and 10/5-second scope. Keep smooth breathing rather than matching the old stepped micro-pulse. Intake only: synchronization is queued, not applied to the served preview.

## Consolidation ruling — R145

Visual intake is closed. The owner delegates the five understood polish criteria without another visual review; synchronize the accepted smooth warning cycle during implementation. Preserve confirmed compact equipment and existing icon inventory/text fallback. The visual-assets/effects work remains coordinated through its own owners, with no invented glyph approval or copied effects kernel. The final consolidated package preserves the full history and acceptance criteria for requirements.
