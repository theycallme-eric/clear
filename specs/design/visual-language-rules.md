# Clear — Visual Language Rules

> **Status:** ACTIVE
> **Purpose:** Quick reference for how Clear looks, feels, and behaves visually. Read this before making any UI decisions.
> **Audience:** Claude (context planning), the implementation agent (implementation), and any future contributors

---

## 1. Corners

**There are no rounded corners in Clear. None. Zero.**

- Every corner is either **sharp (90°)** or **chamfered (angled cut on bottom-right)**
- `--radius: 0px` is set globally
- If you're about to write `rounded-*` in a className, stop. Use sharp edges or ChamferedFrame.
- The chamfered cut is always bottom-right, created via `clip-path` with `--corner-cut-size` (default 8px)

---

## 2. Color Roles (Orange Mode = Default)

Colors in Clear have strict functional assignments. They are not decorative — each color tells the user what something *is*.

### Orange = Structure
Orange defines the skeleton of the interface. Borders, surfaces, accent bars, card frames. Orange says "here is a container" or "here is a boundary." It is the architectural color.

- Card borders: `--border-card` → orange-500
- Card surfaces: `--surface-card` → orange at 15% opacity
- Accent bars (LeftColumn): `--surface-card-accent` → orange at 40% opacity
- CTA surfaces: `--surface-cta-primary` → orange at 40% opacity

### Blue = Interactive / Content
Blue is the action color and the primary reading color. Anything the user reads or taps is blue. Headers, exercise names, CTA text, chevrons, icons, links — all blue.

- Text headers: `--text-header` → blue-300
- Paragraph text: `--text-paragraph` → blue-100
- CTA text: `--text-cta` → blue-100
- CTA icons: `--icon-cta` → blue-500
- Interactive affordances (chevrons, +, expand/collapse): blue-500

**Rule: ALL interactive elements are blue in orange mode.** This includes buttons, chevrons, plus icons, text links, toggle controls, and any tappable affordance. If a user can interact with it, it's blue.

### Green/Lime = Data & Measurement
Green is the "numbers" color. Timers, scores, success confirmations, selected states. Anything that represents a measured value or positive completion.

- Timer text: `--text-timer` → green-400
- Timer labels: `--text-label-timer` → green-500
- Success surfaces: `--surface-success` → green at 60% opacity
- Selected radio: `--surface-radio-selected` → green at 60% opacity
- Active progress indicators: green-500

### Rose/Red = Error & Destructive
- Error surfaces: `--surface-error` → red at 60% opacity
- Destructive actions (Sign Out): rose/red text
- Toast error: red fill + left accent

### Purple = Info & Neutral Status
- Info surfaces: `--surface-info` → purple at 60% opacity
- Toast info: purple fill + left accent

### Neutral = Disabled & Inactive
- Disabled text: `--text-disabled` → neutral-400
- Disabled surfaces: `--surface-disabled` → neutral at 30% opacity
- Inactive borders: `--border-disabled` → neutral-400
- Inactive input fields: neutral borders (no orange)

---

## 3. Theme Swap Rule

Clear has two modes: orange (default) and blue (`data-theme="blue"`).

**The rule is simple: the structural and interactive colors swap.**

| Role | Orange Mode | Blue Mode |
|------|------------|-----------|
| Structural (borders, surfaces, accent bars) | Orange | Blue |
| Interactive (text, CTAs, icons, affordances) | Blue | Orange |
| Data (timers, scores, selected) | Green | Green (unchanged) |
| Error | Red | Red (unchanged) |
| Info | Purple | Purple (unchanged) |

Green, red, and purple are constant across both themes. Only the structural/interactive pair swaps.

---

## 4. Container Hierarchy

Clear uses a strict layering system. From back to front:

### Layer 0: Page Background
- Textured gradient image (different for mobile/desktop)
- Dark overlay: `rgba(23, 23, 23, 0.35)`
- Grain texture on top at 3% opacity
- This is never a flat color — it has depth

### Layer 1: Section Cards (ChamferedFrame + LeftColumn)
- Every major content group lives in a ChamferedFrame
- Most cards have a LeftColumn accent bar on the left side
- Surface: `--surface-card` (orange at 15% alpha — very subtle, lets background show through)
- Border: `--border-card` (orange-500, solid, 1-2px)
- The chamfered corner is always bottom-right

### Layer 2: Content Inside Cards
- Content inside cards does NOT get additional containers or frames in its resting state
- Exercise names, labels, data — these are plain text directly inside the card
- Dividers between items: thin horizontal lines (when appropriate), NOT nested cards
- Expanded states may add subtle background shifts but avoid nesting full card frames

### Layer 3: Interactive Overlays
- Toasts, modals, bottom sheets sit on top
- Same ChamferedFrame + LeftColumn pattern
- Use semantic surface colors (success/error/info)

**Anti-pattern: Don't nest ChamferedFrames inside ChamferedFrames** unless there's a strong reason (like an input field inside a card). When something needs visual grouping inside a card, use spacing, dividers, labels, or subtle background shifts — not more frames.

---

## 5. Component Anatomy

### Cards (ChamferedFrame + LeftColumn)
```
┌──┬──────────────────────────────┐
│▐▐│                              │  ← LeftColumn (accent bar)
│▐▐│  Content goes here           │  ← ChamferedFrame (main body)
│▐▐│                              │
│▐▐│                         ╱    │  ← Chamfered bottom-right corner
└──┴────────────────────────╱─────┘
```

- LeftColumn: 8px (sm) or 12px (md) wide, solid accent fill
- ChamferedFrame: `-ml-[2px]` overlap to merge borders with LeftColumn
- `hasLeftBorder={false}` on ChamferedFrame when paired with LeftColumn

### Buttons (Action Buttons)
- Same ChamferedFrame + LeftColumn pattern
- Primary: filled surface (orange alpha), blue text + blue icons
- Secondary/Ghost: transparent, outline only, blue text
- Disabled: neutral surface, neutral text
- Icon slots on left and/or right (optional)

### Inputs
- Active/focused: orange border, dark surface
- Inactive/empty: neutral border, dark surface
- Some inputs use a left accent stripe (`cyber-input`: green left border)
- Placeholder text: muted, lighter than active text

### Toasts
- ChamferedFrame + LeftColumn
- Left accent bar is a brighter shade of the semantic color
- Surface is the semantic color at medium opacity
- Icon + text in dark color for contrast
- Error = rose, Info = purple, Success = lime

---

## 6. Typography

### Font Families
| Font | Token | Use For |
|------|-------|---------|
| Rajdhani | `--font-headings` | Headings, section titles, labels, uppercase structural text |
| Space Grotesk | `--font-paragraph` | Body text, descriptions, coaching cues, notes |
| Oxanium | `--font-label` | Labels, badges, small data annotations |

### Rules
- Headings and labels are almost always **uppercase**
- Timer/data values use Oxanium (the monospace-like label font)
- Body text (descriptions, coaching cues) is Space Grotesk, sentence case
- Font weights: Regular (400), Medium (500), Bold (700)

### Color Assignments
- Headings: `--text-header` (blue-300 in orange mode)
- Body text: `--text-paragraph` (blue-100 — lighter, softer)
- Labels/annotations: `--text-label-info` (blue-100)
- Timer values: `--text-timer` (green-400)
- Disabled: `--text-disabled` (neutral-400)

---

## 7. Interactive vs. Data vs. Decorative

Every visual element in Clear falls into one of three categories. The treatment depends on which category it belongs to.

### Interactive (user can tap/act on it)
- **Color:** Blue text/icons in orange mode
- **Container:** ChamferedFrame with borders (if a button/card)
- **Affordance:** Chevron, +, expand arrow, or tap highlight
- **Examples:** CTAs, navigation cards, expand/collapse chevrons, add-note plus, text links

### Data (measured values, status indicators)
- **Color:** Green/lime for active data. Neutral for inactive/historical.
- **Container:** None — plain text, no frames. Frames only appear when data becomes interactive (like ladder rungs after cap hit).
- **Font:** Oxanium or monospace for numeric values
- **Examples:** Timer countdown, round counts, rep scheme numbers, streak count, weight values

### Decorative / Structural (frames, borders, backgrounds)
- **Color:** Orange (structural)
- **Purpose:** Define boundaries, group content, establish hierarchy
- **Examples:** Card borders, accent bars, divider lines, progress bar tracks

**The test:** If you're adding a new element, ask: "Can the user tap it?" → Blue. "Does it show a number or status?" → Green, no container. "Does it group or frame content?" → Orange structural.

---

## 8. Spacing

Uses a scale defined in `--spacing-*` tokens:

| Token | Value | Common Use |
|-------|-------|------------|
| spacing-100 | 4px | Tight gaps (within a label group) |
| spacing-200 | 8px | Between related items (exercises in a list) |
| spacing-300 | 12px | Component internal padding |
| spacing-400 | 16px | Standard card padding, between sections |
| spacing-600 | 24px | Between major card groups |
| spacing-700 | 32px | Between page sections |

**Rule:** Items that are conceptually grouped should have tighter spacing than items that are separate. Exercises within a round = tight. Cards on a page = wider.

---

## 9. States

### Input Fields
| State | Border | Surface | Text |
|-------|--------|---------|------|
| Empty/inactive | Neutral | Dark | Placeholder (muted) |
| Active/focused | Orange | Dark | Blue-100 |
| Filled | Orange | Dark | Blue-100 |
| Disabled | Neutral-400 | Neutral alpha | Neutral-400 |

### Cards
| State | Border | Surface | Accent Bar |
|-------|--------|---------|------------|
| Default | Orange-500 | Orange alpha-150 | Orange alpha-400 |
| Expanded | Orange-500 | Orange alpha-150 | Orange alpha-400 |
| Disabled | Neutral-400 | Neutral alpha-300 | Neutral |

### Buttons
| State | Surface | Border | Text | Icons |
|-------|---------|--------|------|-------|
| Primary default | Orange alpha-400 | Orange-500 | Blue-100 | Blue-500 |
| Primary hover | Orange alpha-600 | Orange-400 | Blue-500 | Blue-500 |
| Primary disabled | Neutral alpha-300 | Neutral-400 | Neutral-400 | Neutral-400 |
| Secondary default | Transparent | Orange-500 | Blue-100 | Blue-500 |
| Secondary hover | Orange alpha-200 | Orange-600 | Blue-500 | Blue-500 |
| Destructive | Transparent | None | Red-500 | Red-500 |

---

## 10. Anti-Patterns (Never Do This)

1. **No rounded corners.** Not `rounded-sm`, not `rounded-md`, not `rounded-full`. Zero.
2. **No hardcoded color values.** Always use CSS custom properties from `index.css`.
3. **No orange text for interactive elements** in orange mode. Orange is structural. Blue is interactive.
4. **No ChamferedFrames around passive data.** Data elements (numbers, timer values, rep schemes) are plain text until they become interactive.
5. **No nested ChamferedFrames** without strong justification. Use spacing and labels to create hierarchy inside cards.
6. **No "Rest: 0s"** or other zero-value metadata. If a value is 0 or null, don't display it.
7. **No duplicated labels.** If the section header says the structure type, the card interior doesn't repeat it.
8. **No containers around individual items in a list.** Exercises in a round are plain list items with dividers or spacing, not individually boxed.

---

## Quick Decision Table

| I need to... | Use this... |
|--------------|-------------|
| Frame a content group | ChamferedFrame + LeftColumn |
| Show a tappable action | Blue text/icon, ChamferedFrame button |
| Display a timer or score | Green/lime text, Oxanium font, no container |
| Show a label or annotation | Rajdhani, uppercase, `text-xs`, blue-300 |
| Indicate an error | Rose/red, ChamferedFrame toast if needed |
| Show something is disabled | Neutral-400 text + borders, neutral alpha surface |
| Group items inside a card | Spacing + labels, NOT nested frames |
| Show a sequence or pattern | Plain text (data color), no containers until interactive |

---

*Last updated: February 26, 2026*
