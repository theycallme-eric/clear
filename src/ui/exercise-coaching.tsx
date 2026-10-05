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
 * Like the swap controls, it draws nothing when the workout clients are absent
 * — a block renderer previewed on its own has no row to read or write.
 *
 * Containment, from 0.14.3: the panel is one group and every label is inside
 * it. On an exercise's card it is that card's content; on its own it is one
 * card. Either way the disclosure, the cues, the regression and the note are
 * ruled sub-groups under their own headings — never a card in a card, and
 * never a label floating above a frame. The guidance's wait and the note's
 * save each take the view's one loop in turn, so neither animates against a
 * low rest timer; both stay marked busy while they are stilled.
 */
import { use, useState } from 'react'

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

export const NO_CUES_TEXT = 'No coaching cues are written for this movement.'
export const NO_REGRESSION_TEXT = 'No regression is written for this movement.'
export const NO_DEFINITION_TEXT =
  'The library has no entry for this movement, so there are no cues or regression.'
export const NOTE_SAVED_TEXT = 'Note saved'
export const NOTE_FAILED_TEXT =
  'Your note didn’t save. It is still in the field — try again.'

export interface ExerciseCoachingProps {
  exercise: ExerciseProgress
}

export function ExerciseCoaching({ exercise }: ExerciseCoachingProps) {
  const clients = use(WorkoutClientsContext)
  const cache = use(QueryClientContext)
  if (clients === null || cache === null) return null

  return <CoachingPanel exercise={exercise} />
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
      if (state.data === null) return <p style={{ margin: 0 }}>{NO_DEFINITION_TEXT}</p>
      return <Definition definition={state.data} />
  }
}

function Definition({ definition }: { definition: ExerciseDefinitionRow }) {
  return (
    <>
      <Card heading="Cues">
        {definition.coaching_cues.length === 0 ? (
          <p style={{ margin: 0 }}>{NO_CUES_TEXT}</p>
        ) : (
          <ul aria-label="Coaching cues" style={{ margin: 0 }}>
            {definition.coaching_cues.map((cue, index) => (
              <li key={index}>{cue}</li>
            ))}
          </ul>
        )}
      </Card>

      <Card heading="Regression">
        <p style={{ margin: 0 }}>
          {definition.regression === null ? NO_REGRESSION_TEXT : definition.regression}
        </p>
      </Card>
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

  return (
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
