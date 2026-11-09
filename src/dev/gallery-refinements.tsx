/**
 * `/gallery/refinements` — the accepted workout refinements, by stable state
 * (accepted gallery reference eded158cfd928d382c9a9409e2c372270312741d,
 * REUSE.md "Stable entry points"). Each state renders actual shared owners and
 * the consumers the routes draw; a state shown here does not by itself close
 * an application criterion, which is proved on the route.
 *
 * TASK-001 delivers `cards`: movement hierarchy and peer grouping in Review and
 * Workout. Later refinement tasks add their own states to `REFINEMENT_STATES`.
 */
import { Link, useSearchParams } from 'react-router-dom'

import { Heading, HeadingSection } from '../ui/Heading'
import { GalleryMovementCards } from './gallery-refinement-cards'

const REFINEMENT_STATES = [
  { id: 'cards', title: 'Movement cards and shared header', Render: GalleryMovementCards },
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
