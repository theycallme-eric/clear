/**
 * TASK-005 (REQ-005; C16, G11, G21, R29, R36, R73; JOURNEY-005) — one grouped
 * Coaching and notes disclosure, through the consumers the routes render.
 *
 * Review is the actual `/review` route (router, guard, handoff, briefing);
 * Workout is the actual `/workout` route its Start handoff lands on, with the
 * same composition persisted and started through the session client seam. The
 * library read and the note writer are the real owners' seams
 * (`ExercisesClient.definition`, `.saveNotes`), answered per movement by this
 * file so each movement's guidance state and each note's save or failure can be
 * proved apart. Browser geometry, keyboard, touch and reduced motion are
 * `e2e/refinement/task-005.spec.ts`.
 *
 * Synthetic data only: in-memory doubles, no account and no network.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { ExercisesClient } from '../data/exercises'
import type { SessionsClient } from '../data/sessions'
import { routes } from '../app/router'
import { REVIEW_PATH } from '../app/ReviewRoute'
import { GalleryRefinements } from '../dev/gallery-refinements'
import { createError, ErrorCode, err, ok, type Result } from '../state/errors'
import { reviewHandoff } from '../state/review-handoff'
import type { SessionAcceptance, SessionSnapshot, WorkoutExerciseRow } from '../state/schemas'
import {
  blankDefinition,
  COACHING_GUIDANCE,
  COACHING_LISTS,
  groupDisclosureName,
  groupedCoachingAcceptance,
  GROUPED_FORMATS,
  GROUPED_MOVEMENTS,
  writtenDefinition,
  type GuidanceAnswer,
} from '../test/grouped-coaching-fixture'
import { peerGroupingSnapshot } from '../test/peer-grouping-fixture'
import { AppProviders, signedIn } from '../test/render'
import { FIXTURE_USER_ID } from '../test/user-data-double'
import { createWorkoutDouble, snapshotFixture, type SectionFixture } from '../test/workout-double'
import {
  CATALOG_SOURCE_TEXT,
  GROUP_COACHING_LABEL,
  NO_CUES_TEXT,
  NO_DEFINITION_TEXT,
  NO_REGRESSION_TEXT,
  NOTE_FAILED_TEXT,
  NOTE_SAVED_TEXT,
} from './exercise-coaching'

// ─────────────────────────────────────────────────────────────────────────────
// The seams: one library answer and one note writer per movement
// ─────────────────────────────────────────────────────────────────────────────

/** The library, answering each slug as the fixture says, and every read it was asked for. */
function library(answers: Readonly<Record<string, GuidanceAnswer>> = COACHING_GUIDANCE) {
  const reads: string[] = []
  const failed = new Set<string>()
  const definition: ExercisesClient['definition'] = async (slug) => {
    reads.push(slug)
    switch (answers[slug] ?? 'absent') {
      case 'written':
        return ok(writtenDefinition(slug))
      case 'blank':
        return ok(blankDefinition(slug))
      case 'absent':
        return ok(null)
      case 'fails-once':
        if (!failed.has(slug)) {
          failed.add(slug)
          return err(createError(ErrorCode.PERSISTENCE_READ_FAILED))
        }
        return ok(writtenDefinition(slug))
      case 'held':
        return new Promise(() => {})
    }
  }
  return { definition, reads }
}

interface NoteWrite {
  readonly exerciseId: string
  readonly notes: string | null
  readonly stored: boolean
}

/**
 * The note writer: one row per call, as the real client writes. A prescription
 * id in `failFirst` is refused on its first write and stored on the next.
 */
function noteWriter(rows: ReadonlyMap<string, WorkoutExerciseRow>, failFirst: ReadonlySet<string> = new Set()) {
  const writes: NoteWrite[] = []
  const saveNotes: ExercisesClient['saveNotes'] = async (exerciseId, notes) => {
    const row = rows.get(exerciseId)
    const attempt = writes.filter((write) => write.exerciseId === exerciseId).length + 1
    if (row === undefined || (failFirst.has(exerciseId) && attempt === 1)) {
      writes.push({ exerciseId, notes, stored: false })
      return err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED))
    }
    writes.push({ exerciseId, notes, stored: true })
    return ok({ ...row, exercise_notes: notes })
  }
  return { saveNotes, writes }
}

function rowsOf(snapshot: SessionSnapshot): Map<string, WorkoutExerciseRow> {
  return new Map(
    snapshot.sections
      .flatMap((section) => section.blocks)
      .flatMap((block) => block.exercises)
      .map(({ exercise }) => [exercise.id, exercise]),
  )
}

/** A movement's prescription id in the persisted session, by its name. */
function idOf(snapshot: SessionSnapshot, name: string): string {
  const row = [...rowsOf(snapshot).values()].find((exercise) => exercise.exercise_id.replaceAll('-', ' ') === name)
  if (row === undefined) throw new Error(`no prescription for ${name}`)
  return row.id
}

// ─────────────────────────────────────────────────────────────────────────────
// The route harness: Review, Start, Workout
// ─────────────────────────────────────────────────────────────────────────────

interface JourneyOptions {
  answers?: Readonly<Record<string, GuidanceAnswer>>
  /** Movement names whose first note write is refused. */
  failFirst?: readonly string[]
  /** Adjusts the persisted session (a resumed workout's stored notes). */
  persisted?: (snapshot: SessionSnapshot) => SessionSnapshot
}

function journeyDouble(acceptance: SessionAcceptance, options: JourneyOptions = {}) {
  const startedAt = new Date(Date.now() - 60_000).toISOString()
  const adjust = options.persisted ?? ((snapshot: SessionSnapshot) => snapshot)
  const prescribed = adjust(peerGroupingSnapshot(acceptance, { userId: FIXTURE_USER_ID }))
  const running = adjust(peerGroupingSnapshot(acceptance, { userId: FIXTURE_USER_ID, startedAt }))
  let started = false
  const sessions: Partial<SessionsClient> = {
    async accept() {
      return ok(prescribed) as Result<SessionSnapshot>
    },
    async start() {
      started = true
      return ok({ session: running.session, state: 'active' as const })
    },
    async resume() {
      return ok(started ? running : null)
    },
    async snapshot() {
      return ok(running)
    },
  }
  const lib = library(options.answers)
  const notes = noteWriter(
    rowsOf(prescribed),
    new Set((options.failFirst ?? []).map((name) => idOf(prescribed, name))),
  )
  const double = createWorkoutDouble({
    session: null,
    sessions,
    exercises: { definition: lib.definition, saveNotes: notes.saveNotes },
  })
  return { double, prescribed, lib, notes }
}

/** JOURNEY-005's entry: the real router at `/review`, handed this composition. */
async function openReview(acceptance: SessionAcceptance, options: JourneyOptions = {}) {
  const journey = journeyDouble(acceptance, options)
  const router = createMemoryRouter(routes, {
    initialEntries: ['/', { pathname: REVIEW_PATH, state: reviewHandoff(acceptance) }],
    initialIndex: 1,
  })
  render(
    <AppProviders {...signedIn({ workout: journey.double.clients })}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  await screen.findByRole('heading', { level: 1, name: acceptance.workout.title })
  return { router, ...journey }
}

/** Start, then the `/workout` route the handoff lands on. */
async function startWorkout(router: ReturnType<typeof createMemoryRouter>) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Start workout' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/workout'))
  await screen.findByRole('list', { name: COACHING_LISTS.workout.superset })
}

/** Straight onto `/workout` with an active session already running. */
async function openWorkout(snapshot: SessionSnapshot, answers: Readonly<Record<string, GuidanceAnswer>> = {}) {
  const lib = library(answers)
  const notes = noteWriter(rowsOf(snapshot))
  const double = createWorkoutDouble({ session: snapshot, exercises: { definition: lib.definition, saveNotes: notes.saveNotes } })
  render(
    <AppProviders {...signedIn({ workout: double.clients })}>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/', '/workout'], initialIndex: 1 })} />
    </AppProviders>,
  )
  await screen.findByRole('navigation', { name: 'Workout sections' })
  return { double, lib, notes }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading the screen
// ─────────────────────────────────────────────────────────────────────────────

function liveCard(listName: string): HTMLElement {
  return screen.getByRole('list', { name: listName }).closest<HTMLElement>('[data-workout-card="workout"]')!
}

function disclosure(format: string, names: readonly string[]) {
  const name = groupDisclosureName(format, names)
  return { toggle: screen.getByRole('button', { name }), region: screen.getByRole('region', { name }) }
}

function section(region: HTMLElement, name: string): HTMLElement {
  return within(region).getByRole('group', { name })
}

function noteField(scope: HTMLElement, name: string): HTMLTextAreaElement {
  return within(scope).getByRole('textbox', { name: new RegExp(`^Notes — ${name}`) }) as HTMLTextAreaElement
}

/**
 * TASK-045: a movement's note is entered in the shared focused logging
 * dialog. Its section keeps one opener, "Add note — <movement>" (or "Edit
 * note — …" once the field holds words), and the dialog, titled "Notes —
 * <movement>", holds the field and Save note.
 */
function noteOpener(scope: HTMLElement, name: string): HTMLElement {
  return within(scope).getByRole('button', { name: new RegExp(`^(Add|Edit) note — ${name}$`) })
}

/** Opens one movement's note from its own section; answers its dialog. */
async function openNote(user: ReturnType<typeof userEvent.setup>, scope: HTMLElement, name: string): Promise<HTMLElement> {
  await user.click(noteOpener(scope, name))
  return screen.getByRole('dialog', { name: `Notes — ${name}` })
}

/** Closes the note's dialog with its X, keeping the draft. */
async function closeNote(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  await user.click(within(dialog).getByRole('button', { name: 'Close log' }))
}

/**
 * The note's own status line (not the guidance's wait): beside Save note in
 * its open dialog, or beside its opener in its section while closed.
 */
function statusText(scope: HTMLElement): string {
  const action = within(scope).queryByRole('button', { name: /^Save note — / }) ?? within(scope).getByRole('button', { name: /^(Add|Edit) note — / })
  return (within(action.closest<HTMLElement>('.clr-row')!).getByRole('status').textContent ?? '').trim()
}

/** Visible words only: the label without its assistive-technology qualifier. */
function visibleLabel(toggle: HTMLElement): string {
  const copy = toggle.cloneNode(true) as HTMLElement
  copy.querySelectorAll('.a11y-hidden').forEach((hidden) => hidden.remove())
  return (copy.textContent ?? '').trim()
}

/**
 * C16, R29: one bottom disclosure for this grouped card — closed, its visible
 * label the accepted words, after the movements and every action, the card's
 * last part — with a labelled section per movement in order, and no
 * disclosure in any movement row.
 */
function expectOneBottomDisclosure(card: HTMLElement, listName: string, format: string, names: readonly string[]) {
  const toggles = within(card).getAllByRole('button', { name: /^Coaching and notes/ })
  expect(toggles, `${listName}: one disclosure for the card`).toHaveLength(1)
  const { toggle, region } = disclosure(format, names)
  expect(toggles[0]).toBe(toggle)
  expect(visibleLabel(toggle)).toBe(GROUP_COACHING_LABEL)
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  // At the bottom: the card's last part, after the movement list and every control.
  expect(card.lastElementChild).toContainElement(toggle)
  const list = within(card).getByRole('list', { name: listName })
  expect(list).not.toContainElement(toggle)
  for (const control of within(card).getAllByRole('button')) {
    if (region.contains(control) || control === toggle) continue
    expect(control.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING, `${control.textContent} before the disclosure`).toBeTruthy()
  }
  // No disclosure repeated inside any movement row.
  for (const item of list.querySelectorAll(':scope > li')) {
    expect(within(item as HTMLElement).queryByRole('button', { name: /^Coaching and notes/ })).toBeNull()
  }
  // A labelled section per movement, in order, each heading its own name.
  const sections = [...region.querySelectorAll<HTMLElement>('[data-coaching-movement]')]
  expect(sections.map((entry) => within(entry).getAllByRole('heading')[0].textContent)).toEqual([...names])
  for (const name of names) {
    const own = section(region, name)
    // TASK-045: each section's own note entry is its opener; the field is in its dialog.
    expect(noteOpener(own, name)).toBeEnabled()
    expect(within(own).queryByRole('textbox')).toBeNull()
  }
  return { toggle, region }
}

// ─────────────────────────────────────────────────────────────────────────────

describe('TASK-005 one grouped coaching and notes disclosure', () => {
  it('AC-C16-01 /workout: each grouped block ends with one Coaching and notes disclosure with a labelled section per movement, and its rows carry none', async () => {
    const user = userEvent.setup()
    const { router, lib } = await openReview(groupedCoachingAcceptance())
    await startWorkout(router)

    const superset = expectOneBottomDisclosure(liveCard(COACHING_LISTS.workout.superset), COACHING_LISTS.workout.superset, GROUPED_FORMATS.superset, GROUPED_MOVEMENTS.superset)
    const circuit = expectOneBottomDisclosure(liveCard(COACHING_LISTS.workout.circuit), COACHING_LISTS.workout.circuit, GROUPED_FORMATS.circuit, GROUPED_MOVEMENTS.circuit)
    // Closed until asked for: no library read yet.
    expect(lib.reads).toEqual([])

    // The standard lift is no group: it keeps its own disclosure, in its row.
    const standard = liveCard(COACHING_LISTS.workout.standard)
    expect(within(standard).queryByRole('button', { name: /^Coaching and notes — back squat,/ })).toBeNull()
    const own = within(standard).getByRole('button', { name: 'Coaching and notes — back squat' })
    expect(within(standard).getByRole('list', { name: COACHING_LISTS.workout.standard })).toContainElement(own)

    // Each section heads one level below the card's movements' level, and is
    // the movement row heading's peer, never inside it.
    const rowHeading = within(screen.getByRole('list', { name: COACHING_LISTS.workout.superset })).getAllByRole('heading')[0]
    const sectionHeading = within(section(superset.region, 'dumbbell bench press')).getAllByRole('heading')[0]
    expect(sectionHeading.tagName).toBe(rowHeading.tagName)

    // Opened, every section reads its own movement's guidance, once each.
    await user.click(superset.toggle)
    expect(superset.toggle).toHaveAttribute('aria-expanded', 'true')
    expect(await within(section(superset.region, 'dumbbell bench press')).findByText('Cue for dumbbell bench press')).toBeInTheDocument()
    expect(await within(section(superset.region, 'chest supported row')).findByText(NO_DEFINITION_TEXT)).toBeInTheDocument()
    expect(lib.reads.sort()).toEqual(['chest-supported-row', 'dumbbell-bench-press'])
    // Cues and regression head one level below their movement's section.
    const cues = within(section(superset.region, 'dumbbell bench press')).getByRole('heading', { name: 'Cues' })
    expect(Number(cues.tagName.slice(1))).toBe(Number(sectionHeading.tagName.slice(1)) + 1)
    // Opening one block's disclosure opens no other.
    expect(circuit.toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('AC-C16-01 every grouped format — superset, circuit, EMOM, AMRAP, For Time and ladder — ends with one disclosure, and a standard block keeps each movement’s own', async () => {
    const two = (a: string, b: string) => [{ prescription: { exercise_id: a } }, { prescription: { exercise_id: b } }]
    const SECTIONS: SectionFixture[] = [{
      title: 'Conditioning',
      sectionType: 'conditioning',
      blocks: [
        { structureType: 'standard', exercises: two('back-squat', 'romanian-deadlift') },
        { structureType: 'superset', rounds: 3, exercises: two('bench-press', 'barbell-row') },
        { structureType: 'circuit', rounds: 2, exercises: two('kb-swing', 'push-up') },
        { structureType: 'emom', timerSeconds: 600, exercises: two('burpee', 'air-squat') },
        { structureType: 'amrap', timerSeconds: 480, exercises: two('wall-ball', 'box-jump') },
        { structureType: 'for_time', timerSeconds: 900, exercises: two('thruster', 'pull-up') },
        { structureType: 'for_time', timerSeconds: 900, repScheme: 'ladder_up', exercises: two('kettlebell-clean', 'lunge') },
      ],
    }]
    await openWorkout(snapshotFixture({ sections: SECTIONS, startedAt: new Date(Date.now() - 60_000).toISOString() }))

    const groups: ReadonlyArray<readonly [string, readonly string[]]> = [
      ['SUPERSET', ['bench press', 'barbell row']],
      ['CIRCUIT', ['kb swing', 'push up']],
      ['EMOM', ['burpee', 'air squat']],
      ['AMRAP', ['wall ball', 'box jump']],
      ['FOR TIME', ['thruster', 'pull up']],
      ['LADDER', ['kettlebell clean', 'lunge']],
    ]
    const cards = [...document.querySelectorAll<HTMLElement>('[data-workout-card="workout"]')]
    expect(cards).toHaveLength(7)
    for (const [index, [format, names]] of groups.entries()) {
      const card = cards[index + 1]
      const { toggle, region } = disclosure(format, names)
      expect(card.lastElementChild, names.join(', ')).toContainElement(toggle)
      expect(within(card).getAllByRole('button', { name: /^Coaching and notes/ }), names.join(', ')).toHaveLength(1)
      for (const name of names) expect(noteOpener(section(region, name), name)).toBeEnabled()
    }
    // The standard block: one disclosure per movement, none grouped.
    expect(within(cards[0]).getByRole('button', { name: 'Coaching and notes — back squat' })).toBeInTheDocument()
    expect(within(cards[0]).getByRole('button', { name: 'Coaching and notes — romanian deadlift' })).toBeInTheDocument()
    expect(cards[0].querySelector('[data-coaching-group]')).toBeNull()
    // Seven cards, eight disclosures: six grouped and the standard block's two.
    expect(screen.getAllByRole('button', { name: /^Coaching and notes/ })).toHaveLength(8)
  })

  it('AC-R005-01 each movement keeps its own draft, writer, save and error: one save writes only its row, a failed save keeps its text under its own name, and its retry writes it', async () => {
    const user = userEvent.setup()
    const { router, notes, prescribed } = await openReview(groupedCoachingAcceptance(), { failFirst: ['goblet squat'] })
    await startWorkout(router)
    const superset = disclosure(GROUPED_FORMATS.superset, GROUPED_MOVEMENTS.superset)
    const circuit = disclosure(GROUPED_FORMATS.circuit, GROUPED_MOVEMENTS.circuit)
    await user.click(superset.toggle)
    await user.click(circuit.toggle)

    const bench = section(superset.region, 'dumbbell bench press')
    const row = section(superset.region, 'chest supported row')
    const swing = section(circuit.region, 'kb swing')
    const goblet = section(circuit.region, 'goblet squat')

    // Independent drafts: typing in one field changes no other.
    let dialog = await openNote(user, bench, 'dumbbell bench press')
    await user.type(noteField(dialog, 'dumbbell bench press'), 'Elbows at 45')
    await closeNote(user, dialog)
    dialog = await openNote(user, row, 'chest supported row')
    await user.type(noteField(dialog, 'chest supported row'), 'Chest stays on the pad')
    await closeNote(user, dialog)
    dialog = await openNote(user, goblet, 'goblet squat')
    await user.type(noteField(dialog, 'goblet squat'), 'Heels down')
    await closeNote(user, dialog)
    dialog = await openNote(user, swing, 'kb swing')
    expect(noteField(dialog, 'kb swing')).toHaveValue('')
    await closeNote(user, dialog)

    // One save writes one row, with that movement's own words, and says so only there.
    dialog = await openNote(user, bench, 'dumbbell bench press')
    await user.click(within(dialog).getByRole('button', { name: 'Save note — dumbbell bench press' }))
    expect(await within(dialog).findByText(NOTE_SAVED_TEXT)).toBeInTheDocument()
    await closeNote(user, dialog)
    expect(notes.writes).toEqual([{ exerciseId: idOf(prescribed, 'dumbbell bench press'), notes: 'Elbows at 45', stored: true }])
    expect(statusText(row)).toBe('')
    dialog = await openNote(user, row, 'chest supported row')
    expect(noteField(dialog, 'chest supported row')).toHaveValue('Chest stays on the pad')
    await closeNote(user, dialog)

    // A failed save is the movement's own: its text stays, its field is marked,
    // and nothing else in the card or the other block changes.
    dialog = await openNote(user, goblet, 'goblet squat')
    await user.click(within(dialog).getByRole('button', { name: 'Save note — goblet squat' }))
    expect(await within(dialog).findByText(NOTE_FAILED_TEXT)).toBeInTheDocument()
    expect(statusText(dialog)).toContain('Not saved')
    expect(noteField(dialog, 'goblet squat')).toHaveValue('Heels down')
    expect(noteField(dialog, 'goblet squat')).toHaveAttribute('aria-invalid', 'true')
    await closeNote(user, dialog)
    expect(statusText(goblet)).toContain('Not saved')
    expect(within(bench).getByText(NOTE_SAVED_TEXT)).toBeInTheDocument()
    for (const other of [row, swing]) {
      expect(within(other).queryByText(NOTE_FAILED_TEXT)).toBeNull()
      expect(statusText(other)).toBe('')
    }

    // Its retry writes its row and clears only its own error.
    dialog = await openNote(user, goblet, 'goblet squat')
    await user.click(within(dialog).getByRole('button', { name: 'Save note — goblet squat' }))
    expect(await within(dialog).findByText(NOTE_SAVED_TEXT)).toBeInTheDocument()
    expect(within(dialog).queryByText(NOTE_FAILED_TEXT)).toBeNull()
    await closeNote(user, dialog)

    // Every write named one movement's row with that movement's own text: no
    // group value, and the unsaved partner was never written.
    const goblet_ = idOf(prescribed, 'goblet squat')
    expect(notes.writes).toEqual([
      { exerciseId: idOf(prescribed, 'dumbbell bench press'), notes: 'Elbows at 45', stored: true },
      { exerciseId: goblet_, notes: 'Heels down', stored: false },
      { exerciseId: goblet_, notes: 'Heels down', stored: true },
    ])
    expect(notes.writes.some((write) => write.exerciseId === idOf(prescribed, 'chest supported row'))).toBe(false)
    expect(statusText(row)).toBe('')
    dialog = await openNote(user, row, 'chest supported row')
    expect(noteField(dialog, 'chest supported row')).toHaveValue('Chest stays on the pad')
  })

  it('AC-R005-01 keeps the note of a movement the library has no entry for, and saves it', async () => {
    const user = userEvent.setup()
    const { router, notes, prescribed } = await openReview(groupedCoachingAcceptance())
    await startWorkout(router)
    const superset = disclosure(GROUPED_FORMATS.superset, GROUPED_MOVEMENTS.superset)
    await user.click(superset.toggle)
    const row = section(superset.region, 'chest supported row')

    expect(await within(row).findByText(NO_DEFINITION_TEXT)).toBeInTheDocument()
    const dialog = await openNote(user, row, 'chest supported row')
    const field = noteField(dialog, 'chest supported row')
    expect(field).toBeEnabled()
    await user.type(field, 'Use the incline bench')
    await user.click(within(dialog).getByRole('button', { name: 'Save note — chest supported row' }))
    expect(await within(dialog).findByText(NOTE_SAVED_TEXT)).toBeInTheDocument()
    expect(notes.writes).toEqual([{ exerciseId: idOf(prescribed, 'chest supported row'), notes: 'Use the incline bench', stored: true }])
  })

  it('AC-R005-01 a resumed workout shows each movement’s stored note in its own section, and a blank note stays blank', async () => {
    const acceptance = groupedCoachingAcceptance()
    const stored = (snapshot: SessionSnapshot): SessionSnapshot => ({
      ...snapshot,
      sections: snapshot.sections.map((entry) => ({
        ...entry,
        blocks: entry.blocks.map((block) => ({
          ...block,
          exercises: block.exercises.map((item) =>
            item.exercise.exercise_id === 'kb-swing'
              ? { ...item, exercise: { ...item.exercise, exercise_notes: 'Grip chalked' } }
              : item,
          ),
        })),
      })),
    })
    const running = stored(peerGroupingSnapshot(acceptance, { userId: FIXTURE_USER_ID, startedAt: new Date(Date.now() - 60_000).toISOString() }))
    const { notes } = await openWorkout(running, COACHING_GUIDANCE)
    const user = userEvent.setup()
    const circuit = disclosure(GROUPED_FORMATS.circuit, GROUPED_MOVEMENTS.circuit)

    // The stored note: its opener says Edit, and its dialog holds the words.
    expect(noteOpener(section(circuit.region, 'kb swing'), 'kb swing')).toHaveTextContent(/^Edit note/)
    let dialog = await openNote(user, section(circuit.region, 'kb swing'), 'kb swing')
    expect(noteField(dialog, 'kb swing')).toHaveValue('Grip chalked')
    await closeNote(user, dialog)
    for (const name of ['mountain climber', 'goblet squat']) {
      const own = section(circuit.region, name)
      // Blank is blank: no stored words borrowed from a partner, no status claimed.
      expect(noteOpener(own, name)).toHaveTextContent(/^Add note/)
      dialog = await openNote(user, own, name)
      expect(noteField(dialog, name)).toHaveValue('')
      expect(statusText(dialog)).toBe('')
      await closeNote(user, dialog)
      expect(statusText(own)).toBe('')
      expect(within(own).queryByText(NOTE_SAVED_TEXT)).toBeNull()
    }
    expect(notes.writes).toEqual([])
  })

  it('AC-R005-02 written guidance, blank guidance, no entry, loading and a failed read stay distinct, each in its own movement’s section, with no hide or replacement rule', async () => {
    const user = userEvent.setup()
    const answers: Readonly<Record<string, GuidanceAnswer>> = {
      ...COACHING_GUIDANCE,
      // A second movement without an entry: the library's answer is repeated
      // per movement, as it is, rather than hidden or replaced (R73, G21).
      'dumbbell-bench-press': 'held',
    }
    const { router, lib } = await openReview(groupedCoachingAcceptance(), { answers: { ...answers, 'kb-swing': 'absent' } })
    await startWorkout(router)
    const superset = disclosure(GROUPED_FORMATS.superset, GROUPED_MOVEMENTS.superset)
    const circuit = disclosure(GROUPED_FORMATS.circuit, GROUPED_MOVEMENTS.circuit)
    await user.click(superset.toggle)
    await user.click(circuit.toggle)

    const bench = section(superset.region, 'dumbbell bench press')
    const row = section(superset.region, 'chest supported row')
    const swing = section(circuit.region, 'kb swing')
    const climber = section(circuit.region, 'mountain climber')
    const goblet = section(circuit.region, 'goblet squat')

    // Loading: busy in its own section only, the note beside it usable.
    const wait = within(bench).getByRole('status', { busy: true })
    expect(wait).toHaveTextContent('Reading coaching for dumbbell bench press')
    expect(noteOpener(bench, 'dumbbell bench press')).toBeEnabled()
    // No entry: the library's own answer, repeated per movement, unchanged.
    expect(await within(row).findByText(NO_DEFINITION_TEXT)).toBeInTheDocument()
    expect(await within(swing).findByText(NO_DEFINITION_TEXT)).toBeInTheDocument()
    expect(screen.getAllByText(NO_DEFINITION_TEXT)).toHaveLength(2)
    // Blank guidance: an entry that says nothing, said as answers.
    expect(await within(climber).findByText(NO_CUES_TEXT)).toBeInTheDocument()
    expect(within(climber).getByText(NO_REGRESSION_TEXT)).toBeInTheDocument()
    expect(within(climber).getByText(CATALOG_SOURCE_TEXT)).toBeInTheDocument()
    expect(within(climber).queryByText(NO_DEFINITION_TEXT)).toBeNull()
    // A failed read: an error with its retry, in its own section only.
    const alert = await within(goblet).findByRole('alert')
    expect(alert).toHaveTextContent('Coaching for goblet squat didn’t load')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    // Each state stays its own: no section shows another's words.
    expect(within(row).queryByRole('alert')).toBeNull()
    expect(within(goblet).queryByText(NO_DEFINITION_TEXT)).toBeNull()
    expect(within(bench).queryByText(NO_DEFINITION_TEXT)).toBeNull()
    expect(within(swing).queryByRole('status', { busy: true })).toBeNull()
    // Blank user notes are their own state too: every note entry is present
    // and empty, whatever its movement's guidance said, with no status claimed.
    for (const [scope, name] of [[bench, 'dumbbell bench press'], [row, 'chest supported row'], [swing, 'kb swing'], [climber, 'mountain climber'], [goblet, 'goblet squat']] as const) {
      expect(noteOpener(scope, name)).toHaveTextContent(/^Add note/)
      expect(noteOpener(scope, name)).toBeEnabled()
      expect(statusText(scope)).toBe('')
    }

    // Retry reads only the failed movement again, and recovers only it.
    const before = lib.reads.length
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await within(goblet).findByText('Cue for goblet squat')).toBeInTheDocument()
    expect(lib.reads.slice(before)).toEqual(['goblet-squat'])
    expect(within(bench).getByRole('status', { busy: true })).toHaveTextContent('Reading coaching for dumbbell bench press')
    expect(screen.queryAllByRole('alert')).toEqual([])
  })

  it('JOURNEY-005 opens Review, starts that same workout, opens the bottom disclosure and edits one movement’s note; closing and reopening keeps every draft', async () => {
    const user = userEvent.setup()
    const { router, notes, prescribed, double } = await openReview(groupedCoachingAcceptance())

    // Review: the same grouped blocks, planned. No note can be written before
    // Start — there is no prescription row yet — so Review offers no field.
    for (const list of Object.values(COACHING_LISTS.review)) expect(screen.getByRole('list', { name: list })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Coaching and notes/ })).toBeNull()
    expect(screen.queryByRole('textbox', { name: /^Notes — / })).toBeNull()
    expect(screen.queryByRole('button', { name: /^(Add|Edit) note — / })).toBeNull()

    await startWorkout(router)
    const superset = disclosure(GROUPED_FORMATS.superset, GROUPED_MOVEMENTS.superset)
    await user.click(superset.toggle)
    const bench = section(superset.region, 'dumbbell bench press')
    const row = section(superset.region, 'chest supported row')
    let dialog = await openNote(user, bench, 'dumbbell bench press')
    await user.type(noteField(dialog, 'dumbbell bench press'), 'Pause at the bottom')
    await closeNote(user, dialog)
    dialog = await openNote(user, row, 'chest supported row')
    await user.type(noteField(dialog, 'chest supported row'), 'Squeeze at the top')
    await closeNote(user, dialog)

    // Close and reopen: nothing is unmounted, so both drafts are still there.
    await user.click(superset.toggle)
    expect(superset.toggle).toHaveAttribute('aria-expanded', 'false')
    expect(superset.region).toHaveAttribute('data-expanded', 'false')
    await user.click(superset.toggle)
    dialog = await openNote(user, row, 'chest supported row')
    expect(noteField(dialog, 'chest supported row')).toHaveValue('Squeeze at the top')
    await closeNote(user, dialog)
    dialog = await openNote(user, bench, 'dumbbell bench press')
    expect(noteField(dialog, 'dumbbell bench press')).toHaveValue('Pause at the bottom')

    // Edit one movement's note and save it: one write, to that started row.
    await user.click(within(dialog).getByRole('button', { name: 'Save note — dumbbell bench press' }))
    expect(await within(dialog).findByText(NOTE_SAVED_TEXT)).toBeInTheDocument()
    expect(notes.writes).toEqual([{ exerciseId: idOf(prescribed, 'dumbbell bench press'), notes: 'Pause at the bottom', stored: true }])
    // An edit after a save is not saved yet, and says nothing until it is.
    await user.type(noteField(dialog, 'dumbbell bench press'), '.')
    expect(within(dialog).queryByText(NOTE_SAVED_TEXT)).toBeNull()
    await closeNote(user, dialog)
    expect(within(bench).queryByText(NOTE_SAVED_TEXT)).toBeNull()
    // The partner's draft is untouched and unsaved.
    expect(statusText(row)).toBe('')
    dialog = await openNote(user, row, 'chest supported row')
    expect(noteField(dialog, 'chest supported row')).toHaveValue('Squeeze at the top')
    // No performed work is recorded by any of it.
    expect(double.loggedSets()).toEqual([])
    expect(double.recorded()).toEqual([])
  })

  it('JOURNEY-005 recovery: a failed save keeps its draft through close and reopen, its retry stores it, and no performed work is recorded', async () => {
    const user = userEvent.setup()
    const { router, notes, prescribed, double } = await openReview(groupedCoachingAcceptance(), { failFirst: ['kb swing'] })
    await startWorkout(router)
    const circuit = disclosure(GROUPED_FORMATS.circuit, GROUPED_MOVEMENTS.circuit)
    await user.click(circuit.toggle)
    const swing = section(circuit.region, 'kb swing')

    let dialog = await openNote(user, swing, 'kb swing')
    await user.type(noteField(dialog, 'kb swing'), 'Bell felt heavy in round two')
    await user.click(within(dialog).getByRole('button', { name: 'Save note — kb swing' }))
    expect(await within(dialog).findByText(NOTE_FAILED_TEXT)).toBeInTheDocument()

    // Closed and reopened, the failure and the typed words are still its own.
    await closeNote(user, dialog)
    expect(statusText(swing)).toContain('Not saved')
    await user.click(circuit.toggle)
    await user.click(circuit.toggle)
    dialog = await openNote(user, swing, 'kb swing')
    expect(noteField(dialog, 'kb swing')).toHaveValue('Bell felt heavy in round two')
    expect(within(dialog).getByText(NOTE_FAILED_TEXT)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Save note — kb swing' }))
    expect(await within(dialog).findByText(NOTE_SAVED_TEXT)).toBeInTheDocument()
    expect(noteField(dialog, 'kb swing')).toHaveValue('Bell felt heavy in round two')
    const id = idOf(prescribed, 'kb swing')
    expect(notes.writes).toEqual([
      { exerciseId: id, notes: 'Bell felt heavy in round two', stored: false },
      { exerciseId: id, notes: 'Bell felt heavy in round two', stored: true },
    ])
    // A note is not performed work: no set, no round, no block result.
    expect(double.loggedSets()).toEqual([])
    expect(double.recorded()).toEqual([])
    expect(screen.getByRole('button', { name: 'Start round 1' })).toBeInTheDocument()
  })

  it('renders the accepted gallery state cards with the actual disclosure at the foot of each grouped live card', async () => {
    const user = userEvent.setup()
    const fetch = vi.spyOn(globalThis, 'fetch')
    render(
      <MemoryRouter initialEntries={['/gallery/refinements?state=cards']}>
        <GalleryRefinements />
      </MemoryRouter>,
    )
    const state = document.querySelector<HTMLElement>('[data-refinement-state="cards"]')!
    const review = state.querySelector<HTMLElement>('[data-gallery-context="review"]')!
    const workout = state.querySelector<HTMLElement>('[data-gallery-context="workout"]')!

    // Review draws none; Workout's grouped cards each end with one.
    expect(within(review).queryByRole('button', { name: /^Coaching and notes/ })).toBeNull()
    const liveCards = [...workout.querySelectorAll<HTMLElement>('[data-workout-card="workout"]')]
    expect(liveCards).toHaveLength(3)
    expect(liveCards[0].querySelector('[data-coaching-group]')).toBeNull()
    const supersetNames = ['single arm kettlebell overhead reverse lunge to knee drive', 'push up']
    const circuitNames = ['kb swing', 'mountain climber', 'plank']
    for (const [card, format, names] of [[liveCards[1], 'SUPERSET', supersetNames], [liveCards[2], 'CIRCUIT', circuitNames]] as const) {
      const toggle = within(card).getByRole('button', { name: groupDisclosureName(format, names) })
      expect(card.lastElementChild).toContainElement(toggle)
      expect(visibleLabel(toggle)).toBe(GROUP_COACHING_LABEL)
    }

    // The actual owner, over memory-only controllers: guidance, blank guidance
    // and no entry read apart; a note saves in memory.
    const circuit = within(workout).getByRole('region', { name: groupDisclosureName('CIRCUIT', circuitNames) })
    await user.click(within(workout).getByRole('button', { name: groupDisclosureName('CIRCUIT', circuitNames) }))
    expect(await within(section(circuit, 'kb swing')).findByText('Hinge at the hips, not the knees')).toBeInTheDocument()
    expect(await within(section(circuit, 'mountain climber')).findByText(NO_DEFINITION_TEXT)).toBeInTheDocument()
    expect(await within(section(circuit, 'plank')).findByText(NO_CUES_TEXT)).toBeInTheDocument()
    const plank = await openNote(user, section(circuit, 'plank'), 'plank')
    await user.type(noteField(plank, 'plank'), 'Hips level')
    await user.click(within(plank).getByRole('button', { name: 'Save note — plank' }))
    expect(await within(plank).findByText(NOTE_SAVED_TEXT)).toBeInTheDocument()
    await closeNote(user, plank)
    expect(within(section(circuit, 'plank')).getByText(NOTE_SAVED_TEXT)).toBeInTheDocument()
    expect(statusText(section(circuit, 'kb swing'))).toBe('')

    // The timed composition: EMOM, AMRAP and For Time each end with one.
    await user.click(within(state).getByRole('radio', { name: /EMOM, AMRAP and For Time/ }))
    const timed = [...workout.querySelectorAll<HTMLElement>('[data-workout-card="workout"]')]
    expect(timed).toHaveLength(3)
    for (const card of timed) {
      const groups = card.querySelectorAll('[data-coaching-group]')
      expect(groups).toHaveLength(1)
      expect(card.lastElementChild).toBe(groups[0])
    }
    expect(fetch).not.toHaveBeenCalled()
  })
})
