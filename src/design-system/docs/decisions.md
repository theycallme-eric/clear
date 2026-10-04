# CLEAR decision record

Every visual decision below was made by the system's owner from a live, side-by-side comparison of real options. Each entry gives the decision, the reason the owner gave, and what it was picked over where that helps. Reasons are the owner's own; none are inferred.

**Use this to extrapolate.** When a new screen or component needs a choice these entries don't cover, pick the option that follows from the reasons here. If two reasons conflict, or the choice is new territory, ask the owner with a comparison rather than guessing.

The comparison pages themselves were deleted once each decision was recorded, so rejected options can't be mistaken for current guidance. **The winning version of each decision is live in the system**, and these are the places to see it:

| To see | Open |
|---|---|
| Every control in every state (selected, hover, press, disabled, focus brackets, invalid) | `preview/states-gallery.html` |
| Every motion rule, live (hover, press, toggle, interruption, pulse, reduced motion) | `preview/motion-rules.html` |
| The light rules: 2px bleed, 6px primary glow, scroll streaks | `preview/shadows.html` |
| Corner sizes by height | `preview/corners.html` |
| Atmosphere at Full | `preview/atmosphere-modes.html` |
| Frame roles and the 10% surface | `preview/frame-roles.html` |
| Measured contrast, all four skins | `preview/contrast-audit.html` |
| Each component on its own | `components/<Name>/card.html` |
| Cards, containment, forms, footers and layout together on real screens | `ui_kits/app/index.html` |
| Starting points for new screens | `templates/` |

---

## The aim

**A tube monitor / CRT feel, across everything:** emissive phosphor light on dark glass, scanlines, mechanical stepping. When two options are otherwise equal, pick the one that reads more like a display.

**Alignment is pixel-exact.** The owner notices 1px gaps.

**Phone screens are tuned tightly.** Desktop applications use the system too, but desktop layouts aren't fine-tuned yet. Don't treat the system as mobile-only.

## Terms

- **Frame:** the chamfered container: 2px border, one corner cut, solid ground, scanlines (`.clr-chamfer`).
- **Card:** a frame with the 12px accent bar and a heading inside, holding one thing or one group (`Card`, or `.clr-card`).
- **Element frame:** a small frame around one item, interactive or not: button, chip, field, streak day, tag. Never has an accent bar or a heading.
- **Layer:** the pinned header, footer and tab band. Transparent, full width, a line on the edge facing the content. Never a frame.
- **Overlay:** a frame that sits above the screen and goes away on its own or when dismissed: `Dialog`, `Toast`. No accent bar. A toast may cover the footer action, because it's temporary and dismissable. "That's literally what they are." Picked over treating them as cards.

`TimerDisplay`, `ScanLoader` and `EmptyState` are cards, so they carry the bar.

**Nesting:** a card holds content and element frames, never another card. Sub-groups inside a card use a rule under a heading. (Follows from "frames must not stack inside frames over and over".)

The owner had used "card" loosely for any chamfered frame; these terms were agreed on 1 Oct 2026 to stop that ambiguity.

---

## Foundations

| Decision | Reason | Picked over |
|---|---|---|
| Borders are 2px | More like hardware | 1px, 3px |
| Frame borders at rest are 90% strength | Structure is clear without shouting; more in character | 30% (far too little), 50% (not enough), 100% (too much) |
| Every stroke and every letter emits light: lines stay crisp, with a tight halo (1.5px at 80%) and a wide one (5px at 35%); text gets the same faint glow | The fuzz of an old monitor should come from light, not blur. Blurring only the lines was jarring next to sharp text | Blurred lines (phosphor); colour fringes (too blurry); whole screen soft; a 2px bleed only |
| A card's dark ground is 70% opaque, so the atmosphere shows through slightly; element frames stay solid | Helps the glow feel; "see the background ever so slightly" | Solid; 90%; 80%. (60% earlier was too much to look at) |
| Scanlines are subtle and live in the surface layer only: under text, inside the border | Texture that's implied, never something that makes reading harder | Over everything; none |
| One atmosphere on every screen, blobs at 40%. No per-screen modes (Quiet and Operational were removed: unused) | Matched the reference screen the owner liked | 30%, 45%, 60%; Quiet / Operational per screen |
| One surface strength per role (10%) | Emphasis comes from labels and position; quiet/strong rungs can't be applied consistently | Three rungs |
| Secondary text is 70% of the paragraph colour | Clear hierarchy, easier to read | 55%, 85% |
| Uppercase labels track at 0.05em | Easier to read, tidier | 0.08em, 0.14em |
| Card headings are 20px over 14px body | Fits small screens, clear hierarchy | 16px, 24px |
| Body line height is 1.25 | More compact, matches the density | 1.45, 1.6 |
| Density is medium: rows ~10–12px padding, 6px gaps | More like an instrument panel; easier to tap; calmer | Tight (too compact), roomy (too large) |
| 16px between framed groups | Groups read as separate; fits more on screen; matches the density | |

## Light

| Decision | Reason | Picked over |
|---|---|---|
| Only the primary action glows, at 6px | Feels emissive, still clean | 4px, 5px; glow on timers, text and boxes (removed) |
| Scroll streaks and the scrollbar light up only while scrolling, on both edges, then settle | One "scrolling" signal; quiet at rest | Always-lit edges |
| Each streak lights the line it sits on, exactly on top of it | Never a second line beside it | |

## Motion

| Decision | Reason | Picked over |
|---|---|---|
| Content arrives with a row stagger, 40ms apart | The sequence feels alive; at 40ms it reads as one arrival with a ripple | All at once; 60ms; 100ms |
| Dialogs and toasts arrive and leave with phosphor, peaking at 120% brightness | Keeps the effect without a flash; 240% was jarring across a whole panel | Cut; materialize; CRT on/off; 240% and 140% peaks; no brightening |
| A dialog's backdrop fades in and out over 200ms in four hard steps | It popped in under the dialog, which was most of what felt jarring | Cut; 8 steps over 300ms; backdrop first, then dialog |
| Atmosphere blobs breathe: each stretches one way then the other and turns slightly, 4.5–6.5s per breath, out of step, on top of the drift. Never brighter | "Lava-lamp vibes." Kept cheap: scale and rotate only, never a repaint, so it doesn't heat phones | Drift only; expand and contract; reshape and dim |
| Press is a hard cut to a darker surface | No flash, no movement | Flash; scale |
| Hover steps the surface up; the border stays | Subtle is enough; clear feedback; like a lit panel; keeps the border free for focus | Border change |
| A state change mid-animation cuts and interlaces | Glitch keeps its single meaning: failure | Glitch on interrupt |
| Timer low steps to red over 400ms in 4 steps | Noticeable, but not eased | Instant; eased |
| Only urgent states pulse, dimming to 80% in two hard steps | 85% was invisible; 60% far too much | Pulse on loading; "always on" pulse |
| Chips flicker (interlace) when toggled | Kept, by preference | Plain cut |
| Focus snaps on, never animated | | |

## Single controls

| Decision | Reason | Picked over |
|---|---|---|
| Controls are 40px tall | Easier to tap; matches the density | 32px, 48px |
| Icons in buttons are 16px | Balanced with the label; tidier | 14px, 20px |
| Secondary buttons are a tint plus a border | Clear hierarchy; still reads as a button; lighter than primary | Outline only; text only |
| Icon-only buttons are always framed | Reads as a button; tidier in a header; easier to tap | Bare icon |
| A loading button shows a scan sweeping across it, label kept | Clearly working; more CRT | Spinner; ticks |
| Disabled is border only, no grey surface | Label must stay legible | Grey fill |
| The accent bar is 12px, one width everywhere | At 8px it read as a thin double line; 12px looks intentional | 8px; 16px; several sizes |
| The four mood faces are round and line-drawn: the one exception to the icon set's "no circles, no curves" rule | Liked them better than the solid square faces. The octagonal line version "felt super forced" | Solid square faces (what shipped); octagonal line faces |
| Text fields are fully framed, with the same 8px bottom-right cut as buttons and chips | Obviously editable; one shape for every framed control. A square field's corner sat awkwardly against a card's cut | Underline-only, borderless (never); square corners; a cut matching the card's |
| Field labels sit above the field | Compact; scans fastest | Inside, beside |
| Placeholder is 55% | Measured 4.9:1 | 45% |
| An invalid field has an urgency border, urgency tint and a warning glyph inside the field, plus its message | Not colour alone | Colour only |
| Units sit inside the field in a tinted end cap behind a divider | Reads as fixed, not editable | Plain suffix |
| Checked checkbox: an outlined square with a solid block inside, no tick | Simpler; more CRT | Tick; filled box |
| Radio buttons are square, like the checkbox | Consistent. Single choice must then be clear from the group's label and layout | Round |
| Slider handle is square | More like hardware; matches the checkbox | Round, rectangle |
| Unselected chip: 5% tint, 90% border, scanlines | | Border only |
| Selected chip: 40% selection tint, full selection border, light text, and a tick | Vivid enough; keeps the see-through feel. The tint alone differs from unselected by only 2.1–2.7:1, so the border and tick must carry the state | Solid fill with dark text; solid block mark (rejected); no mark |
| Chips and checkboxes deliberately use different marks (tick vs block) | | |
| Active tab is an underline only | "Only A" | Tint; block marker |
| Progress is segmented, 20 segments, never a continuous fill | More like hardware | 10, 30 |
| Scrollbar: a 2px drawn bar in the frame's margin, visible only while scrolling, same strength, glow and settle as the streaks | Picked "by a long shot"; one scrolling signal | Always-visible bars |
| Avoid links inside running text; use a distinct action. A text link that can't be avoided is underlined | | |
| The quietest action (DS-009) is a label in the action colour ending in ›, no frame (`TextAction`) | Lightest, and the chevron is a non-colour cue. Brackets were liked but would read as focus brackets | Quiet button; [ bracketed ]; underlined link |

## Focus

**Split by control type, the same on every device.** Controls that can be selected (buttons, chips, tabs, checkboxes) get corner brackets drawn outside the control. Text fields light their border instead.

Reasons: focus and selected must stay visually separate (a lit border collides with selected borders, measured 1.1–1.5:1); the lit field border reads best on touch; one style per control avoids clutter. Picked over a lit border everywhere (too jarring) and brackets everywhere (the owner kept seeing brackets in states that never occur together).

## Cards and frames

| Decision | Reason | Picked over |
|---|---|---|
| One corner cut, bottom right only | Asymmetry has character; more like hardware. "For now, only ever this." | Two or four corners |
| Corner size by height: 8px under ~80px, 12px to ~140px, 24px above | Corners on similar cards always match | Fixed; scaling smoothly |
| Every card carries the 12px accent bar | One card style, nothing to remember | Bars on content cards only; no bars |
| The accent bar has no colour of its own; it reads the card's surface and border | It's decorative, so it follows every state automatically | A bar colour token |
| A card's title lives inside the card | A separate header frame above it feels disjointed | Header frame above; shared edge (liked, but less in-system) |
| Inside a card, sub-groups use a rule under a heading | Chamfered frames must not stack inside frames over and over | Nested frames |
| Lists are one frame with inset rules between rows | Rows read as separate; rules line up with row text, never run to the edge | Separate frames per row |

## Layout

**These are guidelines for extrapolating new screens, not committed pages.**

| Decision | Reason | Picked over |
|---|---|---|
| Nothing floats. Every component, group and form sits in a card; only a large screen title (e.g. "Today") sits on the atmosphere | | Labels and readouts loose on the atmosphere |
| The boot screen follows "nothing floats": the logo is its title; its status lines sit in a card | No exception to remember | Status on the atmosphere; urgency-coloured card for a failure |
| Section labels are the card's heading, inside it | Supersedes an earlier "labels above the frame" rule | Label above the frame |
| Pinned layers (headers, footers) are transparent, with content cut off at their rule | The header reads as a separate layer | Filled layers |
| The primary action is in a pinned footer | Stays in the same place on every screen | In the header; at the end of content |
| Two footer actions on a phone stack full width, primary on top; on wider screens an equal-width row, primary on the right | Primary is where it's expected; saves space on wide screens | Primary plus text action |
| Every form sits inside one card: title above, fields inside, action in the footer | Corrected twice by the owner: it applies to every form, not just primary ones, and fields never sit loose on the atmosphere | Fields on the atmosphere |
| Tabs sit in a full-width band with a line above and below, directly under the title | Matches the footer line | Tabs inside content |
| A summary's key numbers each get their own small card | More in-system | One divided frame; list rows |
| Loading is per section: each card keeps its heading, scans, and shows one line ending in a blinking cursor | Sections can arrive one by one; no skeleton bars | One screen loader; skeletons; dashed readouts |
| An empty list keeps its card and shows a plain message inside; the action stays in the footer | The screen looks the same once it fills | Centred frame; terminal status lines |
| Dialog backdrop: 45% dim, scanlines, faint static (8%), 0.75px blur | Focus stays on the dialog; context stays visible; more CRT; slightly out of focus | 80% flat |

---

## How decisions were made

- **Atomic first:** foundations, then single controls, then combinations, then layouts. Settle a level before calibrating anything built from it.
- **One difference per comparison**, everything else identical, so the pick carries its reason.
- **Real screens only.** A made-up "active session" screen was rejected as not what the product looks like. Base comparisons on real screens, or say plainly that a screen is illustrative.
- **Show states that can occur together.** Only one control is focused at a time.

## Open

- **Desktop layouts** aren't tuned yet.
