/**
 * EXE-05 acceptance — the coaching panel, on its own.
 *
 *   · cues and regression are the library definition's, read by the slug the
 *     prescription carries;
 *   · an empty `coaching_cues` array and a null `regression` are said as
 *     answers — this movement has none — and never drawn as an empty panel;
 *   · a failed library read is an error inside the panel, with a retry;
 *   · a note is written to the prescription's own row, and a failed write says
 *     so and keeps what was typed.
 *
 * `Workout.test.tsx` repeats the three that matter most through the real shell,
 * beside a set being logged.
 *
 * And the 0.14.3 composition: the panel is one group with every label inside
 * it — one card on its own, that card's content on an exercise's card — and
 * its waits share the view's one loop with a low rest timer.
 */
import type { ReactNode } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createError, err, ErrorCode } from '../state/errors'
import { useRestTimer } from '../state/rest'
import { RestTimerProvider } from '../state/rest-provider'
import { sessionProgress, type ExerciseProgress } from '../state/workout-progress'
import { AppProviders } from '../test/render'
import {
  createWorkoutDouble,
  definitionFixture,
  snapshotFixture,
  type WorkoutDouble,
  type WorkoutDoubleOptions,
} from '../test/workout-double'
import {
  ExerciseCoaching,
  NO_CUES_TEXT,
  NO_DEFINITION_TEXT,
  NO_REGRESSION_TEXT,
  NOTE_FAILED_TEXT,
  NOTE_SAVED_TEXT,
} from './exercise-coaching'
import { Card } from './card'
import { HeadingLevelProvider } from './Heading'
import { RestTimerBar } from './workout-chrome'

const PANEL = 'Coaching and notes — back squat'

afterEach(() => vi.restoreAllMocks())

function mount(
  options: WorkoutDoubleOptions = {},
  compose: (panel: ReactNode) => ReactNode = (panel) => panel,
): {
  double: WorkoutDouble
  exercise: ExerciseProgress
} {
  const snapshot = snapshotFixture({
    sections: [{ title: 'Primary lift', blocks: [{ exercises: ['not_started'] }] }],
  })
  const double = createWorkoutDouble({ session: snapshot, ...options })
  const exercise = sessionProgress(snapshot).sections[0].blocks[0].exercises[0]

  render(
    <AppProviders workout={double.clients}>
      {compose(<ExerciseCoaching exercise={exercise} />)}
    </AppProviders>,
  )

  return { double, exercise }
}

function reduceMotion(reduced: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: reduced && query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  )
}

/** A read or a write that is still out: the wait, held open. */
function never<T>(): Promise<T> {
  return new Promise<T>(() => {})
}

function cards(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.clr-card'))
}

function nestedCards(): HTMLElement[] {
  return cards().filter((card) => card.parentElement?.closest('.clr-card') != null)
}

function RaiseLowRest() {
  const rest = useRestTimer()
  return (
    <button
      type="button"
      onClick={() => rest.start({ exerciseId: 'ex-1', label: 'Back Squat', seconds: 8 })}
    >
      Raise low rest
    </button>
  )
}

/** The panel beside the shell's rest bar, and a control that raises a low rest. */
function besideRest(panel: ReactNode): ReactNode {
  return (
    <RestTimerProvider now={() => 1_000_000}>
      <RaiseLowRest />
      {panel}
      <RestTimerBar />
    </RestTimerProvider>
  )
}

async function open() {
  await userEvent.click(screen.getByRole('button', { name: PANEL }))
  return screen.getByRole('region', { name: PANEL })
}

describe('the coaching panel', () => {
  it('draws nothing outside the workout clients', () => {
    const snapshot = snapshotFixture()
    const exercise = sessionProgress(snapshot).sections[0].blocks[0].exercises[0]
    const { container } = render(<ExerciseCoaching exercise={exercise} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('does not read the library until it is opened', async () => {
    const definition = vi.fn(async () => err(createError(ErrorCode.PERSISTENCE_READ_FAILED)))
    mount({ exercises: { definition } })

    expect(screen.getByRole('button', { name: PANEL })).toHaveAttribute('aria-expanded', 'false')
    expect(definition).not.toHaveBeenCalled()

    await open()
    await waitFor(() => expect(definition).toHaveBeenCalledWith('back-squat'))
  })

  it('shows the cues and regression the library authored for this movement', async () => {
    mount({ definitions: { 'back-squat': definitionFixture() } })
    const panel = await open()

    const cues = await within(panel).findByRole('list', { name: 'Coaching cues' })
    expect(within(cues).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Brace before you descend',
      'Knees track over the toes',
    ])
    expect(within(panel).getByText('Goblet squat')).toBeInTheDocument()
  })

  it('states an empty cues array and a null regression as answers', async () => {
    mount({
      definitions: {
        'back-squat': definitionFixture({ coaching_cues: [], regression: null }),
      },
    })
    const panel = await open()

    expect(await within(panel).findByText(NO_CUES_TEXT)).toBeInTheDocument()
    expect(within(panel).getByText(NO_REGRESSION_TEXT)).toBeInTheDocument()
    expect(within(panel).queryByRole('list', { name: 'Coaching cues' })).toBeNull()
  })

  it('states a movement the library has no entry for', async () => {
    mount({ definitions: {} })
    const panel = await open()

    expect(await within(panel).findByText(NO_DEFINITION_TEXT)).toBeInTheDocument()
  })

  it('shows a failed library read as an error in the panel, and retries it', async () => {
    let fail = true
    const definition = vi.fn(async () =>
      fail ? err(createError(ErrorCode.PERSISTENCE_READ_FAILED)) : { ok: true as const, value: definitionFixture() },
    )
    mount({ exercises: { definition } })
    const panel = await open()

    const alert = await within(panel).findByRole('alert')
    expect(alert).toHaveTextContent('Coaching for back squat didn’t load')
    // The note beside it is still usable: a failed read costs the guidance only.
    expect(within(panel).getByRole('textbox', { name: /Notes — back squat/ })).toBeEnabled()

    fail = false
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await within(panel).findByText('Goblet squat')).toBeInTheDocument()
  })

  it('writes the typed note to the prescription row and says it is saved', async () => {
    const { double, exercise } = mount()
    const panel = await open()

    await userEvent.type(
      within(panel).getByRole('textbox', { name: /Notes — back squat/ }),
      'Left knee felt tight',
    )
    await userEvent.click(within(panel).getByRole('button', { name: 'Save note — back squat' }))

    expect(await within(panel).findByText(NOTE_SAVED_TEXT)).toBeInTheDocument()
    expect(double.savedNotes()).toEqual([
      { exerciseId: exercise.exerciseId, notes: 'Left knee felt tight' },
    ])
  })

  it('clears the note when the field is emptied', async () => {
    const { double, exercise } = mount()
    const panel = await open()

    await userEvent.click(within(panel).getByRole('button', { name: 'Save note — back squat' }))

    await within(panel).findByText(NOTE_SAVED_TEXT)
    expect(double.savedNotes()).toEqual([{ exerciseId: exercise.exerciseId, notes: null }])
  })

  it('reports a failed note write and keeps the typed text', async () => {
    const saveNotes = vi.fn(async () =>
      err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED)),
    )
    mount({ exercises: { saveNotes } })
    const panel = await open()
    const field = within(panel).getByRole('textbox', { name: /Notes — back squat/ })

    await userEvent.type(field, 'Grip slipped on set 3')
    await userEvent.click(within(panel).getByRole('button', { name: 'Save note — back squat' }))

    expect(await within(panel).findByText(NOTE_FAILED_TEXT)).toBeInTheDocument()
    expect(within(panel).queryByText(NOTE_SAVED_TEXT)).toBeNull()
    expect(field).toHaveValue('Grip slipped on set 3')
    expect(saveNotes).toHaveBeenCalledTimes(1)
  })
})

describe('the panel is one group, with its labels inside', () => {
  it('is one card on its own: the disclosure, the cues, the regression and the note', async () => {
    mount({ definitions: { 'back-squat': definitionFixture() } })
    const panel = await open()
    await within(panel).findByRole('list', { name: 'Coaching cues' })

    expect(cards()).toHaveLength(1)
    expect(nestedCards()).toEqual([])
    expect(document.querySelectorAll('.clr-card__bar')).toHaveLength(1)

    const body = cards()[0].querySelector('.clr-card__body') as HTMLElement
    expect(body).toContainElement(screen.getByRole('button', { name: PANEL }))
    expect(body).toContainElement(panel)
    expect(body).toContainElement(screen.getByRole('textbox', { name: /Notes — back squat/ }))
    expect(body).toContainElement(screen.getByRole('button', { name: 'Save note — back squat' }))
  })

  it('heads each sub-group inside it, under a rule rather than a frame', async () => {
    mount({ definitions: { 'back-squat': definitionFixture() } })
    const panel = await open()

    const cues = await within(panel).findByRole('heading', { name: 'Cues' })
    const regression = within(panel).getByRole('heading', { name: 'Regression' })

    for (const heading of [cues, regression]) {
      const row = heading.parentElement as HTMLElement
      expect(row.style.borderBottom).toContain('var(--border-region-rule)')
      expect(heading.closest('.clr-chamfer')).toBe(cards()[0].querySelector('.clr-card__body'))
    }
    // The cues and the regression each follow their own heading in the group.
    expect(cues.parentElement?.parentElement).toContainElement(
      within(panel).getByRole('list', { name: 'Coaching cues' }),
    )
    expect(regression.parentElement?.parentElement).toHaveTextContent('Goblet squat')
  })

  it('heads them one level below whatever the panel sits under', async () => {
    mount({ definitions: { 'back-squat': definitionFixture() } }, (panel) => (
      <HeadingLevelProvider level={3}>{panel}</HeadingLevelProvider>
    ))
    const panel = await open()

    expect(await within(panel).findByRole('heading', { level: 4, name: 'Cues' })).toBeInTheDocument()
    expect(within(panel).getByRole('heading', { level: 4, name: 'Regression' })).toBeInTheDocument()
  })

  it('is content on an exercise’s card, never a second card inside it', async () => {
    mount({ exercises: { definition: () => never() } }, (panel) => (
      <Card heading="Back squat">{panel}</Card>
    ))
    const panel = await open()

    // Waiting included: the loading region is a line in the card, not a frame.
    const wait = await within(panel).findByRole('status', { busy: true })
    expect(wait).toHaveTextContent('Reading coaching for back squat')
    expect(cards()).toHaveLength(1)
    expect(nestedCards()).toEqual([])
    expect(cards()[0]).toContainElement(screen.getByRole('button', { name: PANEL }))
  })

  it('keeps a failed read and an absent entry inside the same one card', async () => {
    mount({
      exercises: { definition: async () => err(createError(ErrorCode.PERSISTENCE_READ_FAILED)) },
    })
    const panel = await open()

    const alert = await within(panel).findByRole('alert')
    expect(cards()).toHaveLength(1)
    expect(cards()[0]).toContainElement(alert)
  })
})

describe('the panel’s waits and a low rest keep one loop between them', () => {
  function guidanceWait(panel: HTMLElement): HTMLElement {
    return within(panel).getByRole('status', { busy: true })
  }

  function restBar(): HTMLElement {
    return screen.getByRole('region', { name: 'Rest' })
  }

  it('runs the guidance’s wait until the rest goes low, then stills it — still busy', async () => {
    reduceMotion(false)
    mount({ exercises: { definition: () => never() } }, besideRest)
    const panel = await open()

    const wait = guidanceWait(panel)
    expect(wait).toHaveAttribute('data-loop', 'run')

    await userEvent.click(screen.getByRole('button', { name: 'Raise low rest' }))

    expect(restBar()).toHaveClass('clr-pulse-micro')
    expect(restBar()).toHaveAttribute('data-loop', 'run')
    expect(wait).toHaveAttribute('data-loop', 'still')
    expect(wait).toHaveAttribute('aria-busy', 'true')
    expect(wait).toHaveTextContent('Reading coaching for back squat')
    expect(document.querySelectorAll('[data-loop="run"]')).toHaveLength(1)

    // The rest ends and the wait, which never stopped being one, moves again.
    await userEvent.click(screen.getByRole('button', { name: 'Skip rest' }))
    expect(wait).toHaveAttribute('data-loop', 'run')
    // The timer card and the panel's card stand side by side, never nested.
    expect(nestedCards()).toEqual([])
  })

  it('treats a note being saved the same way: one loop, and the button stays busy', async () => {
    reduceMotion(false)
    mount({ exercises: { saveNotes: () => never() } }, besideRest)
    const panel = await open()
    const button = within(panel).getByRole('button', { name: 'Save note — back squat' })
    const row = button.closest('[data-loop]') as HTMLElement
    expect(row).toHaveAttribute('data-loop', 'still')

    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(row).toHaveAttribute('data-loop', 'run')
    expect(within(panel).getByText('Saving…')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Raise low rest' }))
    expect(restBar()).toHaveAttribute('data-loop', 'run')
    expect(row).toHaveAttribute('data-loop', 'still')
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(within(panel).getByText('Saving…')).toBeInTheDocument()
    expect(document.querySelectorAll('[data-loop="run"]')).toHaveLength(1)
  })

  it('is static under reduced motion and still says everything', async () => {
    reduceMotion(true)
    mount({ exercises: { definition: () => never() } }, besideRest)
    const panel = await open()
    await userEvent.click(screen.getByRole('button', { name: 'Raise low rest' }))

    expect(document.querySelector('[data-loop="run"]')).toBeNull()

    const wait = guidanceWait(panel)
    expect(wait).toHaveAttribute('aria-busy', 'true')
    expect(wait).toHaveTextContent('Reading coaching for back squat')
    expect(within(panel).getByRole('textbox', { name: /Notes — back squat/ })).toBeEnabled()
    expect(within(restBar()).getByRole('timer', { name: 'Time remaining' })).toHaveTextContent(
      '00:08',
    )
    expect(within(restBar()).getByText('Final 10 seconds')).toBeInTheDocument()
  })

  it('shows what was read under reduced motion, with nothing waiting on an animation', async () => {
    reduceMotion(true)
    mount({ definitions: { 'back-squat': definitionFixture() } })
    const panel = await open()

    expect(await within(panel).findByRole('heading', { name: 'Cues' })).toBeInTheDocument()
    expect(within(panel).getAllByRole('listitem')).toHaveLength(2)
    expect(within(panel).getByText('Goblet squat')).toBeInTheDocument()
  })
})
