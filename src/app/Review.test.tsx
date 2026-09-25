/**
 * REV-01 acceptance: *all generated content renders, and Start begins a
 * session.*
 *
 * Every test mounts the screen inside a two-route harness over the real
 * `SessionsClient` seam, so "Start hands off to SES-01" is asserted as the two
 * calls it actually is — `accept` then `start` — followed by arriving at
 * `/workout`. A test that only checked a callback fired would pass for a screen
 * that navigated into a workout no row exists for.
 *
 * The content half is asserted against one schema-valid sample carrying every
 * structure type and every rep scheme (`makeStructureSpectrumWorkout`). It is
 * the criterion's own wording: a screen is shown one workout, and a briefing
 * that rendered two structures identically would pass six single-block tests.
 */
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Route, Routes } from 'react-router-dom'

import { Constants } from '../data/database.types'
import type { SessionsClient } from '../data/sessions'
import { createError, ErrorCode, err, ok, type Result } from '../state/errors'
import type { SessionAcceptance, SessionSnapshot } from '../state/schemas'
import { makeSessionAcceptance, makeStructureSpectrumWorkout } from '../test/factories'
import { renderWithProviders, signedIn } from '../test/render'
import { createWorkoutDouble, snapshotFixture } from '../test/workout-double'
import { REGENERATE_LABEL, Review, START_LABEL } from './Review'

const ACCEPTANCE = makeSessionAcceptance({
  session_focus: 'lower_body',
  goal_preset: 'strength',
  requested_intensity: 9,
  effective_intensity: 7,
  requested_duration_mins: 60,
  effective_duration_target_mins: 45,
  computed_duration_mins: 52,
  adjustment_reason: null,
  workout: makeStructureSpectrumWorkout({ estimated_duration_mins: 71 }),
})

/** The persisted session `accept` answers with; `start` moves it to active. */
const PERSISTED = snapshotFixture({ state: 'prescribed' })

interface Recorder {
  readonly accepted: { userId: string; acceptance: SessionAcceptance }[]
  readonly started: string[]
}

interface HarnessOptions {
  /** Refuse the write, so the session is never created. */
  acceptFails?: boolean
  /** Write the session, then refuse the transition. */
  startFails?: boolean
  /** Hold `accept` open, so the in-flight state can be observed. */
  holdAccept?: boolean
}

function sessionsDouble(
  recorder: Recorder,
  options: HarnessOptions,
): Partial<SessionsClient> {
  return {
    async accept(userId, acceptance) {
      recorder.accepted.push({ userId, acceptance })
      if (options.holdAccept === true) {
        await new Promise<void>(() => {
          // Never settles: the CTA stays pending for as long as the test looks.
        })
      }
      return options.acceptFails === true
        ? err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED))
        : (ok(PERSISTED) as Result<SessionSnapshot>)
    },
    async start(sessionId) {
      recorder.started.push(sessionId)
      return options.startFails === true
        ? err(createError(ErrorCode.VALIDATION_CONSTRAINT))
        : ok({ session: PERSISTED.session, state: 'active' as const })
    },
  }
}

const WORKOUT_MARKER = 'the workout shell'

function renderReview(
  options: HarnessOptions & {
    acceptance?: SessionAcceptance
    onRegenerate?: () => void
  } = {},
) {
  const recorder: Recorder = { accepted: [], started: [] }
  const workout = createWorkoutDouble({
    session: null,
    sessions: sessionsDouble(recorder, options),
  })

  const view = renderWithProviders(
    <Routes>
      <Route
        path="/review"
        element={
          <Review
            acceptance={options.acceptance ?? ACCEPTANCE}
            onRegenerate={options.onRegenerate ?? (() => undefined)}
          />
        }
      />
      <Route path="/workout" element={<p>{WORKOUT_MARKER}</p>} />
    </Routes>,
    { route: '/review', ...signedIn({ workout: workout.clients }) },
  )

  return { ...view, recorder }
}

/** The briefing, as one string — for the numbers that must never appear in it. */
function briefingText(): string {
  return screen.getByRole('main').textContent ?? ''
}

describe('all generated content renders', () => {
  it('heads the screen with the workout’s own title', async () => {
    renderReview()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Full spectrum' }),
    ).toBeInTheDocument()
  })

  it('renders every section, in the order it will be performed', async () => {
    renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    for (const title of ['Prepare', 'Primary', 'Accessory', 'Conditioning', 'Cool down']) {
      expect(screen.getByRole('button', { name: new RegExp(title) })).toBeInTheDocument()
    }
  })

  it('renders every structure type the database admits', async () => {
    renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    const text = briefingText()
    for (const label of ['STANDARD', 'SUPERSET', 'CIRCUIT', 'EMOM', 'AMRAP', 'FOR TIME']) {
      expect(text).toContain(label)
    }
    // Every structure in the enum reached the screen under some label.
    expect(Constants.public.Enums.structure_type).toHaveLength(6)
  })

  it('renders every rep scheme that carries information', async () => {
    renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    const text = briefingText()
    for (const label of [
      'PYRAMID',
      'LADDER UP',
      'LADDER DOWN',
      'N+1',
      'INVERSE',
      'LADDER · FIXED INTERVAL',
    ]) {
      expect(text).toContain(label)
    }
  })

  it('states each structure’s own number — its clock, its cap, its rounds', async () => {
    renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    const text = briefingText()
    expect(text).toContain('3 ROUNDS')
    expect(text).toContain('10 MIN')
    expect(text).toContain('8 MIN')
    expect(text).toContain('15 MIN CAP')
  })

  it('renders every movement, with its structured prescription', async () => {
    renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    const text = briefingText()
    for (const movement of [
      'air squat',
      'back squat',
      'bench press',
      'bent over row',
      'goblet squat',
      'pull up',
      'kb swing',
      'burpee',
      'wall ball',
      'row erg',
      'couch stretch',
    ]) {
      expect(text).toContain(movement)
    }
  })

  it('renders each target kind as its own shape', async () => {
    renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    const text = briefingText()
    // A range with an en dash, a sequence as rungs, a fixed count as a product.
    expect(text).toContain('3 × 8–12 reps')
    expect(text).toContain('5 rungs · 15-12-9-6-3 reps')
    expect(text).toContain('5 × 5 reps')
  })

  it('renders time and distance as themselves rather than as reps', async () => {
    renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    const text = briefingText()
    expect(text).toContain('2 × 45 sec each side')
    expect(text).toContain('4 × 400 m')
  })

  it('renders the load guidance, the rest and the tempo', async () => {
    renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    const text = briefingText()
    expect(text).toContain('75% 1RM')
    expect(text).toContain('2 RIR')
    expect(text).toContain('Bodyweight')
    expect(text).toContain('Match last session')
    expect(text).toContain('Rest 180s')
    expect(text).toContain('90s between rounds')
    expect(text).toContain('3-1-1-0')
  })

  it('renders the notes the composition carries', async () => {
    renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    const text = briefingText()
    expect(text).toContain('Move before you load.')
    expect(text).toContain('Build then come back down.')
    expect(text).toContain('Every structure this app can prescribe, in one session.')
  })

  it('keeps a collapsed section in the document, so nothing is removed by closing it', async () => {
    const user = userEvent.setup()
    renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    await user.click(screen.getByRole('button', { name: /Prepare/ }))

    expect(screen.getByRole('button', { name: /Prepare/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(briefingText()).toContain('air squat')
  })
})

describe('the intensity / anchor / goal header', () => {
  it('states the four facts the workout was composed under', async () => {
    renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    expect(screen.getByText('Intensity').parentElement?.textContent).toContain('7 of 10')
    expect(screen.getByText('Anchor').parentElement?.textContent).toContain('Lower body')
    expect(screen.getByText('Goal').parentElement?.textContent).toContain('Strength')
    expect(screen.getByText('Duration').parentElement?.textContent).toContain('45 min')
  })

  it('says why the session differs from what was asked for', async () => {
    renderReview({
      acceptance: makeSessionAcceptance({
        ...ACCEPTANCE,
        adjustment_reason: 'Intensity clamped from 9 to 7 for the strength preset.',
      }),
    })
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    expect(
      screen.getByText('Intensity clamped from 9 to 7 for the strength preset.'),
    ).toBeInTheDocument()
  })
})

describe('the duration shown is the effective target', () => {
  it('shows the number generation was asked to hit', async () => {
    renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    expect(briefingText()).toContain('45 min')
  })

  it('never surfaces the computed estimate or Claude’s diagnostic estimate', async () => {
    renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    const text = briefingText()
    // 52 is GEN-06's plausibility estimate and 71 is the model's own guess.
    expect(text).not.toContain('52')
    expect(text).not.toContain('71')
  })

  it('never surfaces the requested duration in place of the effective one', async () => {
    renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    expect(briefingText()).not.toContain('60 min')
  })
})

describe('Regenerate confirms before discarding', () => {
  it('discards nothing until the confirm is answered', async () => {
    const user = userEvent.setup()
    let regenerated = 0
    renderReview({ onRegenerate: () => (regenerated += 1) })
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    await user.click(screen.getByRole('button', { name: REGENERATE_LABEL }))

    expect(regenerated).toBe(0)
    expect(
      await screen.findByRole('heading', { name: 'Discard this workout?' }),
    ).toBeInTheDocument()
  })

  it('says what is lost, and that nothing is deleted', async () => {
    const user = userEvent.setup()
    renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    await user.click(screen.getByRole('button', { name: REGENERATE_LABEL }))
    const dialog = await screen.findByRole('dialog')

    expect(dialog.textContent).toContain('has not been saved')
    expect(dialog.textContent).toContain('cannot be brought back')
  })

  it('keeps the workout when the confirm is declined', async () => {
    const user = userEvent.setup()
    let regenerated = 0
    renderReview({ onRegenerate: () => (regenerated += 1) })
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    await user.click(screen.getByRole('button', { name: REGENERATE_LABEL }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Keep it' }))

    expect(regenerated).toBe(0)
    expect(briefingText()).toContain('air squat')
  })

  it('discards once the confirm is taken', async () => {
    const user = userEvent.setup()
    let regenerated = 0
    renderReview({ onRegenerate: () => (regenerated += 1) })
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    await user.click(screen.getByRole('button', { name: REGENERATE_LABEL }))
    const dialog = await screen.findByRole('dialog')
    await user.click(
      within(dialog).getByRole('button', { name: 'Discard and regenerate' }),
    )

    expect(regenerated).toBe(1)
  })

  it('writes nothing on the way out — a discarded workout leaves no session', async () => {
    const user = userEvent.setup()
    const { recorder } = renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    await user.click(screen.getByRole('button', { name: REGENERATE_LABEL }))
    const dialog = await screen.findByRole('dialog')
    await user.click(
      within(dialog).getByRole('button', { name: 'Discard and regenerate' }),
    )

    expect(recorder.accepted).toEqual([])
    expect(recorder.started).toEqual([])
  })
})

describe('Start hands off to SES-01', () => {
  it('persists the composed workout as a session', async () => {
    const user = userEvent.setup()
    const { recorder } = renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    await user.click(screen.getByRole('button', { name: START_LABEL }))

    await waitFor(() => expect(recorder.accepted).toHaveLength(1))
    expect(recorder.accepted[0].userId).toBe('user-1')
    expect(recorder.accepted[0].acceptance).toEqual(ACCEPTANCE)
  })

  it('starts the session acceptance created, and no other', async () => {
    const user = userEvent.setup()
    const { recorder } = renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    await user.click(screen.getByRole('button', { name: START_LABEL }))

    await waitFor(() => expect(recorder.started).toEqual([PERSISTED.session.id]))
  })

  it('arrives at the workout shell once the session is running', async () => {
    const user = userEvent.setup()
    renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    await user.click(screen.getByRole('button', { name: START_LABEL }))

    expect(await screen.findByText(WORKOUT_MARKER)).toBeInTheDocument()
  })

  it('does not start a session the write never created', async () => {
    const user = userEvent.setup()
    const { recorder } = renderReview({ acceptFails: true })
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    await user.click(screen.getByRole('button', { name: START_LABEL }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(recorder.started).toEqual([])
  })

  it('says a failed write failed, rather than moving on quietly', async () => {
    const user = userEvent.setup()
    renderReview({ acceptFails: true })
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    await user.click(screen.getByRole('button', { name: START_LABEL }))
    const dialog = await screen.findByRole('dialog')

    expect(
      within(dialog).getByRole('heading', { name: 'Couldn’t start this workout' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(WORKOUT_MARKER)).not.toBeInTheDocument()
  })

  it('says a refused transition failed, and stays on the briefing', async () => {
    const user = userEvent.setup()
    renderReview({ startFails: true })
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    await user.click(screen.getByRole('button', { name: START_LABEL }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByText(WORKOUT_MARKER)).not.toBeInTheDocument()
    expect(briefingText()).toContain('air squat')
  })

  it('leaves the workout on screen after a failure is dismissed', async () => {
    const user = userEvent.setup()
    renderReview({ startFails: true })
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    await user.click(screen.getByRole('button', { name: START_LABEL }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: START_LABEL })).toBeEnabled()
  })

  it('refuses a second start while the first is still in flight', async () => {
    const user = userEvent.setup()
    const { recorder } = renderReview({ holdAccept: true })
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    const start = screen.getByRole('button', { name: START_LABEL })
    await user.click(start)
    await waitFor(() => expect(start).toHaveAttribute('aria-busy', 'true'))
    await user.click(start)

    expect(recorder.accepted).toHaveLength(1)
  })

  it('does not offer to regenerate a workout that is being started', async () => {
    const user = userEvent.setup()
    renderReview({ holdAccept: true })
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    await user.click(screen.getByRole('button', { name: START_LABEL }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: REGENERATE_LABEL })).toBeDisabled(),
    )
  })
})
