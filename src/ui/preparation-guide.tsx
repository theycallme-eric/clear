/**
 * TASK-022 (REQ-022; C49, AC-C49-01, AC-R022-01, AC-R022-02; G06, G14; R01,
 * R13, R14, R15, R36) — the accepted concise Warm-up and Cooldown, and their
 * separate preparation clock, on `/review` and `/workout`.
 *
 * Accepted gallery reference eded158cfd928d382c9a9409e2c372270312741d,
 * `/gallery/refinements?state=preparation` (the reference recipe
 * `RefinementPreparation` in `workout-card.tsx`, drawn by the shared owner
 * `src/dev/gallery-refinement-scenes.tsx`; visual references V05 → V06).
 * Deliberate consolidation, recorded in the task note: the reference drew a
 * fixed `~5 minutes` default and sample names; this owner draws only TASK-034's
 * reading (`src/state/preparation-guide.ts`), so the title, the names, their
 * count and the approximate time are data, never screenshot constants.
 *
 *   · `PreparationGuide` — the concise guide: the section's stable title
 *     (`Warm-up` or `Cooldown`, never a generated custom title), its
 *     approximate total time (`~N minutes`) on the heading row, and the
 *     movement names on separate lines. No explanatory paragraph, and no
 *     per-movement sets, reps, load, time or rest (R01, R13, C49). It draws
 *     all four states of the reading: loading and a failed read keep their
 *     meanings (a busy region; a named failure with its retry), a missing
 *     guide says why (a section with no movement left), and nothing at all is
 *     drawn for a workout that composes no such section.
 *   · `PreparationTimer` — the separate preparation clock (R15): the rest
 *     timer's own pattern (`CountdownCard`, `workout-chrome.tsx`), counting the
 *     guide's approximate time down, with Start / Pause and Add 30s and no
 *     Dismiss or any other hiding action (R14). It is its own clock
 *     (`state/preparation-clock.ts`), distinct from the session's, the rest,
 *     a movement's countdown and every format clock (C21), and it records
 *     nothing.
 *   · `LivePreparation` — the live workout's preparation section: the guide
 *     read from the persisted session's active rows (a swap reads in place),
 *     then its clock. Review draws the guide alone, from the composed workout:
 *     before Start there is no clock to run (R30: Review states the plan).
 *
 * Presentation only. The guide's data is TASK-034's; the clock's arithmetic
 * is the countdown's; the section's completion stays the shell's one forward
 * action (REQ-013), unchanged.
 */
import { Button, Pause, Play, Plus, Stopwatch } from '../design-system/index'
import { movementCountdownDeadline } from '../state/countdown-urgency'
import { isErr } from '../state/errors'
import { sectionTypeLabel } from '../state/onboarding'
import { usePreparationClock } from '../state/preparation-clock'
import {
  persistedPreparationGuide,
  type PreparationGuide as PreparationGuideData,
  type PreparationGuideReading,
  type PreparationSectionType,
} from '../state/preparation-guide'
import { REST_EXTENSION_SECONDS } from '../state/rest'
import type { SessionSnapshot } from '../state/schemas'
import { preparationReading } from '../state/timed-clock'
import { Card } from './card'
import { ErrorView, LoadingView } from './view-state'
import { CountdownCard } from './workout-chrome'
import './refinements/tokens.css'
import './refinements/presentation.css'

/** The accessible name of a guide's movement list: `Warm-up movements`. */
function preparationListLabel(title: string): string {
  return `${title} movements`
}

/** The accessible name of a guide's preparation clock: `Warm-up timer`. */
function preparationTimerLabel(title: string): string {
  return `${title} timer`
}

export interface PreparationGuideProps {
  /** TASK-034's reading of this section, in whichever state it is in. */
  reading: PreparationGuideReading
  /** Which section the reading is of, so a loading or failed read is named. */
  type: PreparationSectionType
  /** Reads the section again after a failure. Absent, no retry is offered. */
  onRetry?: () => void
  /**
   * The title as the section's semantic heading (Review, where the guide is
   * the section). The live guide's title is a label: the section header above
   * it already heads the section, as with the live `WorkoutCard`.
   */
  heading?: boolean
}

/** The concise Warm-up or Cooldown (C49), in every state of its reading. */
export function PreparationGuide({ reading, type, onRetry, heading = true }: PreparationGuideProps) {
  const title = sectionTypeLabel(type)
  const headingAs = heading ? 'heading' : 'label'

  switch (reading.status) {
    case 'loading':
      return (
        <Card heading={title} headingAs={headingAs} data-preparation-guide={type} data-preparation-state="loading">
          <LoadingView label={`Reading the ${title.toLowerCase()}`} />
        </Card>
      )
    case 'error':
      return (
        <Card heading={title} headingAs={headingAs} data-preparation-guide={type} data-preparation-state="error">
          <ErrorView
            error={reading.error}
            title={`The ${title.toLowerCase()} didn’t load`}
            actionLabel="Try again"
            onRetry={onRetry}
          />
        </Card>
      )
    case 'missing':
      // No such section composed, or no workout: there is nothing to guide,
      // and nothing is drawn in its place.
      if (reading.reason !== 'no-movements') return null
      return (
        <Card heading={title} headingAs={headingAs} data-preparation-guide={type} data-preparation-state="missing">
          <p className="clr-preparation-guide__empty">No movements are left in this {title.toLowerCase()}.</p>
        </Card>
      )
    case 'ready':
      return <PreparationGuideCard guide={reading.guide} headingAs={headingAs} />
  }
}

/** The ready guide: title, `~N minutes`, and one name per line — nothing else. */
function PreparationGuideCard({ guide, headingAs }: { guide: PreparationGuideData; headingAs: 'heading' | 'label' }) {
  return (
    <Card
      heading={guide.title}
      headingAs={headingAs}
      meta={guide.durationText}
      data-preparation-guide={guide.type}
      data-preparation-state="ready"
    >
      <ul className="clr-preparation-guide__list" aria-label={preparationListLabel(guide.title)}>
        {guide.movements.map((movement) => (
          <li key={movement.key}>{movement.name}</li>
        ))}
      </ul>
    </Card>
  )
}

export interface PreparationTimerProps {
  /** The section the clock belongs to: one clock per section, per session. */
  clockKey: string
  /** The ready guide whose title names the clock and whose time it counts. */
  guide: PreparationGuideData
  /** Injectable clock, for a test that moves time. */
  now?: () => number
}

/**
 * The separate preparation clock (R14, R15; C21): the rest timer's pattern,
 * counting the guide's own approximate time down. Start runs it, Pause holds
 * it, Add 30s adds the rest timer's own extension. There is no Dismiss and no
 * other hide action; leaving the section keeps the clock as it was.
 */
export function PreparationTimer({ clockKey, guide, now }: PreparationTimerProps) {
  const { status, totalSeconds, remainingSeconds, start, pause, extend } = usePreparationClock(
    clockKey,
    guide.approximateMinutes,
    now,
  )
  const fraction = totalSeconds > 0 ? remainingSeconds / totalSeconds : 0

  return (
    <div data-preparation-clock={status}>
      <CountdownCard
        name={preparationTimerLabel(guide.title)}
        glyph={<Stopwatch />}
        label={guide.title}
        reading={preparationReading(remainingSeconds)}
        // The countdown's own eligibility: a live deadline while running or
        // paused, none when ready or run out (TASK-008).
        deadline={movementCountdownDeadline(status, remainingSeconds)}
        fraction={fraction}
        actions={
          <>
            {status === 'running' ? (
              <Button variant="secondary" icon={<Pause />} onClick={pause}>
                Pause
              </Button>
            ) : (
              <Button variant="secondary" icon={<Play />} disabled={status === 'finished'} onClick={start}>
                Start
              </Button>
            )}
            <Button variant="quiet" icon={<Plus />} onClick={extend}>
              Add {REST_EXTENSION_SECONDS}s
            </Button>
          </>
        }
      />
    </div>
  )
}

type SnapshotSection = SessionSnapshot['sections'][number]

/** The persisted section's reading: a malformed row is an error, never a guess. */
function livePreparationReading(entry: SnapshotSection, type: PreparationSectionType): PreparationGuideReading {
  const guide = persistedPreparationGuide(entry)
  if (isErr(guide)) return { status: 'error', error: guide.error }
  if (guide.value === null) return { status: 'missing', type, reason: 'no-movements' }
  return { status: 'ready', guide: guide.value }
}

export interface LivePreparationProps {
  /** The open Warm-up or Cooldown section, as the session holds it. */
  entry: SnapshotSection
  type: PreparationSectionType
  now?: () => number
}

/** The live workout's Warm-up or Cooldown: the concise guide, then its own clock. */
export function LivePreparation({ entry, type, now }: LivePreparationProps) {
  const reading = livePreparationReading(entry, type)
  return (
    <div className="clr-stack" data-preparation-section={type}>
      <PreparationGuide reading={reading} type={type} heading={false} />
      {reading.status === 'ready' && (
        <PreparationTimer clockKey={entry.section.id} guide={reading.guide} now={now} />
      )}
    </div>
  )
}
