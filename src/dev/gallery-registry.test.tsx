/**
 * DS-07's last acceptance criterion, as a test: *adding a component to DS-04 or
 * DS-05 without adding it to the gallery fails review.*
 *
 * A convention would not do it, so this reads `src/ui/` — the boundary
 * app-owned presentation lives behind, per PROJECT_MAP.md — collects every
 * component it exports, and requires each one either to be framed in the
 * gallery register or to be recorded below as belonging to a different
 * requirement, with the reason written down. Adding a component and nothing else
 * turns the suite red; exempting one costs a sentence a reviewer can disagree
 * with.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { render, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../test/render'
import { AppComposedParts } from './gallery-app'
import { GALLERY_ENTRIES } from './gallery-registry'

const UI_DIR = resolve(import.meta.dirname, '../ui')

/**
 * Components `src/ui/` exports that the gallery deliberately does not frame,
 * each with the requirement that owns it and why a specimen would say nothing.
 * A DS-04 or DS-05 component does not belong in this map.
 */
const NOT_A_GALLERY_SPECIMEN: Readonly<Record<string, string>> = {
  // CORE-05 structural mechanisms: they have no appearance of their own, and
  // what they produce is the outline of every other specimen on the page.
  Heading: 'CORE-05 — renders h1…h6 from section depth; no visual surface',
  HeadingLevelProvider: 'CORE-05 — context only, renders nothing',
  HeadingSection: 'CORE-05 — a <section> that deepens the outline',
  Nav: 'CORE-05 — a <nav> landmark that requires a name; no visual surface',
  SkipLink:
    'CORE-05 — visible only while focused, and only as the first tab stop of the real app shell',
  // EXE-01's shell parts. Each one is a reading of live session state — an
  // elapsed wall clock, a section's derived status, a block's structure
  // identity — so a specimen would have to invent a session to show anything,
  // and would then be framing the fixture rather than the component. They are
  // reviewed on `/workout` with a real session, which is where they mean
  // something.
  GlobalTimer: 'EXE-01 — reads elapsed session time; nothing to show without a session',
  ProgressTracker: 'EXE-01 — renders section statuses derived from a session snapshot',
  SectionHeader: 'EXE-01 — a section of a live session, with its blocks’ identities',
  StructureBadge: 'EXE-01 — the identity of one block row, per the master clarity spec',
  WorkoutNavigation: 'EXE-01 — prev/next/finish over a session’s sections',
  BlockEffortDialog: 'EXE-01 — the perceived-effort capture, opened at block completion',
  AbandonConfirmDialog:
    'EXE-01 — `ConfirmDialog critical` with fixed copy; the surface is framed under ConfirmDialog, and what is new here is the wording, reviewed where it is asked',
  BlockPanel:
    'EXE-01 — one block of a live session, and it completes through the shell’s provider',
  BlockSlot: 'EXE-01 — dispatch to whichever renderer performs a block’s structure',
}

/** Components exported from a module, in source order. */
function exportedComponents(source: string): string[] {
  const names = new Set<string>()
  // `export function Name(` and `export const Name = (` — both forms in src/ui.
  for (const [, name] of source.matchAll(
    /export\s+(?:default\s+)?function\s+([A-Z]\w*)\s*[(<]/g,
  )) {
    names.add(name)
  }
  for (const [, name] of source.matchAll(
    /export\s+const\s+([A-Z]\w*)\s*(?::[^=]+)?=\s*(?:function|\()/g,
  )) {
    names.add(name)
  }
  return [...names]
}

function appOwnedComponents(): Map<string, string> {
  const found = new Map<string, string>()

  for (const entry of readdirSync(UI_DIR, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    if (!entry.name.endsWith('.tsx') || entry.name.endsWith('.test.tsx')) continue
    const file = resolve(entry.parentPath, entry.name)
    for (const name of exportedComponents(readFileSync(file, 'utf-8'))) {
      found.set(name, `src/ui/${entry.name}`)
    }
  }

  return found
}

describe('gallery coverage of app-composed components', () => {
  const framed = new Set(GALLERY_ENTRIES.map((entry) => entry.component))

  it('finds the app-owned components it is meant to be checking', () => {
    const discovered = appOwnedComponents()

    // A regex that stopped matching would silently pass every assertion below.
    expect(discovered.get('Card')).toBe('src/ui/card.tsx')
    expect(discovered.get('CollapsibleSection')).toBe(
      'src/ui/collapsible-section.tsx',
    )
    expect(discovered.get('ViewStateSwitch')).toBe('src/ui/view-state.tsx')
    expect(discovered.size).toBeGreaterThan(framed.size)
  })

  it('frames every component src/ui exports, or records why not', () => {
    const unaccounted = [...appOwnedComponents().keys()]
      .filter((name) => !framed.has(name))
      .filter((name) => !(name in NOT_A_GALLERY_SPECIMEN))
      .sort()

    expect(unaccounted).toEqual([])
  })

  it('exempts nothing that DS-04 or DS-05 owns', () => {
    const owned = new Set(
      GALLERY_ENTRIES.filter((entry) => entry.requirement.startsWith('DS-0')).map(
        (entry) => entry.component,
      ),
    )

    for (const exempt of Object.keys(NOT_A_GALLERY_SPECIMEN)) {
      expect(owned.has(exempt)).toBe(false)
    }
  })

  it('covers DS-04a, DS-04b, DS-04c, DS-05 and DS-06', () => {
    const requirements = new Set(GALLERY_ENTRIES.map((entry) => entry.requirement))

    expect(requirements).toContain('DS-04a')
    expect(requirements).toContain('DS-04b')
    expect(requirements).toContain('DS-04c')
    expect(requirements).toContain('DS-05')
    expect(requirements).toContain('DS-06')
  })

  it('gives every part at least two states, and names each one once', () => {
    for (const entry of GALLERY_ENTRIES) {
      const states = entry.specimens.map((specimen) => specimen.state)
      expect(states.length, entry.component).toBeGreaterThan(1)
      expect(new Set(states).size, entry.component).toBe(states.length)
    }
  })
})

describe('the app-composed section', () => {
  it('renders every part and every state', () => {
    const { container } = renderWithProviders(<AppComposedParts />)

    // Scoped per part: two parts can legitimately have a state of the same name
    // ("with a requestId" belongs to the toast host and to the error view both).
    const groups = container.querySelectorAll('.clr-dev-gallery__group')
    expect(groups).toHaveLength(GALLERY_ENTRIES.length)

    GALLERY_ENTRIES.forEach((entry, index) => {
      const group = within(groups[index] as HTMLElement)
      expect(group.getByRole('heading', { name: entry.component })).toBeInTheDocument()
      for (const specimen of entry.specimens) {
        expect(
          group.getByRole('heading', { name: specimen.state }),
        ).toBeInTheDocument()
      }
    })
  })

  it('renders each specimen on its own without crashing', () => {
    for (const entry of GALLERY_ENTRIES) {
      for (const specimen of entry.specimens) {
        const { unmount } = render(<specimen.Render />)
        unmount()
      }
    }
  })

  it('shows all three atmosphere levels at once', () => {
    const { container } = renderWithProviders(<AppComposedParts />)

    for (const level of ['full', 'quiet', 'operational']) {
      expect(
        container.querySelector(
          `.clr-dev-gallery__atmosphere[data-atmosphere="${level}"] .clr-atmosphere`,
        ),
      ).not.toBeNull()
    }
  })
})
