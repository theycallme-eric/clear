# Working preferences

- **Show, don't describe.** When a decision depends on how something looks or moves (motion, interaction states, layout or edge treatments), build a live, clickable comparison in `explorations/` and open it for the user. Don't ask them to choose from text. Open the file in their preview and say where it is.
- Put each option's letter on it as a badge, and state the recommendation.
- **Show states that can really occur together.** Only one control is focused at a time, so a comparison that shows several focused at once misleads. Show one realistic screen state per option.

# Platforms

Phone screens are tuned tightly. Desktop applications will use the system too, but desktop layouts aren't being fine-tuned yet. Don't treat the system as mobile-only.

# Confirmed visual preferences

**The overall aim is a tube monitor / CRT feel, across everything.** Emissive phosphor light on dark glass, scanlines, mechanical stepping. When two options are otherwise equal, pick the one that reads more like a display.

From side-by-side comparisons the user picked, with the reasons they gave. Apply these without asking when a choice follows clearly from them. Build a comparison when two conflict or the choice is new territory. Never record a reason the user didn't give.

- **Pinned layers are transparent**, with content cut off at their rule. Reason: the header reads as a separate layer.
- **Glow is subtle, and more restrained than a 5px glow at 40% alpha.** Reason: it should feel emissive, like a display, capturing the CRT feel without getting messy. Strong glow is out.
- **Density is medium** (rows ~10px/12px padding, 6px gaps). Reasons: more like an instrument panel, easier to tap, calmer. Tight is too compact and roomy too large.
- **Content arrives with a row stagger.** Reason: the sequence feels alive.
- **Frames keep a solid dark ground under their tint.** The atmosphere shows between frames, not through them. Reason: a 60% ground has the right vibe but is too much to look at. (Reference the user liked: another project's context screen with solid-ground frames over a clearly visible atmosphere.)
- **Atmosphere blobs are at 40% in the Full mode** (was 30%). Picked over 30/45/60% on a reference-style layout.
- **Grouped sections use framed panels; inside a frame, sub-groups use a rule under a heading.** Reason: frames are the system's signature, but chamfered frames must not stack inside frames over and over.
- **Press is a hard cut** to a darker surface: no flash, no movement.
- **A mid-animation state change cuts and interlaces.** Glitch keeps its single meaning (failure).
- **Timer low steps in over 400ms** (`--dur-alert`, 4 steps): noticeable, but not eased.
- **Motion streaks are quiet at rest and appear only while scrolling, on both edges.** Each streak lights the line it sits on (the header rule, the frame's edge), exactly on top of it. Never a second line beside it.
- **Alignment is pixel-exact.** The user notices 1px gaps.
- **Frame borders at rest are ~90% strength.** Reasons: structure is clear without shouting; more in character.
- **Glow is a 6px spread, and only the primary action glows.**
- **Secondary buttons are a tint plus a border.** Reasons: clear hierarchy, still reads as a button, lighter than primary.
- **Text fields are fully framed. Never underline-only, never borderless.** Reasons: obviously editable; consistent with frames.
- **A checked checkbox is an outlined box with a solid block inside, no tick.** Reasons: simpler, and more CRT-like.
- **Selected chips are a 40% selection tint with a full-strength selection border and light text.** Reasons: vivid enough, and keeps the see-through feel. Measured text contrast 5.4–6.2:1 across all four skins (passes AA). The tint alone differs from an unselected chip by only 2.1–2.7:1, so the selected state must also carry its border change and a non-colour cue.
- **Glow is a 6px spread, and only the primary action glows.** Reasons: feels emissive, still clean. (Picked over 4px and 5px in a later round; earlier the user worried larger spreads would get fuzzy.)
- **Cards cut one corner only, bottom right.** Reasons: asymmetry has character, more like hardware. "For now, only ever this."
- **Card corner size scales with the card in three steps:** 8px under ~80px tall, 12px up to ~140px, 24px above. Reason: corners on similar cards always match.
- **Cards mark their title with the title alone, and may carry an 8px accent column** on the left. The column is decorative: no colour of its own, it reads the card's own surface and border variables, so it follows every state. (Round 3 picked title-only; restored as an option after an in-context comparison.)
- **Scanlines are subtle and live in the surface layer only**: drawn under the text and inside the border, never on the border or over text. Reason: added texture that's implied, not something that makes reading harder.
- **Active tab is an underline only.** "B and C are not good, only A" (tint and block marker rejected).
- **Progress is segmented, never a continuous fill.**
- **Space between framed groups is 16px.** Reasons: groups read as separate, fits more on screen, matches the density.
- **Dialog backdrop dims and carries scanlines.** Reasons: focus stays on the dialog, more CRT. Dim strength open: test 45%.
- **Radio buttons are square, the same shape as the checkbox.** Reason: consistent. Radio and checkbox then look alike, so single-choice must be clear from the group's label and layout.

- **Progress uses 20 segments.** Reason: more like hardware.

Foundations (round 4):
- **Border width stays 2px.** Reason: more like hardware.
- **Secondary text is 70% of the paragraph colour** (measured 7.0:1 in CLEAR). Reasons: clear hierarchy, easier to read.
- **Uppercase labels track at 0.05em.** Reasons: easier to read, tidier. Applied in 0.9.0: components use `--tracking-data`.
- **Card headings are 20px over 14px body.** Reasons: fits small screens, clear hierarchy.
- **Body line height stays 1.25.** Reasons: more compact, matches the density.

Single controls (round 5):
- **Controls are 40px tall** (buttons and fields). Reasons: easier to tap, matches the density.
- **Icons in buttons are 16px.** Reasons: balanced with the label, tidier.
- **Hover steps the surface up; the border stays.** Reasons: subtle is enough, clear feedback, more like a lit panel. (Keeps the border free for focus on fields.)
- **Disabled is border only**, no grey surface. Disabled controls are exempt from contrast minimums, but the label must stay legible.
- **Placeholder text is 55%** (measured 4.9:1).
- **An invalid field has an urgency border, an urgency tint and a warning glyph**, plus its message. Not colour alone.

More single controls (round 6):
- **Avoid links inside running text.** Use a distinct call to action instead. Where a text link is unavoidable, it's underlined.
- **Slider handle is square.** Reasons: more like hardware, matches the checkbox.
- **Icon-only buttons are always framed.** Reasons: reads as a button, tidier in a header, easier to tap.
- **A loading button shows a scan sweeping across it.** Reasons: clearly working, more CRT. Under reduced motion it stays visible, static.
- **Scrollbars are a 2px drawn bar in the frame's margin, visible only while scrolling.** No track, nothing at rest. Must not take up layout space or cover content. (Picked "by a long shot" over always-visible options.) **It behaves exactly like the scroll-region edge streaks**: same strength (0.7), same glow, same settle. Reason: one "scrolling" signal. This makes scroll motion a deliberate exception to "only the primary action glows".
- **Unselected chip: 5% structure tint, 90% border, surface-layer scanlines.** (Picked from a follow-up between tint + border and border only.)

Combinations (round 7):
- **Field labels sit above the field.** Reasons: compact, scans fastest.
- **Button rows (card actions and footers): stacked full width on phones, primary first; an equal-width row on wider screens, primary on the right.** One rule for both. Reasons: primary is where it's expected; saves space on wide screens.
- **Lists are one frame with rules between rows.** Reason: rows read as separate. Rules are inset at both ends to line up with the row text, never running to the frame's edge.
- **Dialog backdrop is 45% dim with scanlines.** Reasons: focus stays on the dialog, keeps context visible, more CRT.
- **Card actions are a button row underneath the content**, following the button-row rule above.
- **Units sit inside the field, in a tinted end cap behind a divider**, so they read as fixed, not editable.

- **Selected chips keep their tick.** Picked over a solid block (rejected) and no mark. Chips and checkboxes deliberately use different marks.
- **A card's title lives inside the card.** Never a separate header frame above it. Inside a frame, group with a rule under a heading. (A shared edge between two frames was liked but is less in-system.)
- **Chips flicker (interlace) when toggled.** Kept over a plain cut.
- **One surface strength per role (10%).** Emphasis from labels and position, not surface. Reason: there's no reliable way to apply quiet/strong rungs consistently.
- **Full atmosphere on every screen, always.** Quiet and Operational stay defined, unused by default.
- **Corners are 8/12/24 only;** 32px deprecated.
- **Only urgent states pulse, dimming to 80%** in two hard steps. 60% was far too much; 85% was invisible. Loading doesn't pulse.

Layouts (round 1):
- **Section labels sit above their frame**, as plain text with no frame of their own. Allowed because a label names the section; a card's own title still goes inside the card. Never a separate header *frame* above a panel.
- **The primary action is in a pinned footer** on phone screens.
- **A loading screen loads section by section**: each section keeps its label and frame, and each frame scans with its own line and cursor.
- **Forms put fields directly on the atmosphere**, no panel around them (fields are already framed; a frame around them looked messy). Applies at least to secondary screens, e.g. "Log set" opened from a session.
- **An empty list keeps its frame and shows a plain message inside it** (what's missing, what to do). The action is in the pinned footer, like every other screen. Reason: the screen looks the same once it fills. Picked over terminal status lines and a centred frame.

- **Tabs sit in a full-width band** with a line above and below, like the footer line.

Layouts (round 2). **Guidelines for extrapolating new screens, not committed pages:**
- **A summary's key numbers each get their own small frame** (picked as more in-system than one divided frame or list rows).
- **A detail screen's tabs sit in a full-width band directly under the title**, as on the App Shell.
- **Two footer actions on a phone stack full width, primary on top**, per the button-row rule.
- **Don't invent product screens.** Round 2's "active session" was a made-up hierarchy exercise, not the real screen; the user rejected it as not what an active session looks like. Base layout comparisons on real screens from the product (e.g. `_source/`, `ui_kits/app/`), or say plainly that a screen is illustrative.

**Working order: foundations first, then single controls, then combinations, then layouts.** Settle the more atomic level before calibrating anything built from it.

- **Focus is split by control type, the same on every device.** Controls that can be selected (chips, tabs, buttons, checkboxes) get corner brackets drawn outside the control. Text fields, which have no selected state, light their border instead. Reasons: focus and selected must stay visually separate (a lit border collides with selected borders, measured 1.1–1.5:1); the lit field border reads best on touch; one style per control avoids clutter. Fallback for plain-CSS use without the component layer: border lights up.

Still open:
- **Four conflicts: settled in 0.9.1.** Glow helpers removed (no border bleed, primary glow only); one backdrop (45% dim, scanlines, faint static, 1px blur); scan everywhere for loading; ChamferedFrame is a wrapper over .clr-chamfer. **A loading frame shows its heading and one line saying what's happening, ending in a blinking terminal cursor** (`.clr-cursor`), under the scan. No skeleton bars. (Picked "definitely" over label only, empty readouts, last-known-dimmed. Note: cursor plus scan are two moving things in one frame; the user accepted that.) **2px border bleed applied in 0.9.1** (`.clr-bleed` wrapper; components add it; plain-class frames must be wrapped by hand, so check for it). Backdrop: 8% static, 0.75px blur.
- **Then the full consistency scan:** done, findings in `docs/consistency-scan-0.9.1.md`. Present every visual decision it raises as a comparison.
- **Pinned for later: a 60% frame ground** (from `explorations/atmosphere-through-frames.html`, option B). The user likes its fuller vibe and may come back to it. Solid ground is the current pick.
