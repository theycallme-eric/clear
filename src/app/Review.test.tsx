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
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Route, Routes } from 'react-router-dom'

import type { AnchorsClient } from '../data/anchors'
import { createCandidatesClient, type Candidate, type CandidatesClient, type SectionCandidates } from '../data/candidates'
import type { UserConstraintRow } from '../data/constraints'
import type { GenerationInput } from '../data/generation'
import { regenerationInput } from '../state/review-handoff'
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
import { createWarmQueryClient, renderWithProviders, signedIn } from '../test/render'
import { createCandidatesDouble, type DoubleProfile } from '../test/candidates-double'
import { onboardedProfile } from '../test/user-data-double'
import { profileQueryKey } from '../state/user-queries'
import { createWorkoutDouble, snapshotFixture } from '../test/workout-double'
import {
  FACTS_LABEL,
  OVERVIEW_LABEL,
  REGENERATE_LABEL,
  Review,
  START_LABEL,
  TEMPO_DETAIL_LABEL,
} from './Review'

const LOCATION_ID = 'd0000001-0000-4000-8000-000000000000'

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
  /** U37: the swap's candidate read, and what it answers. */
  candidates?: Partial<CandidatesClient>
  candidateSets?: readonly SectionCandidates[]
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
    candidates: options.candidates,
    candidateSets: options.candidateSets,
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

  it('heads the facts inside one overview card, as readouts rather than frames', async () => {
    renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    const card = screen
      .getByRole('heading', { level: 2, name: OVERVIEW_LABEL })
      .closest<HTMLElement>('.clr-card')!
    expect(card.querySelectorAll('.clr-card__bar')).toHaveLength(1)

    // The description list is the card's content; each fact keeps its own
    // readout and none of them draws a second frame inside the card.
    const facts = card.querySelector<HTMLElement>('dl')!
    expect(facts).toHaveAttribute('aria-label', FACTS_LABEL)
    const strength = within(facts).getByText('Strength', { selector: 'dd' })
    const readout = strength.closest<HTMLElement>('.clr-metric-frame')!
    expect(readout).not.toHaveClass('clr-chamfer')
    expect(facts.querySelectorAll('.clr-metric-frame')).toHaveLength(5)
    expect(facts.querySelector('.clr-chamfer')).toBeNull()
  })

  it('gives every section its own card and nests no card anywhere', async () => {
    renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    const cards = [...screen.getByRole('main').querySelectorAll<HTMLElement>('.clr-card')]
    // A section's own disclosure, not the tempo detail nested inside one.
    const sections = screen
      .getAllByRole('region')
      .filter(
        (region) =>
          region.classList.contains('clr-collapsible__region') &&
          region.parentElement?.parentElement?.closest('.clr-collapsible__region') === null,
      )

    // One overview card and one card per section, each with its single bar.
    expect(sections.length).toBeGreaterThan(0)
    expect(cards).toHaveLength(sections.length + 1)
    for (const section of sections) {
      const card = section.closest<HTMLElement>('.clr-card')!
      expect(card.querySelectorAll('.clr-card__bar')).toHaveLength(1)
      // The heading row is inside the card: the trigger that names the section.
      expect(card.querySelector('.clr-collapsible__trigger')).not.toBeNull()
    }
    expect(document.querySelectorAll('.clr-card .clr-card')).toHaveLength(0)
    // Nothing but the title is left on the atmosphere.
    const stack = cards[0].closest('.clr-stack')!
    expect([...stack.children].every((child) => child.querySelector('.clr-card') !== null)).toBe(
      true,
    )
  })

  it('keeps both decisions at the measured edge, primary over secondary', async () => {
    renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    const footer = screen.getByRole('contentinfo')
    expect(footer.closest('.clr-scroll-region__foot')).toBeInTheDocument()
    expect(footer.closest('.clr-card')).toBeNull()

    const start = within(footer).getByRole('button', { name: START_LABEL })
    const regenerate = within(footer).getByRole('button', { name: REGENERATE_LABEL })
    expect(start).toHaveClass('clr-btn--primary')
    // Secondary is the framed button with no variant modifier.
    expect(regenerate).toHaveClass('clr-btn', 'clr-chamfer')
    expect(regenerate).not.toHaveClass('clr-btn--primary')
    expect(regenerate).not.toHaveClass('clr-btn--quiet')
    // Discarding is confirmed and irreversible, so it is never a text action,
    // and the footer holds exactly these two.
    expect(regenerate).not.toHaveClass('clr-text-action')
    expect(within(footer).getAllByRole('button')).toHaveLength(2)
    expect(footer.querySelectorAll('.clr-btn--primary')).toHaveLength(1)
    expect(start.closest('.clr-actions')).toBe(regenerate.closest('.clr-actions'))
  })

  it('renders every section, in the order it will be performed, under its type’s label', async () => {
    renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    const triggers = screen
      .getAllByRole('button', { expanded: true })
      .map((button) => button.textContent ?? '')
    expect(triggers).toEqual([
      expect.stringMatching(/^Warm-up\d+ movement/),
      expect.stringMatching(/^Primary lift\d+ movements/),
      expect.stringMatching(/^Accessory\d+ movements/),
      expect.stringMatching(/^Conditioning\d+ movements/),
      expect.stringMatching(/^Cooldown\d+ movement/),
    ])
  })

  it('never shows or follows a generated section title (REQ-011)', async () => {
    const custom = makeSessionAcceptance({
      ...ACCEPTANCE,
      workout: {
        ...ACCEPTANCE.workout,
        sections: ACCEPTANCE.workout.sections.map((section) => ({
          ...section,
          section_title: 'Leg Day Destroyer',
        })),
      },
    })
    const first = renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })
    const original = briefingText()
    first.unmount()

    const user = userEvent.setup()
    const { recorder } = renderReview({ acceptance: custom })
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    expect(briefingText()).toBe(original)
    expect(briefingText()).not.toContain('Leg Day Destroyer')
    // Start still goes where it always goes, and persists the payload as given.
    await user.click(screen.getByRole('button', { name: START_LABEL }))
    expect(await screen.findByText(WORKOUT_MARKER)).toBeInTheDocument()
    expect(recorder.accepted[0].acceptance.workout.sections[0].section_title).toBe(
      'Leg Day Destroyer',
    )
  })

  it('frames each superset and circuit as one numbered group, in prescribed order', async () => {
    renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    const superset = screen.getByRole('list', { name: 'superset, 4 rounds' })
    const members = within(superset).getAllByRole('listitem')
    expect(members.map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^1\. bench press/),
      expect.stringMatching(/^2\. bent over row/),
    ])
    expect(screen.getByRole('list', { name: 'circuit, 3 rounds' })).toBeInTheDocument()
    for (const timed of ['emom', 'amrap', 'for time']) {
      expect(screen.getAllByRole('list', { name: timed }).length).toBeGreaterThan(0)
    }
  })

  it('states the round count in the badge and the shared rest directly beside it', async () => {
    renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    const group = screen.getByRole('list', { name: 'superset, 4 rounds' }).parentElement!
    const [badge, rest] = [...group.children]
    expect(badge).toHaveTextContent('SUPERSET · 4 ROUNDS')
    expect(rest).toHaveTextContent('Rest 90s between rounds')
    expect(group.textContent?.match(/between rounds/g)).toHaveLength(1)
  })

  it('drops the STANDARD badge that says nothing, and keeps one that names a scheme', async () => {
    renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    const text = briefingText()
    expect(text).not.toMatch(/STANDARD(?! · )/)
    expect(text).toContain('STANDARD · LADDER UP')
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

  it('renders the load guidance and the rest', async () => {
    renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    const text = briefingText()
    expect(text).toContain('75% 1RM')
    expect(text).toContain('2 RIR')
    expect(text).toContain('Bodyweight')
    expect(text).toContain('Match last session')
    expect(text).toContain('Rest 180s')
    expect(text).toContain('90s between rounds')
  })

  it('moves tempo off the rows into an optional, collapsed detail that keeps it', async () => {
    const user = userEvent.setup()
    renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    expect(briefingText()).not.toContain('Tempo 3-1-1-0')
    const trigger = screen.getByRole('button', { name: TEMPO_DETAIL_LABEL })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    const detail = screen.getByRole('region', { name: TEMPO_DETAIL_LABEL })
    expect(detail.closest('.clr-card')).toHaveTextContent(/^.*Primary lift/)
    expect(within(detail).getByRole('listitem')).toHaveTextContent('back squat3-1-1-0')

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    // A timed prescription is the work, so it stays on its own row.
    expect(briefingText()).toContain('2 × 45 sec each side')
  })

  it('renders the block notes the composition carries', async () => {
    renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    expect(briefingText()).toContain('Build then come back down.')
  })

  it('keeps a collapsed section in the document, so nothing is removed by closing it', async () => {
    const user = userEvent.setup()
    renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    await user.click(screen.getByRole('button', { name: /Warm-up/ }))

    expect(screen.getByRole('button', { name: /Warm-up/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(briefingText()).toContain('air squat')
  })
})

describe('no generated overview or section introduction (REQ-010)', () => {
  // The spectrum sample is a legacy-shaped workout: it still carries an
  // overview and a section note, as sessions composed before prompt 5.2.0 do.
  const LEGACY_OVERVIEW = 'Every structure this app can prescribe, in one session.'
  const LEGACY_SECTION_NOTE = 'Move before you load.'
  const SPECTRUM = ACCEPTANCE.workout
  const NULL_PROSE = makeSessionAcceptance({
    ...ACCEPTANCE,
    workout: {
      ...SPECTRUM,
      overview: null,
      sections: SPECTRUM.sections.map((section) => ({ ...section, section_notes: null })),
    },
  })

  it('shows neither for a legacy workout that still carries both strings', async () => {
    expect(SPECTRUM.overview).toBe(LEGACY_OVERVIEW)
    expect(SPECTRUM.sections[0].section_notes).toBe(LEGACY_SECTION_NOTE)
    renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    const text = briefingText()
    expect(text).not.toContain(LEGACY_OVERVIEW)
    expect(text).not.toContain(LEGACY_SECTION_NOTE)
  })

  it('keeps every label and all structured work, timers and prescriptions', async () => {
    renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    for (const title of ['Warm-up', 'Primary lift']) {
      expect(screen.getByRole('button', { name: new RegExp(title) })).toBeInTheDocument()
    }
    const text = briefingText()
    expect(text).toContain('air squat')
    expect(text).toContain('75% 1RM')
    expect(text).toContain('Rest 180s')
    expect(text).toContain('90s between rounds')
    expect(text).toContain('Build then come back down.')
  })

  it('renders a null-prose workout exactly as the legacy one, with nothing in their place', async () => {
    const legacy = renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })
    const legacyText = briefingText()
    legacy.unmount()

    renderReview({ acceptance: NULL_PROSE })
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    // Identical text is the proof that no replacement narrative stands in for
    // the prose: it had no surface, so its absence changes nothing.
    expect(briefingText()).toBe(legacyText)
  })

  it('opens the overview card on its facts, with no paragraph above them', async () => {
    renderReview()
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    const card = screen
      .getByRole('heading', { level: 2, name: OVERVIEW_LABEL })
      .closest<HTMLElement>('.clr-card')!
    expect(card.querySelector('p')).toBeNull()
  })

  it('starts a legacy workout with its prose and structured work intact', async () => {
    const user = userEvent.setup()
    const { recorder } = renderReview()
    await user.click(await screen.findByRole('button', { name: START_LABEL }))

    await screen.findByText(WORKOUT_MARKER)
    // Display removal discards nothing: the payload persisted is the composed one.
    expect(recorder.accepted[0].acceptance.workout).toEqual(SPECTRUM)
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

  // REQ-009: the request a regeneration restates is the accepted session's
  // own, so a Recovery session regenerates as one and the Focus does not move.
  it.each([
    ['a standing Goal', 'strength', 'lower_body'],
    ['a Recovery session', 'active_recovery', 'upper_body'],
  ] as const)('restates the accepted Goal and Focus for %s', async (_, goal, focus) => {
    const user = userEvent.setup()
    const acceptance = makeSessionAcceptance({
      ...ACCEPTANCE,
      goal_preset: goal,
      session_focus: focus,
      location_id: LOCATION_ID,
    })
    const restated: (GenerationInput | null)[] = []
    renderReview({
      acceptance,
      onRegenerate: () => restated.push(regenerationInput(acceptance)),
    })
    await screen.findByRole('heading', { level: 1, name: 'Full spectrum' })

    await user.click(screen.getByRole('button', { name: REGENERATE_LABEL }))
    const dialog = await screen.findByRole('dialog')
    await user.click(
      within(dialog).getByRole('button', { name: 'Discard and regenerate' }),
    )

    expect(restated).toHaveLength(1)
    expect(restated[0]).toMatchObject({
      goal,
      focus,
      requested_intensity: acceptance.requested_intensity,
    })
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

describe('swapping a movement happens in Review, under the original constraints (U37)', () => {
  /** Back squat (barbell) and kb swing in the primary lift; air squat warms up. */
  const SWAPPABLE = makeSessionAcceptance()

  function candidate(overrides: Partial<Candidate>): Candidate {
    return {
      exerciseId: 'romanian-deadlift',
      name: 'Romanian deadlift',
      patterns: ['hinge'],
      primaryPatterns: ['hinge'],
      role: 'compound_lift',
      components: [],
      muscles: [],
      canBePrimary: true,
      usableEquipment: ['barbell', 'dumbbell'],
      ...overrides,
    }
  }

  /**
   * What the constrained retrieval answers: the primary lift's pool includes a
   * movement already in the workout, and another section's pool has a
   * movement that would be fine anywhere but here.
   */
  const CANDIDATE_SETS: readonly SectionCandidates[] = [
    {
      section: 'primary_lift',
      relaxed: false,
      candidates: [
        candidate({}),
        candidate({ exerciseId: 'kb-swing', name: 'Kettlebell swing', usableEquipment: ['kettlebell'] }),
        candidate({ exerciseId: 'goblet-squat', name: 'Goblet squat', usableEquipment: ['dumbbell'] }),
      ],
    },
    {
      section: 'warmup',
      relaxed: false,
      candidates: [candidate({ exerciseId: 'world-greatest-stretch', name: 'World’s greatest stretch', usableEquipment: ['bodyweight'] })],
    },
  ]

  function alternatives() {
    return within(screen.getByRole('list', { name: 'Alternatives' }))
  }

  function constrainedClient(profile: DoubleProfile, constraints: readonly UserConstraintRow[] = []) {
    const double = createCandidatesDouble({
      url: 'https://clear.test', anonKey: 'public-test-key', users: { token: 'user-1' },
      profiles: { 'user-1': profile }, constraints,
    })
    return {
      double,
      client: createCandidatesClient({
        url: 'https://clear.test', anonKey: 'public-test-key', accessToken: 'token', fetch: double.fetch,
      }),
    }
  }

  const SAVED_PROFILE: DoubleProfile = {
    goalPreset: 'strength', enabledSections: ['warmup', 'primary_lift'],
    locations: [{ id: SWAPPABLE.location_id!, isDefault: true, equipment: ['bodyweight', 'barbell', 'dumbbells', 'kettlebells'] }],
  }

  it('uses the actual retrieval adapter with the workout goal, not a different saved goal', async () => {
    const user = userEvent.setup()
    const { client, double } = constrainedClient({ ...SAVED_PROFILE, goalPreset: 'active_recovery' })
    const queryClient = createWarmQueryClient()
    queryClient.setData(profileQueryKey('user-1'), onboardedProfile({ goal_preset: 'active_recovery' }))
    renderReview({ acceptance: { ...SWAPPABLE, goal_preset: 'strength' }, candidates: client, queryClient })

    await user.click(screen.getByRole('button', { name: 'Swap back squat' }))
    expect(await screen.findByRole('button', { name: /^Deadlift\s*BARBELL$/ })).toBeInTheDocument()
    expect(double.requests()).toEqual([{ method: 'POST', path: '/rpc/generation_candidate_sets_for_goal' }])
  })

  it('reads current limitations and equipment for a subsequent Review sharing the same app cache', async () => {
    const user = userEvent.setup()
    const queryClient = createWarmQueryClient()
    const constraints: UserConstraintRow[] = []
    const profile = { ...SAVED_PROFILE }
    const { client, double } = constrainedClient(profile, constraints)
    const first = renderReview({ acceptance: SWAPPABLE, candidates: client, queryClient })

    await user.click(screen.getByRole('button', { name: 'Swap back squat' }))
    expect(await screen.findByRole('button', { name: /^Deadlift\s*BARBELL$/ })).toBeInTheDocument()
    first.unmount()

    // These are the saved changes the next SQL retrieval reads, not a replacement
    // canned answer: exclude a movement and remove barbell at the same location.
    constraints.push({
      id: 'exclude-rdl', user_id: 'user-1', action: 'exclude', persistence: 'persistent',
      applies_to_session_id: null, scope: 'exercise', target_exercise_id: 'rdl',
      target_pattern: null, target_equipment: null, note: null, created_at: '2026-10-21T21:00:00Z',
    })
    profile.locations = [{ id: SWAPPABLE.location_id!, isDefault: true, equipment: ['bodyweight', 'dumbbells', 'kettlebells'] }]
    renderReview({ acceptance: { ...SWAPPABLE }, candidates: client, queryClient })
    await user.click(screen.getByRole('button', { name: 'Swap back squat' }))

    await screen.findByRole('list', { name: 'Alternatives' })
    expect(alternatives().queryByRole('button', { name: /^Deadlift\s*BARBELL$/ })).toBeNull()
    expect(alternatives().queryByRole('button', { name: /^RDL\s/ })).toBeNull()
    expect(alternatives().queryByText('BARBELL')).toBeNull()
    expect(double.requests().filter((request) => request.path.includes('generation_candidate_sets'))).toHaveLength(2)
  })

  it('locks both swap and undo while Start persists the chosen composition', async () => {
    const user = userEvent.setup()
    const { recorder } = renderReview({ acceptance: SWAPPABLE, candidateSets: CANDIDATE_SETS, holdAccept: true })
    await user.click(screen.getByRole('button', { name: 'Swap back squat' }))
    await user.click(await screen.findByRole('button', { name: /Romanian deadlift/ }))
    await user.click(screen.getByRole('button', { name: START_LABEL }))

    expect(screen.getByRole('button', { name: 'Swap romanian deadlift' })).toBeDisabled()
    const undo = screen.getByRole('button', { name: 'Undo swap — back to back squat' })
    expect(undo).toBeDisabled()
    await user.click(undo)
    expect(recorder.accepted).toHaveLength(1)
    expect(recorder.accepted[0]?.acceptance.workout.sections[1].blocks[0].exercises[0].exercise_id).toBe('romanian-deadlift')
  })

  it('ignores a late answer from a disclosure that was closed and reopened', async () => {
    const user = userEvent.setup()
    let release!: (value: Result<SectionCandidates[]>) => void
    const retrieve = vi.fn< CandidatesClient['retrieve'] >()
      .mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
      .mockResolvedValue(ok([...CANDIDATE_SETS]))
    renderReview({ acceptance: SWAPPABLE, candidates: { retrieve } })

    await user.click(screen.getByRole('button', { name: 'Swap back squat' }))
    await screen.findByText('Finding alternatives')
    await user.click(screen.getByRole('button', { name: 'Keep back squat' }))
    await user.click(screen.getByRole('button', { name: 'Swap kb swing' }))
    expect(await screen.findByRole('button', { name: /Romanian deadlift/ })).toBeInTheDocument()

    await act(async () => { release(err(createError(ErrorCode.PERSISTENCE_READ_FAILED))) })
    expect(alternatives().getByRole('button', { name: /Romanian deadlift/ })).toBeInTheDocument()
    expect(screen.queryByText('Alternatives didn’t load')).toBeNull()
    expect(retrieve).toHaveBeenCalledTimes(2)
  })

  it('does not carry the previous movement’s manual load override into a swap', async () => {
    const user = userEvent.setup()
    const acceptance = suggestionAcceptance()
    const { recorder } = renderReview({ acceptance, anchorRows: [anchorRow()], anchorEvidence: evidenceRows(), candidateSets: CANDIDATE_SETS })
    await user.click(await screen.findByRole('button', { name: /^(Suggested|No suggested weight)/ }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('spinbutton'), '205')
    await user.click(within(dialog).getByRole('button', { name: APPLY_OVERRIDE_LABEL }))
    expect(await screen.findByRole('button', { name: /^Your weight 205 kg/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Swap back squat' }))
    await user.click(await screen.findByRole('button', { name: /Romanian deadlift/ }))
    expect(screen.queryByRole('button', { name: /^Your weight 205 kg/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: START_LABEL }))
    await screen.findByText(WORKOUT_MARKER)
    expect(recorder.accepted[0]?.acceptance.workout.sections[0].blocks[0].exercises[0]).toMatchObject({
      exercise_id: 'romanian-deadlift', load_type: 'rir', load_value: 2,
    })
  })

  it('offers a swap on every movement, named for the movement', () => {
    renderReview({ acceptance: SWAPPABLE, candidateSets: CANDIDATE_SETS })

    for (const name of ['air squat', 'back squat', 'kb swing']) {
      expect(screen.getByRole('button', { name: `Swap ${name}` })).toBeEnabled()
    }
  })

  it('reads alternatives for this composition only when asked, and offers only what fits', async () => {
    const user = userEvent.setup()
    const retrieve = vi.fn(async () => ok([...CANDIDATE_SETS]))
    renderReview({ acceptance: SWAPPABLE, candidates: { retrieve } })
    expect(retrieve).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Swap back squat' }))

    expect(await screen.findByRole('heading', { name: 'Swap back squat' })).toBeInTheDocument()
    expect(retrieve).toHaveBeenCalledWith(
      expect.objectContaining({ focus: 'lower_body', locationId: SWAPPABLE.location_id }),
    )
    const offered = (await screen.findByRole('list', { name: 'Alternatives' })).textContent
    // The same section, never a movement already in the workout, never another
    // section's pool — and the barbell already in hand where the movement takes it.
    expect(alternatives().getByRole('button', { name: /Romanian deadlift\s*BARBELL/ })).toBeInTheDocument()
    expect(alternatives().getByRole('button', { name: /Goblet squat\s*DUMBBELL/ })).toBeInTheDocument()
    expect(offered).not.toMatch(/Kettlebell swing/)
    expect(offered).not.toMatch(/greatest stretch/)
  })

  it('swaps the movement and keeps the slot’s work, and Start persists the swap', async () => {
    const user = userEvent.setup()
    const { recorder } = renderReview({ acceptance: SWAPPABLE, candidateSets: CANDIDATE_SETS })

    await user.click(screen.getByRole('button', { name: 'Swap back squat' }))
    await user.click(await screen.findByRole('button', { name: /Romanian deadlift/ }))

    await waitFor(() => expect(screen.queryByRole('list', { name: 'Alternatives' })).toBeNull())
    expect(screen.getByRole('button', { name: 'Swap romanian deadlift' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Swap back squat' })).toBeNull()

    await user.click(screen.getByRole('button', { name: START_LABEL }))
    await screen.findByText(WORKOUT_MARKER)

    const before = SWAPPABLE.workout.sections[1].blocks[0].exercises[0]
    const after = recorder.accepted[0]?.acceptance.workout.sections[1].blocks[0].exercises[0]
    expect(after).toEqual({ ...before, exercise_id: 'romanian-deadlift', equipment: 'barbell' })
    // Nothing else in the composition moved.
    expect(recorder.accepted[0]?.acceptance.workout.sections[0]).toEqual(SWAPPABLE.workout.sections[0])
  })

  it('undoes a swap back to the movement generation composed', async () => {
    const user = userEvent.setup()
    const { recorder } = renderReview({ acceptance: SWAPPABLE, candidateSets: CANDIDATE_SETS })
    expect(screen.queryByRole('button', { name: /Undo swap/ })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Swap back squat' }))
    await user.click(await screen.findByRole('button', { name: /Goblet squat/ }))
    await user.click(await screen.findByRole('button', { name: 'Undo swap — back to back squat' }))

    expect(screen.getByRole('button', { name: 'Swap back squat' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Undo swap/ })).toBeNull()

    await user.click(screen.getByRole('button', { name: START_LABEL }))
    await screen.findByText(WORKOUT_MARKER)
    expect(recorder.accepted[0]?.acceptance.workout).toEqual(SWAPPABLE.workout)
  })

  it('says so when nothing else fits the slot, and leaves the movement as it was', async () => {
    const user = userEvent.setup()
    renderReview({
      acceptance: SWAPPABLE,
      candidateSets: [{ section: 'primary_lift', relaxed: false, candidates: [candidate({ exerciseId: 'kb-swing' })] }],
    })

    await user.click(screen.getByRole('button', { name: 'Swap back squat' }))
    expect(await screen.findByText('Nothing else fits this slot')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Keep back squat' }))
    expect(screen.getByRole('button', { name: 'Swap back squat' })).toBeInTheDocument()
  })

  it('shows a failed read in the dialog and retries it', async () => {
    const user = userEvent.setup()
    let fail = true
    const retrieve = vi.fn(async () =>
      fail ? err(createError(ErrorCode.PERSISTENCE_READ_FAILED)) : ok([...CANDIDATE_SETS]),
    )
    renderReview({ acceptance: SWAPPABLE, candidates: { retrieve } })

    await user.click(screen.getByRole('button', { name: 'Swap back squat' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Alternatives didn’t load')

    fail = false
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', { name: /Romanian deadlift/ })).toBeInTheDocument()
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

  it('offers the suggestion as a text action inside its section’s card', async () => {
    renderSquatDay()

    const suggestion = await screen.findByRole('button', { name: SUGGESTION_NAME })
    expect(suggestion).toHaveClass('clr-text-action')
    expect(suggestion).not.toHaveClass('clr-btn')
    expect(suggestion.closest('.clr-chamfer')).toBe(suggestion.closest('.clr-card__body'))
    expect(suggestion.closest('.clr-collapsible__region')).not.toBeNull()
    expect(document.querySelectorAll('.clr-card .clr-card')).toHaveLength(0)
    // Quiet beside the screen's one primary, which stays in the footer.
    expect(document.querySelectorAll('.clr-btn--primary')).toHaveLength(1)
    expect(screen.getByRole('button', { name: START_LABEL })).toHaveClass('clr-btn--primary')
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

  it('shows an existing rep increase before Start and accepts that same target once', async () => {
    const user = userEvent.setup()
    const acceptance = suggestionAcceptance()
    acceptance.goal_preset = 'hypertrophy'
    const { recorder } = renderReview({
      acceptance,
      anchorRows: [anchorRow()],
      anchorEvidence: evidenceRows(),
    })
    await screen.findByRole('button', { name: SUGGESTION_NAME })
    expect(await screen.findByText('3 × 9 reps')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: START_LABEL }))
    await screen.findByText(WORKOUT_MARKER)
    const [squat, companion] = recorder.accepted[0].acceptance.workout.sections[0].blocks[0].exercises
    expect(squat).toMatchObject({ target_kind: 'fixed', target_value: 9 })
    expect(companion).toMatchObject({ target_kind: 'fixed', target_value: 8 })
    expect(acceptance.workout.sections[0].blocks[0].exercises[0].target_value).toBe(8)
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

    const loading = await screen.findByText(new RegExp(SUGGESTIONS_LOADING_LABEL))
    expect(loading.closest('[aria-busy="true"]')).not.toBeNull()
    expect(document.querySelectorAll('.clr-card .clr-card')).toHaveLength(0)
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
    // The failure is a card of its own between the overview and the sections.
    expect(alert.closest('.clr-card')).toBeNull()
    expect(alert.querySelectorAll('.clr-card')).toHaveLength(1)
    expect(document.querySelectorAll('.clr-card .clr-card')).toHaveLength(0)
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
