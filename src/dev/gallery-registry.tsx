/**
 * DS-07 — the app-composed half of the gallery, part by part and state by
 * state.
 *
 * This file is the register REQ-029's last criterion rests on: *adding a
 * component to DS-04 or DS-05 without adding it to the gallery fails review*.
 * `gallery-registry.test.tsx` reads every component `src/ui/` exports and
 * requires each one to appear here, or to be recorded there as belonging to
 * another requirement with the reason written down. The gate is a test, not a
 * habit — an app-owned component nobody framed makes the suite red.
 *
 * Each entry lists the states a reviewer has to be able to see. A specimen is a
 * component rather than an element so a state that only exists through
 * interaction — a chosen option, an open modal, a queued toast — can own the
 * state that produces it.
 */
import { useState, type ReactNode } from 'react'

import { Button, Chip } from '../design-system/index'
import {
  applyAppearance,
  SYSTEM_APPEARANCE,
  type AppearanceChoice,
} from '../state/appearance'
import type { ConditioningScore, ScoreComparison } from '../state/conditioning'
import { createError, ErrorCode, type AppError } from '../state/errors'
import type { HistoryEntry } from '../state/history'
import type { WeekDay } from '../state/home'
import { MOOD_SCALE } from '../state/mood'
import type { BlockDetailView, SectionDetailView } from '../state/session-detail'
import type { LadderRung } from '../state/ladder'
import { toastQueue } from '../state/toasts'
import {
  viewEmpty,
  viewError,
  viewLoading,
  viewReady,
  type ViewState,
} from '../state/view-state'
import { AppDialog } from '../ui/app-dialog'
import { AppearancePicker } from '../ui/appearance-picker'
import { AtmosphereLayer } from '../ui/atmosphere'
import { ConfirmDialog, ErrorDialog } from '../ui/blocking-dialog'
import { Card } from '../ui/card'
import { CollapsibleSection } from '../ui/collapsible-section'
import { ConditioningScoreLine } from '../ui/conditioning-score'
import { Heading, HeadingSection } from '../ui/Heading'
import { HistoryList, WorkoutListItem } from '../ui/history-list'
import { LadderRungs } from '../ui/ladder-rungs'
import { MoodReading } from '../ui/mood'
import { Select } from '../ui/select'
import {
  LoggedSetTable,
  SessionProvenance,
  SessionSectionCard,
  StructureResultBadge,
} from '../ui/session-detail'
import { ToastHost } from '../ui/toast-host'
import { ErrorView, LoadingView, ViewStateSwitch } from '../ui/view-state'
import { WeekStrip } from '../ui/week-strip'
import type { AtmosphereLevel } from '../app/atmosphere'
import { ATMOSPHERE_LABELS, ATMOSPHERE_LEVELS } from './gallery-atmosphere'

/** One reviewable state of one part. */
export interface GallerySpecimen {
  /** The state, named the way the component's own props name it. */
  state: string
  /** What the reviewer is looking for, when the frame does not say it. */
  note?: string
  Render: () => ReactNode
}

/** One app-composed part, with every state it can be in. */
export interface GalleryEntry {
  /** Exported component name — what the coverage gate matches on. */
  component: string
  /** The DAG node that owns it. */
  requirement: string
  /** Module path, so a reviewer can go and read it. */
  module: string
  /** One line on what the part is for. */
  summary: string
  specimens: readonly GallerySpecimen[]
}

// A fixed sample id: the gallery shows where a requestId lands, and a value
// that changed on every render would be a moving part in a review surface.
const SAMPLE_REQUEST_ID = 'req_sample_a1b2c3'

const SAMPLE_ERROR: AppError = createError(ErrorCode.GENERATION_FAILED)
const SAMPLE_ERROR_WITH_ID: AppError = createError(ErrorCode.NETWORK_TIMEOUT, {
  requestId: SAMPLE_REQUEST_ID,
})

// ─────────────────────────────────────────────────────────────────────────────
// DS-04a — Card
// ─────────────────────────────────────────────────────────────────────────────

function CardBody() {
  return (
    <HeadingSection>
      <Heading>Lower body · strength</Heading>
      <p>Five sections, 42 minutes, one piece of equipment you have.</p>
    </HeadingSection>
  )
}

function CardDefault() {
  return (
    <Card>
      <CardBody />
    </Card>
  )
}

function CardWideBar() {
  return (
    <Card barWidth="lg">
      <CardBody />
    </Card>
  )
}

function CardWithActions() {
  return (
    <Card>
      <CardBody />
      <div className="clr-row clr-dev-gallery__row">
        <Chip selected>Gym</Chip>
        <Chip>Home</Chip>
        <Button variant="primary">Start</Button>
      </div>
    </Card>
  )
}

function CardEmpty() {
  return <Card />
}

// ─────────────────────────────────────────────────────────────────────────────
// HIST-01 — history rows and chronology
// ─────────────────────────────────────────────────────────────────────────────

const SAMPLE_HISTORY_SESSION: HistoryEntry = {
  kind: 'session',
  key: 'session:gallery-completed',
  id: 'gallery-completed',
  day: '2026-09-22',
  title: 'Lower-body strength',
  focus: 'lower_body',
  status: 'completed',
  durationMins: 42,
  intensity: 7,
  mood: 4,
}

const SAMPLE_HISTORY_PARTIAL: HistoryEntry = {
  kind: 'session',
  key: 'session:gallery-partial',
  id: 'gallery-partial',
  day: '2026-09-18',
  title: 'Upper-body volume',
  focus: 'upper_body',
  status: 'partial',
  durationMins: 18,
  intensity: 6,
  mood: null,
}

const SAMPLE_HISTORY_REST: HistoryEntry = {
  kind: 'rest',
  key: 'rest:2026-09-19',
  from: '2026-09-19',
  to: '2026-09-21',
  days: 3,
}

function WorkoutListItemCompleted() {
  return <WorkoutListItem entry={SAMPLE_HISTORY_SESSION} />
}

function WorkoutListItemRest() {
  return <WorkoutListItem entry={SAMPLE_HISTORY_REST} />
}

function HistoryListMixed() {
  return (
    <HistoryList
      entries={[SAMPLE_HISTORY_SESSION, SAMPLE_HISTORY_REST, SAMPLE_HISTORY_PARTIAL]}
      label="Workout history"
    />
  )
}

function HistoryListEmpty() {
  return <HistoryList entries={[]} label="Workout history" />
}

const SAMPLE_WEEK: readonly WeekDay[] = [
  { day: '2026-09-21', reason: null, initial: 'M', weekday: 'Monday', state: 'workout', isToday: false },
  { day: '2026-09-22', reason: 'rest', initial: 'T', weekday: 'Tuesday', state: 'rest', isToday: false },
  { day: '2026-09-23', reason: null, initial: 'W', weekday: 'Wednesday', state: 'workout', isToday: false },
  { day: '2026-09-24', reason: 'vacation', initial: 'T', weekday: 'Thursday', state: 'rest', isToday: false },
  { day: '2026-09-25', reason: null, initial: 'F', weekday: 'Friday', state: 'workout', isToday: true },
  { day: '2026-09-26', reason: null, initial: 'S', weekday: 'Saturday', state: 'upcoming', isToday: false },
  { day: '2026-09-27', reason: null, initial: 'S', weekday: 'Sunday', state: 'upcoming', isToday: false },
]

function WeekStripMixed() {
  return <WeekStrip days={SAMPLE_WEEK} label="This week" />
}

function WeekStripRestWeek() {
  return (
    <WeekStrip
      days={SAMPLE_WEEK.map((day) => ({
        ...day,
        state: day.state === 'upcoming' ? 'upcoming' : 'rest',
      }))}
      label="Rest week"
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// HIST-01 — session detail readings
// ─────────────────────────────────────────────────────────────────────────────

const SAMPLE_DETAIL_BLOCK: BlockDetailView = {
  id: 'gallery-detail-block',
  identity: {
    label: 'CIRCUIT',
    detail: '4 ROUNDS',
    repScheme: null,
    glyph: 'Circuit',
  },
  scored: true,
  outcome: [
    { label: 'Rounds', value: '4 of 4' },
    { label: 'Elapsed', value: '08:12' },
  ],
  perceivedEffort: '8 of 10',
  notes: 'Moved cleanly through the final round.',
  exercises: [
    {
      id: 'gallery-detail-exercise',
      name: 'Back squat',
      prescription: '3 × 8',
      status: 'completed',
      statusLabel: 'Done',
      lineage: 'prescribed',
      lineageLabel: null,
      sets: [
        {
          key: 'gallery-detail-set',
          setNumber: 1,
          isWarmup: false,
          reps: '8 reps',
          weight: '60 kg',
          rpe: 'RPE 8',
          duration: null,
          distance: null,
        },
      ],
    },
  ],
}

const SAMPLE_DETAIL_SECTION: SectionDetailView = {
  id: 'gallery-detail-section',
  title: 'Primary work',
  type: 'primary_lift',
  blocks: [SAMPLE_DETAIL_BLOCK],
}

function SessionProvenancePerformed() {
  return (
    <SessionProvenance
      provenance={{ kind: 'performed', label: 'As performed', asOf: '24 Sep 2026, 09:00' }}
    />
  )
}

function SessionProvenanceUnresolved() {
  return (
    <SessionProvenance
      provenance={{ kind: 'intended_at_start', label: 'As intended at start', asOf: null }}
    />
  )
}

function StructureResultBadgeScored() {
  return <StructureResultBadge block={SAMPLE_DETAIL_BLOCK} />
}

function StructureResultBadgeUnscored() {
  return (
    <StructureResultBadge
      block={{
        ...SAMPLE_DETAIL_BLOCK,
        scored: false,
        outcome: [],
        perceivedEffort: null,
        notes: null,
      }}
    />
  )
}

function LoggedSetTableRecorded() {
  return (
    <LoggedSetTable
      sets={SAMPLE_DETAIL_BLOCK.exercises[0].sets}
      label="Sets logged for back squat"
    />
  )
}

function LoggedSetTableEmpty() {
  return <LoggedSetTable sets={[]} label="Sets logged for back squat" />
}

function SessionSectionCardExpanded() {
  return <SessionSectionCard section={SAMPLE_DETAIL_SECTION} />
}

function SessionSectionCardCollapsed() {
  return <SessionSectionCard section={SAMPLE_DETAIL_SECTION} defaultExpanded={false} />
}

function MoodReadingRecorded() {
  return <MoodReading step={MOOD_SCALE[3]} />
}

function MoodReadingUnanswered() {
  return <MoodReading step={null} />
}

const SAMPLE_CONDITIONING_SCORE: ConditioningScore = {
  format: 'amrap',
  unit: 'reps_per_minute',
  value: 12.5,
  completedUnderCap: null,
  label: '12.5 reps/min',
}

const SAMPLE_SCORE_COMPARISON: ScoreComparison = {
  current: SAMPLE_CONDITIONING_SCORE,
  best: {
    ...SAMPLE_CONDITIONING_SCORE,
    value: 11.8,
    label: '11.8 reps/min',
  },
  bestDate: '2026-09-17',
  attempts: 3,
  direction: 'ahead',
  delta: 0.7,
  isBest: true,
  label: 'Previous best 11.8 reps/min',
}

function ConditioningScoreWithoutComparison() {
  return <ConditioningScoreLine score={SAMPLE_CONDITIONING_SCORE} />
}

function ConditioningScoreWithComparison() {
  return (
    <ConditioningScoreLine
      score={SAMPLE_CONDITIONING_SCORE}
      comparison={SAMPLE_SCORE_COMPARISON}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DS-04b — Select
// ─────────────────────────────────────────────────────────────────────────────

const LOCATIONS = [
  { value: 'gym', label: 'Commercial gym' },
  { value: 'home', label: 'Home' },
  { value: 'hotel', label: 'Hotel gym' },
  { value: 'outdoor', label: 'Outdoors', disabled: true },
]

const UNCHOSEN = { value: '', label: 'Choose a location' }

function SelectDefault() {
  const [value, setValue] = useState('')

  return (
    <Select
      label="Location"
      options={[UNCHOSEN, ...LOCATIONS]}
      value={value}
      onChange={setValue}
    />
  )
}

function SelectChosen() {
  const [value, setValue] = useState('home')

  return (
    <Select
      label="Location"
      options={LOCATIONS}
      value={value}
      onChange={setValue}
    />
  )
}

function SelectWithHelper() {
  return (
    <Select
      label="Location"
      options={LOCATIONS}
      defaultValue="gym"
      helperText="Equipment comes from the location you pick."
    />
  )
}

function SelectRequired() {
  return (
    <Select label="Location" options={LOCATIONS} required defaultValue="gym" />
  )
}

function SelectInvalid() {
  return (
    <Select
      label="Location"
      options={[UNCHOSEN, ...LOCATIONS]}
      errorText="Pick a location before generating."
    />
  )
}

function SelectDisabled() {
  return (
    <Select label="Location" options={LOCATIONS} defaultValue="gym" disabled />
  )
}

function SelectGrouped() {
  return (
    <Select label="Structure" defaultValue="ladder">
      <optgroup label="Timed">
        <option value="amrap">AMRAP</option>
        <option value="emom">EMOM</option>
      </optgroup>
      <optgroup label="Load">
        <option value="ladder">Ladder</option>
        <option value="superset">Superset</option>
      </optgroup>
    </Select>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DS-04c — CollapsibleSection
// ─────────────────────────────────────────────────────────────────────────────

function SectionContent() {
  return <p>Back squat · 4 × 6 at RPE 7 · 90s rest between sets.</p>
}

function CollapsedSection() {
  return (
    <CollapsibleSection label="Main lift">
      <SectionContent />
    </CollapsibleSection>
  )
}

function ExpandedSection() {
  return (
    <CollapsibleSection label="Main lift" defaultExpanded>
      <SectionContent />
    </CollapsibleSection>
  )
}

function ControlledSection() {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="clr-stack clr-stack--tight">
      <Button onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Collapse from outside' : 'Expand from outside'}
      </Button>
      <CollapsibleSection
        label="Main lift"
        expanded={expanded}
        onExpandedChange={setExpanded}
      >
        <SectionContent />
      </CollapsibleSection>
    </div>
  )
}

function NestedSection() {
  return (
    <CollapsibleSection label="Block A" defaultExpanded>
      <CollapsibleSection label="Superset 1" defaultExpanded>
        <SectionContent />
      </CollapsibleSection>
      <CollapsibleSection label="Superset 2">
        <SectionContent />
      </CollapsibleSection>
    </CollapsibleSection>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DS-05 — Toast host
//
// The host is a singleton at the app root, so its specimens are triggers on the
// real queue rather than copies of it. Reviewing it means watching one toast at
// a time arrive at the bottom of this window, exactly where a screen's would.
// ─────────────────────────────────────────────────────────────────────────────

function ToastTrigger({ label, show }: { label: string; show: () => void }) {
  return <Button onClick={show}>{label}</Button>
}

function ToastInfo() {
  return (
    <ToastTrigger
      label="Show info toast"
      show={() => toastQueue.show({ variant: 'info', message: 'Draft saved.' })}
    />
  )
}

function ToastPositive() {
  return (
    <ToastTrigger
      label="Show positive toast"
      show={() =>
        toastQueue.show({ variant: 'positive', message: 'Session logged.' })
      }
    />
  )
}

function ToastNegative() {
  return (
    <ToastTrigger
      label="Show negative toast"
      show={() =>
        toastQueue.show({ variant: 'negative', message: SAMPLE_ERROR.message })
      }
    />
  )
}

function ToastWithAction() {
  return (
    <ToastTrigger
      label="Show toast with an action"
      show={() =>
        toastQueue.show({
          variant: 'positive',
          message: 'Favourite removed.',
          actionLabel: 'Undo',
          onAction: () => undefined,
        })
      }
    />
  )
}

function ToastWithRequestId() {
  return (
    <ToastTrigger
      label="Show failure with a request id"
      show={() =>
        toastQueue.show({
          variant: 'negative',
          message: SAMPLE_ERROR_WITH_ID.message,
          requestId: SAMPLE_REQUEST_ID,
          actionLabel: 'Retry',
          onAction: () => undefined,
        })
      }
    />
  )
}

function ToastQueued() {
  return (
    <ToastTrigger
      label="Queue three toasts"
      show={() => {
        toastQueue.show({ variant: 'info', message: 'First in line.' })
        toastQueue.show({ variant: 'positive', message: 'Second in line.' })
        toastQueue.show({ variant: 'negative', message: 'Third in line.' })
      }}
    />
  )
}

/**
 * The host itself, so the gallery frames the component and not only its
 * triggers. An empty queue renders nothing at all — the host's fourth state,
 * and one worth seeing stated rather than inferred from a blank frame.
 */
function ToastHostIdle() {
  return (
    <>
      <p>Renders nothing until a message arrives.</p>
      <ToastHost />
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DS-05 — Dialogs
// ─────────────────────────────────────────────────────────────────────────────

function DialogTrigger({
  label,
  children,
}: {
  label: string
  children: (open: boolean, close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)}>{label}</Button>
      {children(open, () => setOpen(false))}
    </>
  )
}

function AppDialogPlain() {
  return (
    <DialogTrigger label="Open dialog">
      {(open, close) => (
        <AppDialog open={open} title="Swap exercise" onClose={close}>
          <p>
            Three alternatives train the same pattern with the equipment you
            have.
          </p>
        </AppDialog>
      )}
    </DialogTrigger>
  )
}

function AppDialogWithActions() {
  return (
    <DialogTrigger label="Open dialog with actions">
      {(open, close) => (
        <AppDialog
          open={open}
          title="Rest timer"
          onClose={close}
          actions={
            <>
              <Button variant="secondary" onClick={close}>
                Cancel
              </Button>
              <Button variant="primary" onClick={close}>
                Save
              </Button>
            </>
          }
        >
          <p>Ninety seconds between sets of the main lift.</p>
        </AppDialog>
      )}
    </DialogTrigger>
  )
}

function AppDialogCritical() {
  return (
    <DialogTrigger label="Open critical dialog">
      {(open, close) => (
        <AppDialog open={open} title="Abandon session" critical onClose={close}>
          <p>Every set logged so far is kept; the session is not.</p>
        </AppDialog>
      )}
    </DialogTrigger>
  )
}

function ConfirmDialogDefault() {
  return (
    <DialogTrigger label="Confirm an action">
      {(open, close) => (
        <ConfirmDialog
          open={open}
          title="Replace this workout"
          confirmLabel="Replace"
          onConfirm={close}
          onCancel={close}
        >
          <p>The generated session is discarded and rebuilt.</p>
        </ConfirmDialog>
      )}
    </DialogTrigger>
  )
}

function ConfirmDialogCritical() {
  return (
    <DialogTrigger label="Confirm something destructive">
      {(open, close) => (
        <ConfirmDialog
          open={open}
          title="Delete location"
          confirmLabel="Delete"
          critical
          onConfirm={close}
          onCancel={close}
        >
          <p>
            The location and its equipment list are removed. Past sessions keep
            their own record.
          </p>
        </ConfirmDialog>
      )}
    </DialogTrigger>
  )
}

function ErrorDialogWithRetry() {
  return (
    <DialogTrigger label="Show blocking failure">
      {(open, close) => (
        <ErrorDialog
          open={open}
          error={SAMPLE_ERROR_WITH_ID}
          onRetry={() => undefined}
          onDismiss={close}
        />
      )}
    </DialogTrigger>
  )
}

function ErrorDialogWithoutRetry() {
  return (
    <DialogTrigger label="Show failure with no retry">
      {(open, close) => (
        <ErrorDialog
          open={open}
          error={SAMPLE_ERROR}
          title="Session cannot be resumed"
          onDismiss={close}
        />
      )}
    </DialogTrigger>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE-04 / DS-05 — the four-state contract's renderers
// ─────────────────────────────────────────────────────────────────────────────

function LoadingDefault() {
  return <LoadingView label="Generating session" />
}

function LoadingSlow() {
  // Threshold 0: the honest `slow` status, without a four-second wait for it.
  return <LoadingView label="Generating session" thresholdMs={0} />
}

function LoadingWithProgress() {
  return <LoadingView label="Reading history" value={3} max={7} />
}

function LoadingWithLines() {
  return (
    <LoadingView
      label="Generating session"
      lines={['Reading profile', 'Selecting structure', 'Balancing volume']}
    />
  )
}

function ErrorViewWithRetry() {
  return <ErrorView error={SAMPLE_ERROR} onRetry={() => undefined} />
}

function ErrorViewWithoutRetry() {
  return <ErrorView error={SAMPLE_ERROR} title="History didn't load" />
}

function ErrorViewWithRequestId() {
  return (
    <ErrorView
      error={SAMPLE_ERROR_WITH_ID}
      title="Generation failed"
      actionLabel="Try again"
      onRetry={() => undefined}
    />
  )
}

const SWITCH_STATES: readonly ViewState<readonly string[]>[] = [
  viewLoading(),
  viewEmpty(),
  viewError(SAMPLE_ERROR_WITH_ID),
  viewReady(['Back squat', 'Romanian deadlift']),
]

/** One status of the contract, through the real switch. */
function SwitchedView({ state }: { state: ViewState<readonly string[]> }) {
  return (
    <ViewStateSwitch
      state={state}
      loadingLabel="Reading history"
      empty={<p>No sessions logged yet.</p>}
      errorTitle="History didn't load"
      onRetry={() => undefined}
    >
      {(data) => (
        <ul>
          {data.map((item) => (
            <li key={item}>
              <p>{item}</p>
            </li>
          ))}
        </ul>
      )}
    </ViewStateSwitch>
  )
}

// All four side by side, from the closed union itself: the point of the specimen
// is that a view using the switch cannot render nothing, and a fifth status
// added to the union would appear here without anyone framing it.
const SWITCH_SPECIMENS: readonly GallerySpecimen[] = SWITCH_STATES.map(
  (state) => ({
    state: `status="${state.status}"`,
    Render: () => <SwitchedView state={state} />,
  }),
)

// ─────────────────────────────────────────────────────────────────────────────
// DS-06 — the atmosphere, at each of its three levels
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One level, framed. The layer component is the app's own, unmodified: only the
 * dev stylesheet re-anchors its viewport-fixed position inside the frame, so
 * all three levels are comparable side by side instead of one page at a time.
 */
function AtmosphereSpecimen({ level }: { level: AtmosphereLevel }) {
  return (
    <div className="clr-dev-gallery__atmosphere" data-atmosphere={level}>
      <AtmosphereLayer />
      <div className="clr-dev-gallery__atmosphere-content">
        <p>{ATMOSPHERE_LABELS[level]}</p>
        <Button variant="primary">Start</Button>
      </div>
    </div>
  )
}

// Built from the level list, so a level added to the union arrives here without
// anyone remembering to frame it.
const ATMOSPHERE_SPECIMENS: readonly GallerySpecimen[] = ATMOSPHERE_LEVELS.map(
  (level) => ({
    state: `data-atmosphere="${level}"`,
    Render: () => <AtmosphereSpecimen level={level} />,
  }),
)

// ─────────────────────────────────────────────────────────────────────────────
// EXE-04a — the ladder's rungs, read-only and interactive
// ─────────────────────────────────────────────────────────────────────────────

/** `15-12-9-6-3`, as the rung list a block's `target_sequence` derives to. */
const SAMPLE_RUNGS: readonly LadderRung[] = [15, 12, 9, 6, 3].map(
  (target, index) => ({ number: index + 1, targets: [target] }),
)

/** Eleven rungs — more than a 375px screen holds, which is the rail's case. */
const LONG_LADDER: readonly LadderRung[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
].map((target, index) => ({ number: index + 1, targets: [target] }))

function LadderRungsReadOnly() {
  return <LadderRungs rungs={SAMPLE_RUNGS} unit="reps" label="Ladder" />
}

function LadderRungsClimbed() {
  return (
    <LadderRungs
      rungs={SAMPLE_RUNGS}
      unit="reps"
      label="Ladder"
      reached={SAMPLE_RUNGS.length}
    />
  )
}

function LadderRungsChoosable() {
  const [reached, setReached] = useState<number | null>(null)

  return (
    <LadderRungs
      rungs={SAMPLE_RUNGS}
      unit="reps"
      label="How far did you get?"
      reached={reached}
      onSelect={setReached}
    />
  )
}

function LadderRungsOverflowing() {
  const [reached, setReached] = useState<number | null>(9)

  return (
    <LadderRungs
      rungs={LONG_LADDER}
      unit="reps"
      label="How far did you get?"
      reached={reached}
      onSelect={setReached}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SET-01 — AppearancePicker
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The picker is controlled, so a specimen supplies the choice — which is what
 * makes both of its states reviewable rather than only the reviewer's own.
 *
 * `persist: false` throughout, the stance the chrome's SkinSwitcher already
 * takes: looking at four skins in a row must not end up storing one as
 * somebody's preference. The skin still flips live, because that is the thing
 * to look at.
 */
function ReviewablePicker({ initial }: { initial: AppearanceChoice }) {
  const [choice, setChoice] = useState<AppearanceChoice>(initial)

  return (
    <AppearancePicker
      value={choice}
      onChange={(next) => {
        applyAppearance(next, { persist: false })
        setChoice(next)
      }}
    />
  )
}

function AppearancePickerFollowingSystem() {
  return <ReviewablePicker initial={SYSTEM_APPEARANCE} />
}

function AppearancePickerChosenSkin() {
  return <ReviewablePicker initial="mono" />
}

// ─────────────────────────────────────────────────────────────────────────────
// The register
// ─────────────────────────────────────────────────────────────────────────────

export const GALLERY_ENTRIES: readonly GalleryEntry[] = [
  {
    component: 'WorkoutListItem',
    requirement: 'HIST-01',
    module: 'src/ui/history-list.tsx',
    summary:
      'One chronological row. Workout status is written and carries a glyph; rest uses a quieter frame and the word Rest, so colour is never the only cue.',
    specimens: [
      { state: 'completed session', Render: WorkoutListItemCompleted },
      { state: 'rest run', Render: WorkoutListItemRest },
    ],
  },
  {
    component: 'HistoryList',
    requirement: 'HIST-01',
    module: 'src/ui/history-list.tsx',
    summary:
      'The newest-first chronology as a named list, including derived rest runs between sessions.',
    specimens: [
      { state: 'mixed chronology', Render: HistoryListMixed },
      {
        state: 'empty entries',
        note: 'The screen owns empty-state copy; the list itself remains an empty named list.',
        Render: HistoryListEmpty,
      },
    ],
  },
  {
    component: 'WeekStrip',
    requirement: 'HOME-01',
    module: 'src/ui/week-strip.tsx',
    summary:
      'Seven data-backed days with written accessible states; today is marked by structure rather than colour alone.',
    specimens: [
      { state: 'workout, rest, today, and upcoming', Render: WeekStripMixed },
      { state: 'rest week', Render: WeekStripRestWeek },
    ],
  },
  {
    component: 'SessionProvenance',
    requirement: 'HIST-01',
    module: 'src/ui/session-detail.tsx',
    summary:
      'Names which reconstruction is being read and the moment it resolves, including an explicit unresolved state.',
    specimens: [
      { state: 'performed, resolved', Render: SessionProvenancePerformed },
      { state: 'intended, unresolved', Render: SessionProvenanceUnresolved },
    ],
  },
  {
    component: 'StructureResultBadge',
    requirement: 'HIST-01',
    module: 'src/ui/session-detail.tsx',
    summary:
      'Pairs the workout structure with its logged outcome and perceived effort without treating absent scores as zero.',
    specimens: [
      { state: 'scored circuit', Render: StructureResultBadgeScored },
      { state: 'not scored', Render: StructureResultBadgeUnscored },
    ],
  },
  {
    component: 'LoggedSetTable',
    requirement: 'HIST-01',
    module: 'src/ui/session-detail.tsx',
    summary:
      'Reads weight, reps, and RPE as a named table while preserving the difference between zero and not logged.',
    specimens: [
      { state: 'one recorded set', Render: LoggedSetTableRecorded },
      { state: 'no recorded sets', Render: LoggedSetTableEmpty },
    ],
  },
  {
    component: 'SessionSectionCard',
    requirement: 'HIST-01',
    module: 'src/ui/session-detail.tsx',
    summary:
      'Frames one historical workout section with its blocks, outcomes, prescriptions, lineage, and logged sets.',
    specimens: [
      { state: 'expanded', Render: SessionSectionCardExpanded },
      { state: 'collapsed', Render: SessionSectionCardCollapsed },
    ],
  },
  {
    component: 'MoodReading',
    requirement: 'HIST-01',
    module: 'src/ui/mood.tsx',
    summary:
      'Reports a stored mood with glyph, word, and numeric scale; an unanswered debrief stays explicitly unanswered.',
    specimens: [
      { state: 'recorded', Render: MoodReadingRecorded },
      {
        state: 'unanswered',
        note: 'No neutral value is invented for an unanswered debrief.',
        Render: MoodReadingUnanswered,
      },
    ],
  },
  {
    component: 'ConditioningScoreLine',
    requirement: 'OVR-03',
    module: 'src/ui/conditioning-score.tsx',
    summary:
      'Names the normalized score for timed conditioning and shows a comparison only when an identical repeat provides one.',
    specimens: [
      {
        state: 'score without comparison',
        Render: ConditioningScoreWithoutComparison,
      },
      {
        state: 'identical-repeat comparison',
        Render: ConditioningScoreWithComparison,
      },
    ],
  },
  {
    component: 'Card',
    requirement: 'DS-04a',
    module: 'src/ui/card.tsx',
    summary:
      'The accent bar plus chamfered body the export ships as CSS only. Bar width comes from the bar class; the card imposes no heading level on its content.',
    specimens: [
      { state: 'barWidth="md"', Render: CardDefault },
      { state: 'barWidth="lg"', Render: CardWideBar },
      {
        state: 'with a control row',
        note: 'Dense composition: the card never styles what it contains.',
        Render: CardWithActions,
      },
      {
        state: 'no children',
        note: 'Bar and body still draw — a card is a frame, not its content.',
        Render: CardEmpty,
      },
    ],
  },
  {
    component: 'Select',
    requirement: 'DS-04b',
    module: 'src/ui/select.tsx',
    summary:
      'The native control styled to CLEAR and wired through FormField for label, helper and error. The opened dropdown stays the platform’s.',
    specimens: [
      { state: 'unchosen', Render: SelectDefault },
      { state: 'chosen', Render: SelectChosen },
      { state: 'helperText', Render: SelectWithHelper },
      { state: 'required', Render: SelectRequired },
      {
        state: 'invalid',
        note: 'Urgency frame on both layers — border and surface move together.',
        Render: SelectInvalid,
      },
      { state: 'disabled', Render: SelectDisabled },
      {
        state: 'grouped options',
        note: 'Native optgroup children instead of the flat option list.',
        Render: SelectGrouped,
      },
    ],
  },
  {
    component: 'CollapsibleSection',
    requirement: 'DS-04c',
    module: 'src/ui/collapsible-section.tsx',
    summary:
      'App-owned disclosure. Collapsed content keeps its place in document order, so find-in-page and a linear read still reach it.',
    specimens: [
      { state: 'collapsed', Render: CollapsedSection },
      { state: 'defaultExpanded', Render: ExpandedSection },
      {
        state: 'controlled',
        note: 'The owner drives `expanded`; the trigger only reports intent.',
        Render: ControlledSection,
      },
      {
        state: 'nested',
        note: 'An inner trigger sits in the outer region, never inside its button.',
        Render: NestedSection,
      },
    ],
  },
  {
    component: 'ToastHost',
    requirement: 'DS-05',
    module: 'src/ui/toast-host.tsx',
    summary:
      'The one toast surface, mounted at the app root. These triggers use the real queue, so each toast arrives where a screen’s would, one at a time.',
    specimens: [
      { state: 'empty queue', Render: ToastHostIdle },
      { state: 'variant="info"', Render: ToastInfo },
      { state: 'variant="positive"', Render: ToastPositive },
      { state: 'variant="negative"', Render: ToastNegative },
      { state: 'with an action', Render: ToastWithAction },
      { state: 'with a requestId', Render: ToastWithRequestId },
      {
        state: 'queued',
        note: 'Three at once: the next waits for the current one to decay out.',
        Render: ToastQueued,
      },
    ],
  },
  {
    component: 'AppDialog',
    requirement: 'DS-05',
    module: 'src/ui/app-dialog.tsx',
    summary:
      'The shipped Dialog with the motion it lacks: the frame traces on, the contents materialize, the backdrop hard-cuts, and dismissal decays.',
    specimens: [
      { state: 'open', Render: AppDialogPlain },
      { state: 'with actions', Render: AppDialogWithActions },
      { state: 'critical', Render: AppDialogCritical },
    ],
  },
  {
    component: 'ConfirmDialog',
    requirement: 'DS-05',
    module: 'src/ui/blocking-dialog.tsx',
    summary:
      'A decision that blocks. Cancel comes first in DOM order, so the choice a stray Enter takes is the safe one.',
    specimens: [
      { state: 'default', Render: ConfirmDialogDefault },
      {
        state: 'critical',
        note: 'Destructive: critical frame, critical confirm, copy that says what is lost.',
        Render: ConfirmDialogCritical,
      },
    ],
  },
  {
    component: 'ErrorDialog',
    requirement: 'DS-05',
    module: 'src/ui/blocking-dialog.tsx',
    summary:
      'The blocking third of the AppError contract: user-safe message, requestId for correlation, and exactly one retry.',
    specimens: [
      { state: 'with onRetry', Render: ErrorDialogWithRetry },
      {
        state: 'without onRetry',
        note: 'A failure with no retry offers Close alone rather than a dead action.',
        Render: ErrorDialogWithoutRetry,
      },
    ],
  },
  {
    component: 'LoadingView',
    requirement: 'DS-05',
    module: 'src/ui/view-state.tsx',
    summary:
      'The loading state of the four-state contract. A ScanLoader, never a spinner; past its threshold it says it is slow.',
    specimens: [
      { state: 'status="ok"', Render: LoadingDefault },
      {
        state: 'status="slow"',
        note: 'Past the threshold the label becomes the honest one.',
        Render: LoadingSlow,
      },
      {
        state: 'determinate',
        note: 'value/max only when the progress is real.',
        Render: LoadingWithProgress,
      },
      { state: 'with boot lines', Render: LoadingWithLines },
    ],
  },
  {
    component: 'ErrorView',
    requirement: 'DS-05',
    module: 'src/ui/view-state.tsx',
    summary:
      'Whole-screen failure. Severity carries a glyph as well as colour, and the frame speaks urgency on both surface and border.',
    specimens: [
      { state: 'with onRetry', Render: ErrorViewWithRetry },
      { state: 'without onRetry', Render: ErrorViewWithoutRetry },
      { state: 'with a requestId', Render: ErrorViewWithRequestId },
    ],
  },
  {
    component: 'ViewStateSwitch',
    requirement: 'CORE-04',
    module: 'src/ui/view-state.tsx',
    summary:
      'The one mapping from a ViewState onto a screen. The union is closed and the switch exhaustive, so no view using it can render nothing.',
    specimens: SWITCH_SPECIMENS,
  },
  {
    component: 'LadderRungs',
    requirement: 'EXE-04a',
    module: 'src/ui/ladder-rungs.tsx',
    summary:
      'The block’s rep pattern, stated once. Read-only it is data — quiet, square, nothing to tap; once the cap is hit the same rungs become a radio group, named by their target rather than their index, with the choice ticked and said in words.',
    specimens: [
      { state: 'read-only', Render: LadderRungsReadOnly },
      {
        state: 'read-only, finished',
        note: 'Every rung climbed. Still not a control — finishing changes the fill, not the affordance.',
        Render: LadderRungsClimbed,
      },
      {
        state: 'interactive',
        note: 'One tab stop, arrows between rungs. Tap a rung: it ticks, and the rungs below it fill.',
        Render: LadderRungsChoosable,
      },
      {
        state: 'interactive, 11 rungs',
        note: 'Wider than a phone: the rail contains the scroll and cues the edges rather than overflowing the page.',
        Render: LadderRungsOverflowing,
      },
    ],
  },
  {
    component: 'AppearancePicker',
    requirement: 'SET-01',
    module: 'src/ui/appearance-picker.tsx',
    summary:
      'Skin selection, derived from the export’s own SKINS list and persisted by its own skin.js. Mono is named enhanced contrast, never accessible; the system option is the absence of a choice, which is what restores OS contrast following.',
    specimens: [
      {
        state: 'following the system',
        note: 'No stored choice. Selecting any skin here is an explicit choice that outranks the OS preference.',
        Render: AppearancePickerFollowingSystem,
      },
      {
        state: 'a skin chosen',
        note: 'Selection carries a tick as well as a surface, so the chosen option is not colour alone.',
        Render: AppearancePickerChosenSkin,
      },
    ],
  },
  {
    component: 'AtmosphereLayer',
    requirement: 'DS-06',
    module: 'src/ui/atmosphere.tsx',
    summary:
      'The export’s five-layer ground. One mount serves every screen and the level is an attribute; under reduced motion the layer drops its drift and its scanlines.',
    specimens: ATMOSPHERE_SPECIMENS,
  },
]
