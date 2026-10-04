# CLEAR App: worked example

A clickable example of the system in use: Boot → Home → Generate → Workout ready → Active workout → Debrief. It's built **only** from the system's classes, tokens and rules, so it's the place to see how the parts combine.

The screens and content are older than the real product; the parts they're built from are current. Don't treat its content or flow as the product's, and base any redesign of real screens on the product itself.

## Files

- `index.html`: the prototype. Loads `../../styles.css` and mounts `FocusBrackets` from the bundle.
- `AppShell.jsx`: the system atmosphere (`.clr-atmosphere`), the page header, and the pinned footer (`.clr-footer`).
- `Primitives.jsx`: thin wrappers over system classes: `ChamferedFrame` (`.clr-chamfer`), `Card` (`.clr-card` with the accent bar), `CTAButton` (`.clr-btn`), `IconButton`, `Chip` (`.clr-chip`), `TextInput` (`.clr-field`), `Checkbox` (`.clr-check`), `Slider` (`.clr-slider`), `Segments`.
- `Screens.jsx`: the screens. `App.jsx`: navigation. `Logo.jsx`, `Icons.jsx`: brand mark and glyphs.
- `app.css`: layout only. No colours, frames or motion of its own.

## Rules it demonstrates

- Nothing floats: every group, list, form and readout is a card with its heading inside. Only large screen titles sit on the atmosphere.
- Every card carries the accent bar.
- Every screen's primary action is in the pinned footer.
- Forms sit inside one card.
- Only the primary button glows; every border has the 2px bleed.

See `../../docs/decisions.md` for the reasons.

## Where to see each behaviour

- **Atmosphere breathing, see-through cards, stroke and text glow:** every screen.
- **Cards arriving 40ms apart:** Home, on load.
- **TextAction:** "View all" on Home's Favorites card.
- **Dialog motion:** Active workout → back button → "Abandon session?".
- **Toast motion:** Debrief → Save and close.
- **Low timer (400ms step, 80% pulse):** Active workout → Log set → wait for the rest timer to run low.
- **Chip flicker, focus brackets (press Tab):** Generate.

## Not real

No AI generation (a hard-coded sample workout), scripted exercise progression, no persistence.
