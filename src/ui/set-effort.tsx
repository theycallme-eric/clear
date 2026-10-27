/**
 * REQ-011 — one set's effort, asked in the sheet beside its reps and load.
 *
 * Three choices and no number: too hard, about right, too easy, drawn left to
 * right as the system's Frown, Meh and Smile faces. The words are in each
 * option's accessible name and nowhere on screen, so a screen reader hears
 * "Too hard" where the eye sees a face, and the selected one is announced as
 * checked — with the chip's tick as well as its colour.
 *
 * It is `ChoiceGroup` underneath, as the debrief's feeling row is: one tab
 * stop, arrows and Home/End. The answer is optional. Nothing chosen is `null`
 * — unanswered, never the middle face, never zero, never a guess — and once
 * something is chosen a compact Clear puts it back to `null`.
 *
 * This is one set's effort and nothing else. The session's five-choice feeling
 * (`feeling-row.tsx`) is a different question, stored in a different column,
 * and neither is ever read as the other.
 */
import { useRef, type ReactElement } from 'react'

import type { Enums } from '../data/database.types'
import { Button, ChoiceGroup, Frown, Meh, Smile, type IconProps } from '../design-system/index'

import './set-effort.css'

export type SetEffort = Enums<'set_effort'>

export const SET_EFFORT_LEGEND = 'Effort'

/** The three answers, in the order they are drawn: left to right. */
export const SET_EFFORT_CHOICES: readonly {
  readonly value: SetEffort
  readonly label: string
  readonly Glyph: (props: IconProps) => ReactElement
}[] = [
  { value: 'too_hard', label: 'Too hard', Glyph: Frown },
  { value: 'about_right', label: 'About right', Glyph: Meh },
  { value: 'too_easy', label: 'Too easy', Glyph: Smile },
]

function choiceFor(value: SetEffort) {
  return SET_EFFORT_CHOICES.find((choice) => choice.value === value)
}

function isSetEffort(value: string): value is SetEffort {
  return SET_EFFORT_CHOICES.some((choice) => choice.value === value)
}

export interface SetEffortChoiceProps {
  /** The set being entered or corrected — it names the Clear control. */
  readonly setNumber: number
  /** The set's answer, or `null` for unanswered. */
  readonly value: SetEffort | null
  readonly onChange: (next: SetEffort | null) => void
}

export function SetEffortChoice({ setNumber, value, onChange }: SetEffortChoiceProps) {
  const rowRef = useRef<HTMLDivElement>(null)

  return (
    <div ref={rowRef} className="clr-set-effort">
      <ChoiceGroup
        className="clr-set-effort__choices"
        legend={SET_EFFORT_LEGEND}
        options={SET_EFFORT_CHOICES.map(({ value: choice, label, Glyph }) => ({
          value: choice,
          label: (
            <>
              <Glyph size={20} />
              <span className="a11y-hidden">{label}</span>
            </>
          ),
        }))}
        value={value ?? undefined}
        onChange={(next) => {
          const chosen = Array.isArray(next) ? next[0] : next
          if (chosen !== undefined && isSetEffort(chosen)) onChange(chosen)
        }}
      />
      {value !== null && (
        <div className="clr-set-effort__clear">
          <Button
            type="button"
            variant="quiet"
            size="sm"
            aria-label={`Clear effort for set ${setNumber}`}
            onClick={() => {
              onChange(null)
              // The pressed control is about to go; the question keeps the caret.
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

/**
 * A saved set's effort, read back beside its result: the face, named for a
 * screen reader. An unanswered set draws nothing — no face stands in for an
 * answer nobody gave.
 */
export function SetEffortReading({ value }: { value: SetEffort | null }) {
  if (value === null) return null
  const choice = choiceFor(value)
  if (choice === undefined) return null
  const { Glyph, label } = choice

  return (
    <span role="img" aria-label={`Effort: ${label.toLowerCase()}`} className="clr-set-effort__reading">
      <Glyph size={16} />
    </span>
  )
}
