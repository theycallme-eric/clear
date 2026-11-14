import { useId, type ReactNode } from 'react'

import { useWorkoutExperiencePresentation } from './workout-experience-presentation'
import { Heading } from './Heading'
import '../styles/movement-presentation.css'

/** B05-04: one hierarchy; consumers retain their own actions and state. */
export function MovementIdentity({
  name, ordinal, prescription, load, equipment, action, counter, heading = false,
}: {
  name: ReactNode
  ordinal?: ReactNode
  prescription?: ReactNode
  load?: ReactNode
  equipment?: ReactNode
  action?: ReactNode
  counter?: ReactNode
  heading?: boolean
}) {
  const inlineEquipment = useWorkoutExperiencePresentation()?.equipmentPlacement === 'name'
  const Name = heading ? Heading : 'p'
  const nameId = useId()
  const equipmentId = useId()
  const inline = inlineEquipment && equipment != null
  // Equipment drawn inline after the name is context, not the name: a heading
  // is still named by its movement alone, and the equipment describes it.
  const naming = heading && inline ? { 'aria-labelledby': nameId, 'aria-describedby': equipmentId } : {}
  return (
    <div className="clr-movement-identity">
      <div className="clr-movement-identity__top" data-movement-name-row="">
        <Name className="clr-movement-identity__name" {...naming}>
          <span id={nameId}>
            {ordinal == null ? null : <span className="clr-movement-identity__ordinal clr-text-data-xs">{ordinal} </span>}
            {name}
          </span>
          {inline ? <span id={equipmentId} className="clr-movement-identity__equipment-inline" data-movement-context="">{equipment}</span> : null}
        </Name>
        {counter == null ? null : <span className="clr-movement-identity__counter clr-text-data-xs">{counter}</span>}
        {action == null ? null : <div className="clr-movement-identity__action">{action}</div>}
      </div>
      {prescription == null ? null : <div className="clr-movement-identity__prescription" data-movement-detail=""><span>{prescription}</span>{load == null ? null : <span>{load}</span>}</div>}
      {equipment == null || inlineEquipment ? null : <p className="clr-text-data-xs clr-text-data-xs--quiet clr-movement-identity__equipment" data-movement-context="">{equipment}</p>}
    </div>
  )
}

/** Ordered peer rows, with a separator only between movements. */
export function MovementList({ label, children }: { label: string; children?: ReactNode }) {
  return <ol aria-label={label} className="clr-movement-list">{children}</ol>
}

/** Shared static group header. Actions and session progress belong to consumers. */
export function MovementGroupHeader({ title, badge, heading = true }: { title: ReactNode; badge?: ReactNode; heading?: boolean }) {
  const Title = heading ? Heading : 'p'
  return <div className="clr-movement-group-header" data-movement-group-header="">
    <Title className="label clr-movement-group-header__title">{title}</Title>
    {badge == null ? null : <div className="clr-movement-group-header__badge">{badge}</div>}
  </div>
}
