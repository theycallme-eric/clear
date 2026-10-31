import type { ReactNode } from 'react'

import { Heading } from './Heading'
import '../styles/movement-presentation.css'

/** B05-04: one hierarchy; consumers retain their own actions and state. */
export function MovementIdentity({
  name, ordinal, prescription, equipment, action, counter, heading = false,
}: {
  name: ReactNode
  ordinal?: ReactNode
  prescription?: ReactNode
  equipment?: ReactNode
  action?: ReactNode
  counter?: ReactNode
  heading?: boolean
}) {
  const Name = heading ? Heading : 'p'
  return (
    <div className="clr-movement-identity">
      <div className="clr-movement-identity__top" data-movement-name-row="">
        <Name className="clr-movement-identity__name">
          {ordinal == null ? null : <span className="clr-movement-identity__ordinal clr-text-data-xs">{ordinal} </span>}
          {name}
        </Name>
        {counter == null ? null : <span className="clr-movement-identity__counter clr-text-data-xs">{counter}</span>}
        {action == null ? null : <div className="clr-movement-identity__action">{action}</div>}
      </div>
      {prescription == null ? null : <div className="clr-movement-identity__prescription" data-movement-detail="">{prescription}</div>}
      {equipment == null ? null : <p className="clr-text-data-xs clr-text-data-xs--quiet clr-movement-identity__equipment" data-movement-context="">{equipment}</p>}
    </div>
  )
}

/** Ordered peer rows, with a separator only between movements. */
export function MovementList({ label, children }: { label: string; children?: ReactNode }) {
  return <ol aria-label={label} className="clr-movement-list">{children}</ol>
}
