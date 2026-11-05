/** Accepted card composition. Consumers supply actions/data; gallery controllers
 * are separate from this reusable presentation owner. */
import type { ReactNode } from 'react'
import { Button, IconButton, Menu, Input } from '../../design-system/index'
import { Card } from '../card'
import { CollapsibleSection } from '../collapsible-section'
import { MovementIdentity, MovementList, MovementGroupHeader } from './movement'
import { StructureBadge } from '../workout-chrome'
import { DeadlineTimer } from './deadline-timer'
import './presentation.css'

type Movement = {name:string; prescription:string; equipment:string; load?:string}
export function RefinementWorkoutCard({ format, movements, review = false, actions, children }: {
  format:string; movements:readonly Movement[]; review?:boolean; actions?:ReactNode; children?:ReactNode
}) {
  return <Card><div className="clr-accepted-example">
    <MovementGroupHeader title="Conditioning" badge={<StructureBadge identity={{label:format,detail:null,repScheme:null,glyph:'Stopwatch'}} />} />
    <p className="clr-timed-meta">{format==='EMOM'?'10 MIN · N+1':format==='AMRAP'?'8 MIN · INVERSE':'15 MIN CAP'}</p>
    <MovementList label={`${format} movements`}>{movements.map((movement,index)=><li key={movement.name}>
      <MovementIdentity name={movement.name} ordinal={String(index+1).padStart(2,'0')} prescription={movement.prescription} equipment={movement.equipment} load={movement.load}
        action={review?<Button variant="quiet" size="sm">Swap</Button>:undefined} />
    </li>)}</MovementList>
    {children}
    {actions}
    <CollapsibleSection label="Coaching and notes">
      {movements.map(movement=><section key={movement.name}><p className="label">{movement.name}</p><Input label={`Notes · ${movement.name}`} multiline rows={2} /></section>)}
    </CollapsibleSection>
  </div></Card>
}

export function RefinementWorkoutHeader({ title = 'Workout' }: { title?: string } = {}) {
  return <div className="clr-accepted-workout-header"><p>{title}</p><DeadlineTimer seconds={1232} elapsedOnly label="Session time" /><IconButton variant="secondary" label="Actions" icon={<Menu />} /></div>
}

export function RefinementPreparation({ title = 'Warm-up', minutes = 5, movements }: { title?:string; minutes?:number; movements:readonly string[] }) {
  return <Card heading={title} meta={`~${minutes} minutes`}><ul>{movements.map(name=><li key={name}>{name}</li>)}</ul></Card>
}
