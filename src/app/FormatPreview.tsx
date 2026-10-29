/**
 * Format preview — `/settings/formats` (REQ-019 / E06, TASK-034).
 *
 * Settings links here so an athlete can see how each workout format reads —
 * its prescriptions, its timing and its execution states — without having to
 * generate, start or log anything to find out. It is the one surface the
 * requirement asks for, not the developer gallery: `/dev/gallery` stays behind
 * `import.meta.env.DEV` and nothing here imports from `src/dev/`.
 *
 * **Read-only is structural, not promised.** The screen reads no query, holds
 * no client and passes no handler to anything it draws. What it shows is
 * app-owned, format-only data declared below — the columns a format is made
 * of, never a whole session — drawn through the presentation the app already
 * ships for a record that cannot be changed:
 *
 *   · `SessionSectionCard` — History's detail renderer. A block's identity,
 *     its result or "Not scored", and each prescription with its status glyph
 *     and logged sets. Its only control is the disclosure.
 *   · `LadderRungs` without `onSelect` — the pattern as data, not a choice —
 *     beside the ladder renderer's own `timingSummary` and pacing note.
 *
 * Every word a format is described in comes from the same functions the
 * workout uses (`structureIdentity`, `prescriptionText`, `exerciseName`), so
 * the preview cannot drift into a second description of the formats. There is
 * no timing or progression engine here: a round's rung is `target_sequence[i]`.
 *
 * The four view states do not apply: nothing is read, so nothing can be
 * loading, empty or failed. The content is fixed at build time.
 */
import type { CSSProperties } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { ArrowLeft, IconButton } from '../design-system/index'
import type { Enums } from '../data/database.types'
import type { LadderRung } from '../state/ladder'
import {
  exerciseName,
  modalityUnit,
  prescriptionText,
  type PrescribedColumns,
} from '../state/prescription'
import type { LadderTiming } from '../state/schemas'
import {
  STATUS_LABELS,
  type BlockDetailView,
  type ExerciseDetailView,
  type LoggedSetView,
  type OutcomeMeasurement,
  type SectionDetailView,
} from '../state/session-detail'
import { cameFromSettings } from '../state/settings'
import { structureIdentity, type StructureColumns } from '../state/workout-progress'
import { Card } from '../ui/card'
import { Heading, HeadingSection } from '../ui/Heading'
import { LadderRungs } from '../ui/ladder-rungs'
import { PACING_NOTES, timingSummary } from '../ui/ladder-block'
import { SessionSectionCard } from '../ui/session-detail'
import { StructureBadge } from '../ui/workout-chrome'
import { Screen } from './Screen'

export const FORMAT_PREVIEW_ROUTE = '/settings/formats'
export const FORMAT_PREVIEW_TITLE = 'Workout formats'
export const FORMAT_PREVIEW_NOTE =
  'Fixed examples of how each format is shown. Nothing here generates or starts a workout, logs a set, or changes your training.'

// ─────────────────────────────────────────────────────────────────────────────
// The formats, as data
// ─────────────────────────────────────────────────────────────────────────────

/** One movement of a format: its prescription columns and how it went. */
interface PreviewMovement {
  readonly id: string
  readonly columns: PrescribedColumns
  readonly status: Enums<'execution_status'>
  readonly sets: readonly LoggedSetView[]
}

/** One block of a format: its structure columns, its result, its movements. */
interface PreviewBlock {
  readonly id: string
  readonly columns: StructureColumns
  /** `null` is a block nobody scored, which the renderer says in words. */
  readonly outcome: readonly OutcomeMeasurement[] | null
  readonly movements: readonly PreviewMovement[]
}

interface PreviewSection {
  readonly id: string
  readonly title: string
  readonly type: Enums<'section_type'>
  readonly blocks: readonly PreviewBlock[]
}

/** One ladder timing mode: the block, its stored timing and the rung reached. */
interface PreviewLadder {
  readonly id: string
  readonly heading: string
  readonly columns: StructureColumns
  readonly timing: LadderTiming
  readonly movement: PrescribedColumns
  /** The rung number reached, or `null` while nothing has been said. */
  readonly reached: number | null
}

function prescribed(
  exerciseId: string,
  target: Partial<PrescribedColumns> & Pick<PrescribedColumns, 'target_kind'>,
): PrescribedColumns {
  return {
    exercise_id: exerciseId,
    modality: 'reps',
    sets: null,
    target_value: null,
    target_min: null,
    target_max: null,
    target_sequence: null,
    per_side: false,
    distance_unit: null,
    ...target,
  }
}

function setRow(
  key: string,
  setNumber: number,
  values: Partial<Omit<LoggedSetView, 'key' | 'setNumber'>>,
): LoggedSetView {
  return {
    key,
    setNumber,
    isWarmup: false,
    reps: null,
    weight: null,
    rpe: null,
    duration: null,
    distance: null,
    ...values,
  }
}

function structure(
  structureType: Enums<'structure_type'>,
  columns: Partial<Omit<StructureColumns, 'structure_type'>> = {},
): StructureColumns {
  return {
    structure_type: structureType,
    rounds: null,
    timer_seconds: null,
    rep_scheme: 'fixed',
    ...columns,
  }
}

export const PREVIEW_SECTIONS: readonly PreviewSection[] = [
  {
    id: 'preview-strength',
    title: 'Strength formats',
    type: 'primary_lift',
    blocks: [
      {
        id: 'preview-standard',
        columns: structure('standard'),
        outcome: [],
        movements: [
          {
            id: 'preview-standard-squat',
            columns: prescribed('back-squat', { sets: 3, target_kind: 'fixed', target_value: 5 }),
            status: 'completed',
            sets: [
              setRow('squat-1', 1, { weight: '80 kg', reps: '5 reps', rpe: 'RPE 7' }),
              setRow('squat-2', 2, { weight: '80 kg', reps: '5 reps', rpe: 'RPE 8' }),
              setRow('squat-3', 3, { weight: '80 kg', reps: '5 reps' }),
            ],
          },
        ],
      },
      {
        id: 'preview-superset',
        columns: structure('superset'),
        outcome: null,
        movements: [
          {
            id: 'preview-superset-row',
            columns: prescribed('dumbbell-row', {
              sets: 3,
              target_kind: 'range',
              target_min: 8,
              target_max: 10,
              per_side: true,
            }),
            status: 'completed',
            sets: [setRow('row-1', 1, { weight: '22 kg', reps: '10 reps' })],
          },
          {
            id: 'preview-superset-plank',
            columns: prescribed('side-plank', {
              modality: 'time',
              sets: 3,
              target_kind: 'fixed',
              target_value: 30,
              per_side: true,
            }),
            status: 'skipped',
            sets: [],
          },
        ],
      },
    ],
  },
  {
    id: 'preview-conditioning',
    title: 'Conditioning formats',
    type: 'conditioning',
    blocks: [
      {
        id: 'preview-circuit',
        columns: structure('circuit', { rounds: 4 }),
        outcome: [
          { label: 'Rounds', value: '3 of 4' },
          { label: 'Elapsed', value: '12:40' },
        ],
        movements: [
          {
            id: 'preview-circuit-swing',
            columns: prescribed('kettlebell-swing', { target_kind: 'fixed', target_value: 15 }),
            status: 'completed',
            sets: [],
          },
          {
            id: 'preview-circuit-carry',
            columns: prescribed('farmer-carry', {
              modality: 'distance',
              target_kind: 'fixed',
              target_value: 40,
              distance_unit: 'm',
            }),
            status: 'completed',
            sets: [],
          },
        ],
      },
      {
        id: 'preview-emom',
        columns: structure('emom', { timer_seconds: 600 }),
        outcome: [{ label: 'Minutes', value: '8 of 10' }],
        movements: [
          {
            id: 'preview-emom-burpee',
            columns: prescribed('burpee', { target_kind: 'fixed', target_value: 8 }),
            status: 'completed',
            sets: [],
          },
        ],
      },
      {
        id: 'preview-amrap',
        columns: structure('amrap', { timer_seconds: 720 }),
        outcome: [
          { label: 'Rounds', value: '5' },
          { label: 'Partial round', value: '7 reps' },
        ],
        movements: [
          {
            id: 'preview-amrap-pushup',
            columns: prescribed('push-up', { target_kind: 'fixed', target_value: 10 }),
            status: 'completed',
            sets: [],
          },
          {
            id: 'preview-amrap-lunge',
            columns: prescribed('walking-lunge', {
              target_kind: 'fixed',
              target_value: 12,
              per_side: true,
            }),
            status: 'completed',
            sets: [],
          },
        ],
      },
      {
        id: 'preview-for-time',
        columns: structure('for_time', { timer_seconds: 900 }),
        outcome: null,
        movements: [
          {
            id: 'preview-for-time-row',
            columns: prescribed('rowing-machine', {
              modality: 'distance',
              target_kind: 'fixed',
              target_value: 1000,
              distance_unit: 'm',
            }),
            status: 'not_started',
            sets: [],
          },
        ],
      },
    ],
  },
]

const LADDER_SEQUENCE = [10, 8, 6, 4, 2]

export const PREVIEW_LADDERS: readonly PreviewLadder[] = [
  {
    id: 'preview-ladder-scheduled',
    heading: 'Scheduled starts',
    columns: structure('emom', { timer_seconds: 900, rep_scheme: 'ladder_down' }),
    timing: { mode: 'scheduled_starts', rounds: 5, interval_seconds: 180, cap_seconds: null },
    movement: prescribed('goblet-squat', { target_kind: 'sequence', target_sequence: LADDER_SEQUENCE }),
    reached: 5,
  },
  {
    id: 'preview-ladder-for-time',
    heading: 'For time',
    columns: structure('for_time', { timer_seconds: 720, rep_scheme: 'ladder_down' }),
    timing: { mode: 'for_time', rounds: 5, interval_seconds: null, cap_seconds: null },
    movement: prescribed('push-up', { target_kind: 'sequence', target_sequence: LADDER_SEQUENCE }),
    reached: 3,
  },
  {
    id: 'preview-ladder-capped',
    heading: 'Capped window',
    columns: structure('amrap', { timer_seconds: 600, rep_scheme: 'ladder_down' }),
    timing: { mode: 'capped_window', rounds: 5, interval_seconds: null, cap_seconds: 600 },
    movement: prescribed('kettlebell-swing', { target_kind: 'sequence', target_sequence: LADDER_SEQUENCE }),
    reached: null,
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Data → the read-only renderer's views
// ─────────────────────────────────────────────────────────────────────────────

function movementView(movement: PreviewMovement): ExerciseDetailView {
  return {
    id: movement.id,
    name: exerciseName(movement.columns.exercise_id),
    prescription: prescriptionText(movement.columns),
    status: movement.status,
    statusLabel: STATUS_LABELS[movement.status],
    lineage: 'prescribed',
    lineageLabel: null,
    sets: movement.sets,
  }
}

function blockView(block: PreviewBlock): BlockDetailView {
  return {
    id: block.id,
    identity: structureIdentity(block.columns),
    scored: block.outcome !== null,
    outcome: block.outcome ?? [],
    perceivedEffort: null,
    notes: null,
    exercises: block.movements.map(movementView),
  }
}

export function previewSectionView(section: PreviewSection): SectionDetailView {
  return {
    id: section.id,
    title: section.title,
    type: section.type,
    blocks: section.blocks.map(blockView),
  }
}

/** Rung `i` is `target_sequence[i]` — indexed, never parsed or computed. */
function rungsOf(movement: PrescribedColumns): readonly LadderRung[] {
  return (movement.target_sequence ?? []).map((target, index) => ({
    number: index + 1,
    targets: [target],
  }))
}

function reachedText(ladder: PreviewLadder): string {
  if (ladder.reached === null) return 'Not scored'
  return ladder.reached === ladder.timing.rounds
    ? 'Finished the ladder'
    : `Reached rung ${ladder.reached} of ${ladder.timing.rounds}`
}

// ─────────────────────────────────────────────────────────────────────────────
// The screen
// ─────────────────────────────────────────────────────────────────────────────

const TEXT_STYLE: CSSProperties = { margin: 0 }

export function FormatPreview() {
  const navigate = useNavigate()
  const arrival = useLocation()

  // E05's rule, as Places and equipment keeps it: opened from Settings, Back
  // returns to that entry; opened any other way, Settings takes this one's place.
  const backToSettings = () => {
    if (cameFromSettings(arrival.state)) void navigate(-1)
    else void navigate('/settings', { replace: true })
  }

  return (
    <>
      <Screen
        title={FORMAT_PREVIEW_TITLE}
        header={{
          actions: (
            <IconButton label="Settings" icon={<ArrowLeft size={20} />} onClick={backToSettings} />
          ),
        }}
      >
        <div className="clr-stack" data-format-preview="">
          <Card heading="Read-only preview">
            <p style={TEXT_STYLE}>{FORMAT_PREVIEW_NOTE}</p>
          </Card>
          {PREVIEW_SECTIONS.map((section) => (
            <SessionSectionCard key={section.id} section={previewSectionView(section)} />
          ))}
          <LadderTimingCard />
        </div>
      </Screen>
    </>
  )
}

/** The three ladder timing modes, each with its rungs and the rung reached. */
function LadderTimingCard() {
  return (
    <Card heading="Ladder timing">
      <div className="clr-stack">
        {PREVIEW_LADDERS.map((ladder) => (
          <HeadingSection
            key={ladder.id}
            aria-labelledby={ladder.id}
            className="clr-stack clr-stack--tight"
            data-preview-ladder={ladder.timing.mode}
          >
            <Heading id={ladder.id} className="label" style={TEXT_STYLE}>
              {ladder.heading}
            </Heading>
            <StructureBadge identity={structureIdentity(ladder.columns)} />
            <p style={TEXT_STYLE}>{timingSummary(ladder.timing, ladder.columns.timer_seconds)}</p>
            <p style={TEXT_STYLE}>{PACING_NOTES[ladder.timing.mode]}</p>
            <p style={TEXT_STYLE}>
              {exerciseName(ladder.movement.exercise_id)} · {prescriptionText(ladder.movement)}
            </p>
            <LadderRungs
              rungs={rungsOf(ladder.movement)}
              unit={modalityUnit(ladder.movement)}
              label={`${ladder.heading} rungs`}
              reached={ladder.reached}
            />
            <p style={TEXT_STYLE}>{reachedText(ladder)}</p>
          </HeadingSection>
        ))}
      </div>
    </Card>
  )
}
