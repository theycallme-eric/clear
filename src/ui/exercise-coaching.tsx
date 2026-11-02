/**
 * EXE-05 — the per-exercise panel: the library's coaching cues, its regression,
 * and the user's own note on this prescription.
 *
 * It is the IA's `ActiveExerciseCard` "cues, notes" (IA.md §3), and it sits on
 * every card `ExerciseSetLogger` draws. Two reads meet here and they fail
 * separately, which is the shape of the whole file:
 *
 *   · **The guidance** is the catalog's, read by slug through
 *     `useExerciseDefinitionQuery` — and only once the panel is first opened,
 *     because a session of twelve movements should not spend twelve requests on
 *     cues nobody looked at. All four states are real. An empty `coaching_cues`
 *     array and a null `regression` are the library answering "none", and the
 *     panel says so rather than drawing an empty box. A failed read is an error
 *     *inside the panel*: the set form beside it is a separate component with
 *     its own writer, and nothing here can take it down.
 *   · **The note** is a column on the prescription, written through the
 *     `saveNotes` path. The panel claims "saved" only when the row came back
 *     saying so; a failed write says it failed and leaves the typed text in the
 *     field, because retyping a thought mid-workout is the cost this prevents.
 *
 * It draws nothing when the workout clients are absent — a block renderer
 * previewed on its own has no row to read or write.
 *
 * Optional and per movement (U38): a standard movement keeps its disclosure.
 * Grouped work uses GroupExerciseCoaching (R29), one bottom disclosure with
 * separately labelled guidance and note writers for every movement.
 *
 * Containment, from 0.14.3: the panel is one group and every label is inside
 * it. On an exercise's card it is that card's content; on its own it is one
 * card. Either way the disclosure, the cues, the regression and the note are
 * ruled sub-groups under their own headings — never a card in a card, and
 * never a label floating above a frame. The guidance's wait and the note's
 * save each take the view's one loop in turn, so neither animates against a
 * low rest timer; both stay marked busy while they are stilled.
 */
import { createContext, use, useState } from 'react'

import { AlertTriangle, Button, CircleCheck, Input } from '../design-system/index'
import type { AppError } from '../state/errors'
import {
  useExerciseDefinitionQuery,
  useExerciseNotes,
} from '../state/exercise-queries'
import { exerciseName } from '../state/prescription'
import { QueryClientContext, type QueryState } from '../state/query'
import type { ExerciseDefinitionRow } from '../state/schemas'
import { WorkoutClientsContext } from '../state/workout-queries'
import type { ExerciseProgress } from '../state/workout-progress'
import { Card } from './card'
import { CollapsibleSection } from './collapsible-section'
import { HeadingSection } from './Heading'
import { useInterfaceLoop } from './motion'
import { ErrorView, LoadingView } from './view-state'
import { LoggingOverlay } from './logging-overlay'
import { useWorkoutExperiencePresentation } from './workout-experience-presentation'

export const NO_CUES_TEXT = 'No coaching cues are written for this movement.'
export const NO_REGRESSION_TEXT = 'No regression is written for this movement.'
export const NO_DEFINITION_TEXT =
  'The library has no entry for this movement, so there are no cues or regression.'
/** Whose words the cues and regression are: the library's, never generated. */
export const CATALOG_SOURCE_TEXT = 'From the exercise library'
export const NOTE_SAVED_TEXT = 'Note saved'
export const NOTE_FAILED_TEXT =
  'Your note didn’t save. It is still in the field — try again.'

export interface ExerciseCoachingProps {
  exercise: ExerciseProgress
}

/** The shared compound-block host owns disclosure placement, never note data. */
export const GroupCoachingContext = createContext(false)

export function ExerciseCoaching({ exercise }: ExerciseCoachingProps) {
  const grouped = use(GroupCoachingContext)
  const clients = use(WorkoutClientsContext)
  const cache = use(QueryClientContext)
  if (grouped || clients === null || cache === null) return null

  return <CoachingPanel exercise={exercise} />
}

/** One disclosure for grouped work; each movement keeps its own reads/writes. */
export function GroupExerciseCoaching({ exercises }: { exercises: readonly ExerciseProgress[] }) {
  const clients = use(WorkoutClientsContext)
  const cache = use(QueryClientContext)
  if (clients === null || cache === null || exercises.length === 0) return null
  return <GroupCoachingPanel exercises={exercises} />
}

function GroupCoachingPanel({ exercises }: { exercises: readonly ExerciseProgress[] }) {
  const [expanded, setExpanded] = useState(false)
  const [opened, setOpened] = useState(false)
  return (
    <Card>
      <CollapsibleSection label="Coaching and notes" expanded={expanded} onExpandedChange={next => { setExpanded(next); if (next) setOpened(true) }}>
        <div className="clr-stack">
          {exercises.map(exercise => {
            const name = exerciseName(exercise.prescription.exercise_id)
            return <Card key={exercise.exerciseId} heading={name}>
              {opened ? <Guidance exerciseId={exercise.prescription.exercise_id} name={name} /> : null}
              <ExerciseNotesField exercise={exercise} name={name} />
            </Card>
          })}
        </div>
      </CollapsibleSection>
    </Card>
  )
}

function CoachingPanel({ exercise }: ExerciseCoachingProps) {
  const name = exerciseName(exercise.prescription.exercise_id)
  // Sticky: once opened the definition stays asked for, so collapsing and
  // reopening shows what was read rather than loading it again.
  const [expanded, setExpanded] = useState(false)
  const [opened, setOpened] = useState(false)

  return (
    <Card>
      <CollapsibleSection
        label={`Coaching and notes — ${name}`}
        expanded={expanded}
        onExpandedChange={(next) => {
          setExpanded(next)
          if (next) setOpened(true)
        }}
      >
        {/* The sub-groups head one level below whatever the panel sits under. */}
        <HeadingSection className="clr-stack">
          {opened ? (
            <Guidance exerciseId={exercise.prescription.exercise_id} name={name} />
          ) : null}
          <ExerciseNotesField exercise={exercise} name={name} />
        </HeadingSection>
      </CollapsibleSection>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The library's guidance
// ─────────────────────────────────────────────────────────────────────────────

function Guidance({ exerciseId, name }: { exerciseId: string; name: string }) {
  const query = useExerciseDefinitionQuery(exerciseId)

  return <GuidanceView state={query.state} name={name} onRetry={query.refetch} />
}

interface GuidanceViewProps {
  state: QueryState<ExerciseDefinitionRow | null>
  name: string
  onRetry: () => void
}

/** The guidance in its four states; the empty ones are answers, not gaps. */
function GuidanceView({ state, name, onRetry }: GuidanceViewProps) {
  const proposal = useWorkoutExperiencePresentation()?.timedWorkflows !== undefined
  switch (state.status) {
    case 'loading':
      return <LoadingView label={`Reading coaching for ${name}`} />
    case 'error':
      return (
        <ErrorView
          error={state.error}
          title={`Coaching for ${name} didn’t load`}
          actionLabel="Try again"
          onRetry={onRetry}
        />
      )
    case 'ready':
      if (state.data === null) return proposal ? null : <p style={{ margin: 0 }}>{NO_DEFINITION_TEXT}</p>
      return <Definition definition={state.data} />
  }
}

/**
 * The catalog's own words, attributed to it (U38). This is library content
 * the user opened, not generated prose: REQ-010's removal of overviews and
 * section introductions does not reach it, and it is never mixed into them.
 * A blank cue or regression is the library saying nothing, and is stated as
 * an answer rather than drawn as an empty bullet or box.
 */
function Definition({ definition }: { definition: ExerciseDefinitionRow }) {
  const proposal = useWorkoutExperiencePresentation()?.timedWorkflows !== undefined
  const cues = definition.coaching_cues.filter((cue) => cue.trim() !== '')
  const regression = definition.regression?.trim() ? definition.regression : null
  if (proposal && cues.length === 0 && regression === null) return null

  return (
    <>
      <p className="label" style={{ margin: 0 }}>
        {CATALOG_SOURCE_TEXT}
      </p>

      {(!proposal || cues.length > 0) && <Card heading="Cues">
        {cues.length === 0 ? (
          <p style={{ margin: 0 }}>{NO_CUES_TEXT}</p>
        ) : (
          <ul aria-label="Coaching cues" style={{ margin: 0 }}>
            {cues.map((cue, index) => (
              <li key={index}>{cue}</li>
            ))}
          </ul>
        )}
      </Card>}

      {(!proposal || regression !== null) && <Card heading="Regression">
        <p style={{ margin: 0 }}>{regression ?? NO_REGRESSION_TEXT}</p>
      </Card>}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The user's note
// ─────────────────────────────────────────────────────────────────────────────

type NoteStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'saved' }
  | { readonly kind: 'failed'; readonly error: AppError }

function ExerciseNotesField({
  exercise,
  name,
}: {
  exercise: ExerciseProgress
  name: string
}) {
  const proposal = useWorkoutExperiencePresentation()?.loggingOverlay
  const [open, setOpen] = useState(false)
  const notes = useExerciseNotes(exercise.exerciseId)
  const [text, setText] = useState(
    () => notes.stored(exercise.prescription.exercise_notes) ?? '',
  )
  const [status, setStatus] = useState<NoteStatus>({ kind: 'idle' })
  const loop = useInterfaceLoop('busy', status.kind === 'saving')

  const save = async () => {
    setStatus({ kind: 'saving' })
    // An emptied field clears the note: the column is nullable, and a blank
    // string is not the same observation as no note at all.
    const trimmed = text.trim()
    const result = await notes.save(trimmed === '' ? null : text)
    setStatus(result.ok ? { kind: 'saved' } : { kind: 'failed', error: result.error })
  }

  const content = (
    // The field's label is above it and inside the group, so the note needs no
    // heading of its own.
    <div className="clr-stack clr-stack--tight">
      <Input
        label={`Notes — ${name}`}
        multiline
        rows={3}
        value={text}
        onChange={(value: string) => {
          setText(value)
          // An edit after a save is not saved yet; the line must not say so.
          if (status.kind === 'saved') setStatus({ kind: 'idle' })
        }}
        invalid={status.kind === 'failed'}
        errorText={status.kind === 'failed' ? NOTE_FAILED_TEXT : undefined}
      />
      <div
        className="clr-row"
        style={{ gap: 'var(--spacing-200)', alignItems: 'center' }}
        {...loop}
      >
        <Button
          variant="secondary"
          aria-label={`Save note — ${name}`}
          loading={status.kind === 'saving'}
          onClick={() => void save()}
        >
          Save note
        </Button>
        <NoteStatusLine status={status} />
      </div>
    </div>
  )
  return proposal ? <>
    <Button variant="secondary" onClick={() => setOpen(true)}>{text.trim() ? 'Edit note' : 'Add note'} — {name}</Button>
    {!open && <NoteStatusLine status={status} />}
    <LoggingOverlay open={open} title={`Notes — ${name}`} onClose={() => setOpen(false)}>{content}</LoggingOverlay>
  </> : content
}

/** Where the note has got to — a word and a glyph, never colour alone. */
function NoteStatusLine({ status }: { status: NoteStatus }) {
  return (
    <p
      className="label"
      role="status"
      style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--spacing-100)' }}
    >
      {status.kind === 'saving' ? 'Saving…' : null}
      {status.kind === 'saved' ? (
        <>
          <CircleCheck /> {NOTE_SAVED_TEXT}
        </>
      ) : null}
      {status.kind === 'failed' ? (
        <>
          <AlertTriangle /> Not saved
        </>
      ) : null}
    </p>
  )
}
