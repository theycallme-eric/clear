/**
 * CORE-05 / export pattern 1 — the one shared submit helper.
 *
 * "On submit failure, focus moves to the first invalid control" is a rule that
 * every form in the app obeys, so it is written once here rather than being a
 * habit each form is trusted to remember. Forms wire themselves to
 * `useInvalidFocus` and say only whether their submit was accepted; where the
 * caret then goes is this file's decision, not theirs. The form element comes
 * from the submit event, so wiring one up is a single prop.
 *
 * Timing is the reason this is a hook rather than a call at the end of a submit
 * handler. A control is marked invalid by the render that the failure causes,
 * so reading the DOM inside the handler reads the state *before* the failure.
 * The focus move therefore happens in a layout effect keyed on the failure
 * count — after React has committed the invalid markup, before the browser
 * paints it, and once per failure, so submitting the same bad value twice moves
 * focus both times.
 */
import { useCallback, useLayoutEffect, useRef, useState, type FormEvent } from 'react'

/**
 * What a wrapped submit answers: `true` when the submit was accepted, `false`
 * when it failed and the form now marks the control that caused it.
 */
export type SubmitOutcome = boolean | Promise<boolean>

export type SubmitHandler = (event: FormEvent<HTMLFormElement>) => SubmitOutcome

/** Wraps a submit handler: prevents the default and owns the focus move. */
export type InvalidFocus = (
  submit: SubmitHandler,
) => (event: FormEvent<HTMLFormElement>) => void

/**
 * The first invalid control inside `container`, focused.
 *
 * "Invalid" means `aria-invalid="true"` (what the export's `Input` sets from
 * its `invalid` prop) or the platform's own `:invalid` state on a native
 * control — whichever comes first in document order, which is the one the
 * person reading the form reaches first.
 */
export function focusFirstInvalid(container: HTMLElement): HTMLElement | null {
  let invalid: HTMLElement | null
  try {
    invalid = container.querySelector<HTMLElement>(
      '[aria-invalid="true"], :invalid',
    )
  } catch {
    // Selector engines without :invalid still honour the app's own contract.
    invalid = container.querySelector<HTMLElement>('[aria-invalid="true"]')
  }
  invalid?.focus()
  return invalid
}

export function useInvalidFocus(): InvalidFocus {
  // The form comes from the submit event, so a form wires itself up with one
  // prop and cannot forget the other half.
  const submitted = useRef<HTMLFormElement | null>(null)
  const [failures, setFailures] = useState(0)

  useLayoutEffect(() => {
    if (failures === 0) return
    const form = submitted.current
    if (form !== null) focusFirstInvalid(form)
  }, [failures])

  return useCallback(
    (submit: SubmitHandler) => (event: FormEvent<HTMLFormElement>) => {
      // Always: the app validates and reports failures itself, so the browser
      // never gets to navigate the form away or own the error presentation.
      event.preventDefault()
      // Read synchronously: `currentTarget` is only the form during dispatch.
      submitted.current = event.currentTarget

      const settle = (accepted: boolean) => {
        if (!accepted) setFailures((count) => count + 1)
      }

      const outcome = submit(event)
      if (typeof outcome === 'boolean') {
        settle(outcome)
        return
      }
      // A failure the server decides is still a submit failure: the control it
      // rejected is marked invalid by the same render, and the caret follows.
      void outcome.then(settle)
    },
    [],
  )
}
