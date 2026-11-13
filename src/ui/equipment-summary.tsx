import { useId } from 'react'
import { Dumbbell } from '../design-system/index'
import '../styles/equipment-summary.css'

/** Read-only equipment requirements; labels never masquerade as controls. */
export function EquipmentSummary({ equipment }: { equipment: readonly string[] }) {
  const label = useId()
  return <div className="clr-equipment-summary">
    <p id={label} className="clr-text-data-xs clr-text-data-xs--upper clr-equipment-summary__label"><Dumbbell size={16} />Required equipment</p>
    {equipment.length === 0 ? <p className="clr-equipment-summary__empty">None — bodyweight only</p> :
      <ul aria-labelledby={label} className="clr-equipment-summary__list">{equipment.map(name => <li key={name}>{name}</li>)}</ul>}
  </div>
}
