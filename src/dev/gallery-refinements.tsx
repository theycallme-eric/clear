import { Link, useSearchParams } from 'react-router-dom'
import { Heading, HeadingSection } from '../ui/Heading'
import { ErrorView } from '../ui/view-state'
import { createError, ErrorCode } from '../state/errors'
import { GalleryLoggingMoment } from './gallery-refinement-forms'
import { GalleryLadderFlow, GalleryUrgency } from './gallery-refinement-flow'
import { GalleryMovementCards, GalleryOverviewSummary, GalleryPreparationReview, GalleryGenerateSetupHistory, GalleryEquipmentInventory } from './gallery-refinement-scenes'
import { LOGGING_CONTEXTS } from './gallery-refinement-data'
import coverage from './gallery-refinement-coverage.json'
import { EXTRA_STATES, REFINEMENT_STATE_IDS } from './gallery-refinement-states'
import '../ui/refinements/presentation.css'


function StateExample({ state }: { state:string }) {
  const context = LOGGING_CONTEXTS.find(([id])=>id===state)
  if(context) return <GalleryLoggingMoment context={context[0]} />
  switch(state) {
    case 'cards': return <GalleryMovementCards />
    case 'overview': return <GalleryOverviewSummary />
    case 'preparation': return <GalleryPreparationReview />
    case 'screens': return <GalleryGenerateSetupHistory />
    case 'ladder-4': return <GalleryLadderFlow rounds={4} />
    case 'ladder-12': return <GalleryLadderFlow rounds={12} />
    case 'ladder-long': return <GalleryLoggingMoment context="ladder" rounds={12} />
    case 'urgency': return <GalleryUrgency />
    case 'errors': return <ErrorView error={createError(ErrorCode.NETWORK_TIMEOUT)} onRetry={()=>{}} />
    case 'assets': return <GalleryEquipmentInventory />
    default:return null
  }
}
export function GalleryRefinements() {
  const [params]=useSearchParams()
  const requested=params.get('state')??'cards'
  const state=REFINEMENT_STATE_IDS.includes(requested)?requested:'cards'
  const allStates=[...EXTRA_STATES,...LOGGING_CONTEXTS]
  return <div className="clr-accepted-example">
    <Heading>Accepted workout refinements</Heading>
    <p>Final accepted design reference · 145 intake notes, 40 requirements, 162 criteria and all 16 logging moments. These shared presentation owners use synthetic in-memory controllers. Application adoption, backend support and durable recovery remain separately tracked.</p>
    <nav aria-label="Accepted refinement states"><ul className="clr-accepted-state-nav">{allStates.map(([id,title])=><li key={id}><Link to={`?state=${id}`} aria-current={state===id?'page':undefined}>{title}</Link></li>)}</ul></nav>
    <HeadingSection key={state} data-refinement-state={state}><Heading>{allStates.find(([id])=>id===state)?.[1]}</Heading><StateExample state={state} /></HeadingSection>
    <details><summary>Requirement coverage and integration boundaries</summary>
      <p>Body {coverage.body} · revision {coverage.revision}. Links identify accepted states; they do not close application criteria.</p>
      {coverage.requirements.map(requirement=><section key={requirement.id} id={requirement.id} className="clr-accepted-coverage">
        <p><strong>{requirement.id}: {requirement.title}</strong></p>
        <ul>{requirement.states.map(id=><li key={id}><Link to={`?state=${id}`}>{id}</Link></li>)}</ul>
        <p>{requirement.limit}</p>
        <details><summary>{requirement.acceptanceCriteria.length} exact criteria</summary><ol>{requirement.acceptanceCriteria.map((criterion,index)=><li key={requirement.acceptanceCriterionIds[index]}><strong>{requirement.acceptanceCriterionIds[index]}</strong> — {criterion}</li>)}</ol></details>
      </section>)}
    </details>
  </div>
}
