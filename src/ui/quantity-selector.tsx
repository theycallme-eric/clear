import { useId } from 'react'
import { IconButton, Minus, Plus } from '../design-system/index'
import '../styles/timed-workout.css'

/** One framed quantity control. Blank and an observed zero remain different. */
export function QuantitySelector({ label, value, onChange, max }: {
  label: string; value: number | null; onChange: (next: number | null) => void; max?: number
}) {
  const id = useId()
  return <div className="clr-timed-field">
    <label className="label" htmlFor={id}>{label}</label>
    <div className="clr-quantity clr-chamfer clr-chamfer--sm clr-chamfer--structure" role="group" aria-label={label}>
      <IconButton type="button" variant="secondary" size="sm" icon={<Minus />} label={`Decrease ${label.toLowerCase()}`}
        disabled={value === null || value === 0} onClick={() => onChange(Math.max(0, (value ?? 0) - 1))} />
      <input id={id} type="number" inputMode="numeric" min={0} max={max} step={1} placeholder="—" value={value ?? ''}
        onChange={event => {
          const raw = event.target.value
          if (raw === '') onChange(null)
          else if (/^\d+$/.test(raw)) onChange(Math.min(max ?? Infinity, Number(raw)))
        }} />
      <IconButton type="button" variant="secondary" size="sm" icon={<Plus />} label={`Increase ${label.toLowerCase()}`}
        disabled={max !== undefined && value !== null && value >= max}
        onClick={() => onChange(Math.min(max ?? Infinity, (value ?? 0) + 1))} />
    </div>
  </div>
}
