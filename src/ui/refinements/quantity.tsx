/**
 * QuantitySelector — the accepted framed quantity control (TASK-009: C27, C28;
 * G08; R52, R56, R57, R79, R83; accepted gallery reference
 * eded158cfd928d382c9a9409e2c372270312741d, `src/ui/refinements/quantity.tsx`).
 *
 * One wide frame (`.clr-quantity`, a soft small-corner structure chamfer) that
 * houses the minus, the value and the plus — "minus/value/plus housed as one
 * framed quantity-selection component" (R56). The actions are the established
 * framed action buttons (R79): the shared secondary `IconButton`, whose frame
 * is the interaction role (pink in the Signal skin, the same semantic role in
 * every other) at the shared control height. The frame is the selected roomier
 * one (R83), so those framed buttons fit inside it, and the value between them
 * is distinct: the timer role in the data face at the h2 size.
 *
 * Blank and an observed zero stay different (C28, R57). `null` is unreported
 * and reads `—` (and "Not recorded" to assistive technology); zero is a zero.
 * There is no clear or reset action of any kind: the minus taps down and stops
 * at zero, never back to blank, and the plus counts up from blank. `onChange`
 * is only ever called with a number, so nothing here can clear a value.
 *
 * Deliberate consolidation of the accepted owner, kept to the app's own rules:
 *
 *   · The value is an `output`, not the reference's `<input type="number">`.
 *     Text entry in production goes through the public field components
 *     (`design-system-097-deprecations.test.ts`), and the shipped AMRAP counter
 *     (EXE-04c) and the package's own counter are tap-only; typing a count
 *     would be a new behaviour. The `output`'s implicit `status` role announces
 *     each new count once per tap, as the shipped counter did.
 *   · The reference's `max` is not carried: no consumer bounds a count.
 *
 * Presentation only: the consumer owns the value and where it is written.
 */
import { useId } from 'react'

import { IconButton, Minus, Plus } from '../../design-system/index'
import './tokens.css'
import './presentation.css'

export interface QuantitySelectorProps {
  /** The field's visible label. It names the group, the value and both actions. */
  label: string
  /** The count, or `null` when none has been reported. Zero is an observed zero. */
  value: number | null
  /** The next count. Never `null`: tapping down stops at zero, and nothing clears. */
  onChange: (next: number) => void
}

export function QuantitySelector({ label, value, onChange }: QuantitySelectorProps) {
  const labelId = useId()
  const name = label.toLowerCase()
  const atFloor = value === null || value === 0

  return (
    <div className="clr-timed-field" data-quantity-field="">
      <span className="label" id={labelId}>
        {label}
      </span>
      <div
        className="clr-quantity clr-chamfer clr-chamfer--sm clr-chamfer--structure"
        role="group"
        aria-labelledby={labelId}
      >
        <IconButton
          variant="secondary"
          size="sm"
          icon={<Minus />}
          label={`Decrease ${name}`}
          disabled={atFloor}
          onClick={() => {
            if (value !== null && value > 0) onChange(value - 1)
          }}
        />
        <output
          className="clr-quantity__value"
          aria-labelledby={labelId}
          data-quantity-value={value === null ? 'blank' : String(value)}
        >
          {value === null ? (
            <>
              <span aria-hidden="true">—</span>
              <span className="a11y-hidden">Not recorded</span>
            </>
          ) : (
            value
          )}
        </output>
        <IconButton
          variant="secondary"
          size="sm"
          icon={<Plus />}
          label={`Increase ${name}`}
          onClick={() => onChange((value ?? 0) + 1)}
        />
      </div>
    </div>
  )
}
