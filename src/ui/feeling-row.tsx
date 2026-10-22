/**
 * The debrief's feeling choice — U43.
 *
 * One row of five numbers, 1 to 5, evenly divided and never wrapped. The
 * number is all that is drawn; the scale's word (`MOOD_SCALE`, the list
 * HIST-01's report reads too) is in each option's accessible name, so a
 * screen reader hears "4, Ready" where the eye sees "4", and the meaning the
 * stored value has always had is kept without five words repeated on screen.
 *
 * It is `ChoiceGroup` underneath: one tab stop, arrows and Home/End, a tick on
 * the selection as well as a colour. The answer is optional — nothing chosen
 * is `null`, and once something is, a Clear control puts it back to `null`,
 * which is a saved state like any other.
 *
 * This is the session's feeling and nothing else. It is not an effort rating
 * and is never read as one; it writes `workout_sessions.mood` only.
 */
import { useRef } from 'react'

import { Button, ChoiceGroup } from '../design-system/index'
import { MOOD_SCALE } from '../state/mood'

import './feeling-row.css'

export const FEELING_LEGEND = 'How do you feel?'
export const FEELING_CLEAR_LABEL = 'Clear feeling'

/** What each option is called: the number it shows, then the scale's word. */
function feelingName(value: number, label: string): string {
  return `${value}, ${label}`
}

export interface FeelingRowProps {
  /** The stored 1–5 value, or `null` for no answer. */
  readonly value: number | null
  readonly onChange: (next: number | null) => void
}

export function FeelingRow({ value, onChange }: FeelingRowProps) {
  const rowRef = useRef<HTMLDivElement>(null)

  return (
    <div ref={rowRef} className="clr-stack">
      <ChoiceGroup
        className="clr-feeling-row"
        legend={FEELING_LEGEND}
        options={MOOD_SCALE.map(({ value: step, label }) => ({
          value: String(step),
          label: (
            <>
              <span aria-hidden="true">{step}</span>
              <span className="a11y-hidden">{feelingName(step, label)}</span>
            </>
          ),
        }))}
        value={value === null ? undefined : String(value)}
        onChange={(next) => {
          onChange(Number(Array.isArray(next) ? next[0] : next))
        }}
      />
      {value !== null && (
        <div className="clr-feeling-row__clear">
          <Button
            type="button"
            variant="quiet"
            size="sm"
            aria-label={FEELING_CLEAR_LABEL}
            onClick={() => {
              onChange(null)
              // The control that was pressed is about to go; the question it
              // cleared keeps the caret, so the keyboard is not dropped.
              rowRef.current?.querySelector<HTMLElement>('[role="radio"]')?.focus()
            }}
          >
            Clear
          </Button>
        </div>
      )}
    </div>
  )
}
