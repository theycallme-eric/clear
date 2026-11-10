/**
 * `/gallery/refinements` — the accepted workout refinements, by stable state
 * (accepted gallery reference eded158cfd928d382c9a9409e2c372270312741d,
 * REUSE.md "Stable entry points"). Each state renders actual shared owners and
 * the consumers the routes draw; a state shown here does not by itself close
 * an application criterion, which is proved on the route.
 *
 * `cards`: movement hierarchy and peer grouping (TASK-001), and one card with
 * context-specific slots and the shared static header, compact equipment beside
 * each name, in Review and Workout (TASK-002). Later refinement tasks add their
 * own states to `REFINEMENT_STATES`.
 *
 * `overview`: the accepted Overview facts, Required equipment group and
 * Summary frames (TASK-004), drawn by the Review, Session Detail and Summary
 * consumers over the shared owners in `src/ui/refinements/overview.tsx`.
 *
 * `ladder-4`, `ladder-12`: the live ladder's Start/Pause/Resume/Finish
 * hierarchy (TASK-006) — the route's own `LadderBlock`, Start ladder in its
 * top slot, then a secondary Pause beside the primary Finish — over memory-only
 * storage (`gallery-refinement-flow.tsx`).
 *
 * `urgency`: the whole timer body (TASK-007, C19, C21) drawn by each clock's
 * actual consumer — a movement countdown, the race clock toward its cap, the
 * session's rest and the elapsed-only session clock — and the recovered soft
 * countdown warning (TASK-008: C22, C23, C24, C61; P05) through the same
 * owner: colour at ten seconds, one soft aura in phase with its timer at five,
 * a count-up cap, an open native log over the warning and a still preview
 * (`gallery-refinement-timers.tsx`). The `cards` state's Workout context opens
 * with the route's one-row workout header (C20).
 *
 * `amrap`: the AMRAP's prescription and concise scoring controls (TASK-009:
 * C25, C26, C27, C28) — the route's own `AmrapBlock`, ended by its cap and
 * ended early, its work first and then the shared `TimedResultLog` with its
 * two framed `QuantitySelector` counts, blank beside an explicit zero, over
 * memory-only storage (`gallery-refinement-forms.tsx`).
 *
 * `for_time`, `ladder`: completion choices and the existing effort faces
 * (TASK-010: C29, C30) — the route's own `ForTimeBlock` and `LadderBlock`,
 * each ended by Finish and by its cap, then the shared `TimedResultLog`: "Work
 * completed" with Complete beside Incomplete in one row at the route's own
 * starting point, and the three effort faces unanswered, over memory-only
 * storage (`gallery-refinement-forms.tsx`).
 *
 * `emom`: the EMOM's schedule and end logging without a completion counter
 * (TASK-011: C31, C32) — the route's own `EmomBlock`, every prescribed minute
 * run and ended early, its minute progress and actual stop kept, then the
 * shared `TimedResultLog` with no minutes-completed counter and only the
 * optional notes for an exception, over memory-only storage
 * (`gallery-refinement-forms.tsx`). The `cards` state's Workout EMOM is the
 * same route block, ready: its minute, minute assignment and Next marker,
 * without the NOT STARTED caption.
 */
import { Link, useSearchParams } from 'react-router-dom'

import { Heading, HeadingSection } from '../ui/Heading'
import { GalleryMovementCards } from './gallery-refinement-cards'
import { GalleryLadderFlow } from './gallery-refinement-flow'
import { GalleryAmrapResults, GalleryEmomResults, GalleryForTimeResults, GalleryLadderResults } from './gallery-refinement-forms'
import { GalleryOverviewSummary } from './gallery-refinement-scenes'
import { GalleryTimerFrames } from './gallery-refinement-timers'

function GalleryLadderFour() {
  return <GalleryLadderFlow rounds={4} />
}

function GalleryLadderTwelve() {
  return <GalleryLadderFlow rounds={12} />
}

const REFINEMENT_STATES = [
  { id: 'cards', title: 'Movement cards and shared header', Render: GalleryMovementCards },
  { id: 'overview', title: 'Overview and Summary frames', Render: GalleryOverviewSummary },
  { id: 'ladder-4', title: 'Live ladder · 4 rounds', Render: GalleryLadderFour },
  { id: 'ladder-12', title: 'Live ladder · 12 rounds', Render: GalleryLadderTwelve },
  { id: 'urgency', title: 'Countdown warning and whole timer frames · countdown, cap and elapsed clocks', Render: GalleryTimerFrames },
  { id: 'amrap', title: 'AMRAP results', Render: GalleryAmrapResults },
  { id: 'for_time', title: 'For Time results', Render: GalleryForTimeResults },
  { id: 'ladder', title: 'Ladder results', Render: GalleryLadderResults },
  { id: 'emom', title: 'EMOM results', Render: GalleryEmomResults },
] as const

export function GalleryRefinements() {
  const [params] = useSearchParams()
  const requested = params.get('state') ?? 'cards'
  const state = REFINEMENT_STATES.find(({ id }) => id === requested) ?? REFINEMENT_STATES[0]
  return (
    <div className="clr-dev-gallery__section">
      <Heading>Accepted workout refinements</Heading>
      <p>
        Accepted design reference states over the shared presentation owners and
        the consumers the routes draw. Swap, logging and completion controllers
        here are inert and in memory; the routes keep the real ones.
      </p>
      <nav aria-label="Accepted refinement states">
        <ul className="clr-dev-gallery__nav-list">
          {REFINEMENT_STATES.map(({ id, title }) => (
            <li key={id}>
              <Link to={`?state=${id}`} aria-current={state.id === id ? 'page' : undefined}>{title}</Link>
            </li>
          ))}
        </ul>
      </nav>
      <HeadingSection key={state.id} data-refinement-state={state.id} className="clr-dev-gallery__group">
        <Heading>{state.title}</Heading>
        <state.Render />
      </HeadingSection>
    </div>
  )
}
