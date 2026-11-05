/**
 * REQ-001 / TASK-001 — the shared movement hierarchy and peer grouping
 * (`src/ui/refinements/movement.tsx`), read off the owner itself and off the
 * active Workout's standard, superset and circuit renderers that draw it.
 *
 * jsdom applies no stylesheet, so the peer-rule geometry is proved in the
 * browser (`e2e/refinement/task-001.spec.ts`); here the claims are structure:
 * which slot each reading lands in, that the peers are one list, that the only
 * rule the shared stylesheet draws is between peers, and that no
 * last-performance reading is drawn.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { BlockCompletionContext, type BlockCompletionApi } from '../state/block-completion'
import { SetLoggingProvider } from '../state/set-logging-provider'
import { sessionProgress } from '../state/workout-progress'
import { AppProviders } from '../test/render'
import {
  createWorkoutDouble,
  FIXTURE_SESSION_ID,
  snapshotFixture,
  type BlockFixture,
} from '../test/workout-double'
import { BlockSlot } from './block-renderers'
import { HeadingLevelProvider } from './Heading'
import {
  distinctLoad,
  MovementGroupHeader,
  MovementIdentity,
  MovementList,
} from './refinements/movement'

const STYLESHEET = readFileSync(resolve(import.meta.dirname, 'refinements/presentation.css'), 'utf8')

const LONG = 'single-arm-kettlebell-overhead-reverse-lunge-with-a-pause-at-the-bottom'

describe('MovementIdentity: one hierarchy with separate slots (C01)', () => {
  it('leads with the name, keeps equipment quiet beside it and the prescription and load below', () => {
    render(
      <HeadingLevelProvider level={3}>
        <MovementIdentity
          heading
          name="bench press"
          ordinal="12"
          equipment="barbell"
          prescription="3 × 5 reps"
          load="95 lb"
          rest="Rest 180s"
          counter="Set 1/3"
          action={<button type="button">Swap</button>}
        />
      </HeadingLevelProvider>,
    )

    const heading = screen.getByRole('heading', { level: 3 })
    // The heading names the movement and its place; equipment is beside it, not part of it.
    expect(heading.textContent).toBe('12 bench press')
    const row = heading.closest('[data-movement-name-row]')!
    const equipment = row.querySelector('[data-movement-context]')!
    expect(equipment).toHaveTextContent('barbell')
    expect(heading.contains(equipment)).toBe(false)
    expect(heading.parentElement!.contains(equipment)).toBe(true)

    // Counter and action each keep their own column on the name row.
    const counter = within(row as HTMLElement).getByText('Set 1/3')
    const action = within(row as HTMLElement).getByRole('button', { name: 'Swap' })
    expect(counter.className).toContain('clr-movement-identity__counter')
    expect(action.parentElement!.className).toContain('clr-movement-identity__action')
    expect(heading.parentElement!.contains(counter)).toBe(false)
    expect(heading.parentElement!.contains(action)).toBe(false)

    const detail = document.querySelector('[data-movement-detail]')!
    expect(Array.from(detail.children).map((span) => span.textContent)).toEqual(['3 × 5 reps', '95 lb', 'Rest 180s'])
    expect(detail.querySelector('[data-movement-load]')).toHaveTextContent('95 lb')
  })

  it('draws no last-performance row, and no empty slots for readings it was not given', () => {
    const { container } = render(<MovementIdentity name="arm circle" prescription="1 × 10 reps" />)
    expect(container).not.toHaveTextContent(/\blast\b/i)
    expect(container.querySelector('[data-movement-context]')).toBeNull()
    expect(container.querySelector('[data-movement-load]')).toBeNull()
    expect(container.querySelector('.clr-movement-identity__counter, .clr-movement-identity__action')).toBeNull()
  })

  it('keeps the prescribed load unless it only repeats the equipment', () => {
    expect(distinctLoad('95 lb', 'barbell')).toBe('95 lb')
    expect(distinctLoad('Bodyweight', 'bodyweight')).toBeNull()
    expect(distinctLoad(null, 'dumbbell')).toBeNull()
  })
})

describe('MovementList and MovementGroupHeader: peers ruled only between one another (C04)', () => {
  it('is one ordered list of its peers, named', () => {
    render(
      <MovementList label="superset, 3 rounds">
        <li>one</li>
        <li>two</li>
        <li>three</li>
      </MovementList>,
    )
    const list = screen.getByRole('list', { name: 'superset, 3 rounds' })
    expect(list.tagName).toBe('OL')
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
  })

  it('rules only between peers, never after the last, and draws no rail', () => {
    const rules = STYLESHEET.split('}').filter((rule) => /border/.test(rule))
    expect(rules).toHaveLength(1)
    expect(rules[0]).toMatch(/\.clr-movement-list > li:not\(:last-child\)\s*\{[^]*border-block-end:/)
    expect(STYLESHEET).not.toMatch(/border-inline|border-left|border-right|border-block-start|border-top/)
  })

  it('header holds the label and the badge, and neither is a heading by default', () => {
    render(<MovementGroupHeader title="Primary lift" badge={<span>SUPERSET</span>} />)
    const header = document.querySelector('[data-movement-group-header]')!
    expect(Array.from(header.children).map((child) => child.textContent)).toEqual(['Primary lift', 'SUPERSET'])
    expect(screen.queryByRole('heading')).toBeNull()
  })
})

/** The active Workout's own renderers, dispatched as the shell dispatches them. */
function mountWorkout(block: BlockFixture) {
  const snapshot = snapshotFixture({
    sections: [{ title: 'Accessory', sectionType: 'accessory', blocks: [block] }],
  })
  const workout = createWorkoutDouble({ session: snapshot })
  const progress = sessionProgress(snapshot).sections[0].blocks[0]
  const completion: BlockCompletionApi = { reportOutcome: () => {}, isBlockRecorded: () => false }
  return render(
    <AppProviders workout={workout.clients}>
      <BlockCompletionContext value={completion}>
        <SetLoggingProvider
          sessionId={FIXTURE_SESSION_ID}
          storage={null}
          exercises={progress.exercises}
          weightUnit="kg"
          onFailure={() => {}}
          newId={() => 'a0000001-0000-4000-8000-000000000000'}
        >
          <BlockSlot block={progress} />
        </SetLoggingProvider>
      </BlockCompletionContext>
    </AppProviders>,
  )
}

const MEMBERS: BlockFixture['exercises'] = [
  { prescription: { exercise_id: LONG, order_index: 0, equipment_used: 'kettlebell', sets: 3, target_value: 8,
    load_type: 'absolute', load_value: 16 } },
  { prescription: { exercise_id: 'plank', order_index: 1, equipment_used: 'bodyweight', sets: 3, target_value: 30,
    modality: 'time', load_type: 'bodyweight', load_value: null } },
  { prescription: { exercise_id: 'goblet-squat', order_index: 2, equipment_used: 'dumbbell', sets: 3, target_value: 10,
    load_type: 'absolute', load_value: 20 } },
]

describe.each([
  ['standard', { structureType: 'standard', exercises: MEMBERS }],
  ['superset', { structureType: 'superset', rounds: 3, roundRestSeconds: 60, exercises: MEMBERS }],
  ['circuit', { structureType: 'circuit', rounds: 3, roundRestSeconds: 60, exercises: MEMBERS }],
] as const)('Workout %s card adopts the shared owner', (structure, block) => {
  it('draws its movements as one peer list in the shared hierarchy, with the prescribed load', () => {
    const { container } = mountWorkout(block as BlockFixture)

    const lists = container.querySelectorAll('ol.clr-movement-list')
    expect(lists, structure).toHaveLength(1)
    const items = Array.from(lists[0].children)
    expect(items).toHaveLength(3)
    items.forEach((item) => expect(item.tagName).toBe('LI'))

    // The shared group header leads the card, with no rail around it.
    expect(container.querySelector('[data-movement-group-header][data-block-top-row]')).not.toBeNull()

    const identities = Array.from(lists[0].querySelectorAll('[data-movement-identity]'))
    expect(identities).toHaveLength(3)
    const [loaded, bodyweight, dumbbell] = identities
    // The long name is the heading, whole; equipment is quiet beside it, without a prefix.
    expect(within(loaded as HTMLElement).getByRole('heading')).toHaveTextContent(LONG.replaceAll('-', ' '))
    expect(loaded.querySelector('[data-movement-context]')).toHaveTextContent(/^kettlebell$/)
    // The prescribed load, read the way Review reads it — never dropped (C02).
    expect(loaded.querySelector('[data-movement-load]')).toHaveTextContent(/^16 kg$/)
    expect(dumbbell.querySelector('[data-movement-load]')).toHaveTextContent(/^20 kg$/)
    // `Bodyweight` beside `bodyweight` is said once, by the equipment.
    expect(bodyweight.querySelector('[data-movement-load]')).toBeNull()
    expect(bodyweight.querySelector('[data-movement-context]')).toHaveTextContent(/^bodyweight$/)

    // No last-performance reading anywhere on the card.
    expect(container).not.toHaveTextContent(/\bLast[: ]/)
  })
})
