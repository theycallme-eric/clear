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

import type { AnchorsClient } from '../data/anchors'
import { Constants } from '../data/database.types'
import type { SessionsClient } from '../data/sessions'
import { createError, ErrorCode, err, ok, type Result } from '../state/errors'
import {
  LOW_CONFIDENCE_LABEL,
  OVERRIDE_SCOPE_NOTE,
  reviewLoadSuggestions,
  sessionCountText,
  weightText,
} from '../state/load-suggestions'
import type {
  AnchorEvidenceRow,
  LoadAnchorRow,
  SessionAcceptance,
  SessionSnapshot,
} from '../state/schemas'
import { QueryClient } from '../state/query'
import { activeSessionQueryKey } from '../state/workout-queries'
import { makeSessionAcceptance, makeStructureSpectrumWorkout } from '../test/factories'
import {
  anchorRow,
  evidenceRows,
  suggestionAcceptance,
} from '../test/load-suggestion-fixtures'
import {
  APPLY_OVERRIDE_LABEL,
  SUGGESTIONS_ERROR_TITLE,
  SUGGESTIONS_LOADING_LABEL,
  WHY_TITLE,
} from '../ui/load-suggestion'
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
  /** OVR-01c: the stored anchors and the working sets behind them. */
  anchorRows?: readonly LoadAnchorRow[]
  anchorEvidence?: readonly AnchorEvidenceRow[]
  /** Overrides for the anchors client, for the reads that fail or hang. */
  anchors?: Partial<AnchorsClient>
  /** Lets a handoff assertion inspect the same cache the screen publishes. */
  queryClient?: QueryClient
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
    anchorRows: options.anchorRows,
    anchorEvidence: options.anchorEvidence,
    anchors: options.anchors,
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
    {
      route: '/review',
      ...signedIn({ workout: workout.clients }),
      queryClient: options.queryClient,
    },
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

  it('publishes the running snapshot before Workout reads the shared cache', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient()
    renderReview({ queryClient })
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    await user.click(screen.getByRole('button', { name: START_LABEL }))

    await waitFor(() =>
      expect(queryClient.getState<SessionSnapshot>(activeSessionQueryKey('user-1'))).toEqual({
        status: 'ready',
        data: expect.objectContaining({
          state: 'active',
          session: expect.objectContaining({ id: PERSISTED.session.id }),
          sections: PERSISTED.sections,
        }),
      }),
    )
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

/**
 * OVR-01c. The acceptance here has two primary lifts: back squat, which has an
 * anchor and three sets of evidence behind it, and bench press, which has
 * neither. The expected number is always the one `reviewLoadSuggestions`
 * answers for the same inputs, so the screen is held to the rule table rather
 * than to a figure restated in the test.
 */
describe('the suggested load, its confidence, and why', () => {
  const SQUAT_DAY = suggestionAcceptance()
  /** The affordance, in any of its three readings. */
  const SUGGESTION_NAME = /^(Suggested|No suggested weight|Your weight)/

  function expectedSuggestion(anchors: readonly LoadAnchorRow[] = [anchorRow()]) {
    const [view] = [
      ...reviewLoadSuggestions({
        acceptance: SQUAT_DAY,
        anchors,
        evidence: evidenceRows(),
      }).values(),
    ]
    if (view?.weight == null) throw new Error('expected a weighted suggestion')
    return { ...view, weight: view.weight }
  }

  function renderSquatDay(options: HarnessOptions = {}) {
    return renderReview({
      acceptance: SQUAT_DAY,
      anchorRows: [anchorRow()],
      anchorEvidence: evidenceRows(),
      ...options,
    })
  }

  it('shows the rule table’s weight with its session-count confidence', async () => {
    renderSquatDay()
    const expected = expectedSuggestion()

    const suggestion = await screen.findByRole('button', { name: SUGGESTION_NAME })
    expect(suggestion).toHaveTextContent(weightText(expected.weight, 'kg'))
    expect(suggestion).toHaveTextContent(sessionCountText(4))
  })

  it('shows no suggestion, and no zero, where there is no anchor', async () => {
    renderSquatDay()
    await screen.findByRole('button', { name: SUGGESTION_NAME })

    // One anchored lift, one suggestion: bench press has none at all.
    expect(screen.getAllByRole('button', { name: SUGGESTION_NAME })).toHaveLength(1)
    expect(briefingText()).toContain('bench press')
    expect(briefingText()).not.toMatch(/\b0 kg\b/)
  })

  it('renders nothing for a user with no anchors, rather than a state of zero', async () => {
    renderSquatDay({ anchorRows: [], anchorEvidence: [] })
    await screen.findByRole('heading', { level: 1, name: 'Squat day' })

    await waitFor(() =>
      expect(screen.queryByText(new RegExp(SUGGESTIONS_LOADING_LABEL))).not.toBeInTheDocument(),
    )
    expect(screen.queryByRole('button', { name: SUGGESTION_NAME })).not.toBeInTheDocument()
  })

  it('reads a one-session anchor as low confidence, before the number', async () => {
    renderSquatDay({ anchorRows: [anchorRow({ session_count: 1, confidence: 'low' })] })

    const suggestion = await screen.findByRole('button', { name: SUGGESTION_NAME })
    expect(suggestion).toHaveAccessibleName(expect.stringContaining(LOW_CONFIDENCE_LABEL))
    const text = suggestion.textContent ?? ''
    expect(text.indexOf(LOW_CONFIDENCE_LABEL)).toBe(0)
    expect(suggestion).toHaveTextContent(sessionCountText(1))
  })

  it('opens a Dialog with last session’s sets, the RPE recorded and the rule', async () => {
    const user = userEvent.setup()
    renderSquatDay()
    const expected = expectedSuggestion()

    await user.click(await screen.findByRole('button', { name: SUGGESTION_NAME }))

    const dialog = await screen.findByRole('dialog', { name: new RegExp(WHY_TITLE) })
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(3)
    expect(dialog).toHaveTextContent('Set 1 · 8 of 8 reps · 85 kg · RPE 7.5')
    expect(dialog).toHaveTextContent('RPE 7.5 median across 3 sets')
    expect(dialog).toHaveTextContent(expected.reason)
    expect(dialog).toHaveTextContent('all reps completed → +1 increment')
    expect(dialog).toHaveTextContent(OVERRIDE_SCOPE_NOTE)
  })

  it('applies an override to this session’s prescription and never to the anchor', async () => {
    const user = userEvent.setup()
    let recomputed = 0
    const { recorder } = renderSquatDay({
      anchors: {
        async recompute() {
          recomputed += 1
          return ok([])
        },
      },
    })

    await user.click(await screen.findByRole('button', { name: SUGGESTION_NAME }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('spinbutton'), '205')
    await user.click(within(dialog).getByRole('button', { name: APPLY_OVERRIDE_LABEL }))

    expect(await screen.findByRole('button', { name: /^Your weight 205 kg/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: START_LABEL }))
    await screen.findByText(WORKOUT_MARKER)

    const [squat, bench] = recorder.accepted[0].acceptance.workout.sections[0].blocks[0].exercises
    expect(squat).toMatchObject({ load_type: 'absolute', load_value: 205 })
    // The lift that was not overridden keeps the prescription generation gave it.
    expect(bench).toMatchObject({ load_type: 'rir', load_value: 2 })
    // Nothing on this screen asks for the anchors to be rewritten.
    expect(recomputed).toBe(0)
  })

  it('accepts exactly the composed workout when nothing was overridden', async () => {
    const user = userEvent.setup()
    const { recorder } = renderSquatDay()
    await screen.findByRole('button', { name: SUGGESTION_NAME })

    await user.click(screen.getByRole('button', { name: START_LABEL }))
    await screen.findByText(WORKOUT_MARKER)

    expect(recorder.accepted[0].acceptance).toBe(SQUAT_DAY)
  })

  it('shows loading in the suggestion surface while the briefing renders and starts', async () => {
    const user = userEvent.setup()
    const { recorder } = renderSquatDay({
      anchors: {
        list: () => new Promise(() => undefined),
      },
    })

    expect(await screen.findByText(new RegExp(SUGGESTIONS_LOADING_LABEL))).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Squat day' })).toBeInTheDocument()
    expect(briefingText()).toContain('back squat')

    await user.click(screen.getByRole('button', { name: START_LABEL }))
    await screen.findByText(WORKOUT_MARKER)
    expect(recorder.accepted).toHaveLength(1)
  })

  it('shows a failed anchor read in the suggestion surface and keeps the briefing', async () => {
    renderSquatDay({
      anchors: {
        async list() {
          return err(createError(ErrorCode.PERSISTENCE_READ_FAILED))
        },
      },
    })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(SUGGESTIONS_ERROR_TITLE)
    expect(screen.getByRole('heading', { level: 1, name: 'Squat day' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: SUGGESTION_NAME })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: START_LABEL })).toBeEnabled()
  })

  it('shows a failed evidence read the same way, and recovers on retry', async () => {
    const user = userEvent.setup()
    let calls = 0
    renderSquatDay({
      anchors: {
        async evidence() {
          calls += 1
          return calls === 1
            ? err(createError(ErrorCode.PERSISTENCE_READ_FAILED))
            : ok(evidenceRows())
        },
      },
    })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(SUGGESTIONS_ERROR_TITLE)

    await user.click(within(alert).getByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('button', { name: SUGGESTION_NAME })).toBeInTheDocument()
  })
})
