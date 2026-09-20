/**
 * CORE-05 / export pattern 1: on submit failure, focus moves to the first
 * invalid control. This is the one shared submit helper — call it from the
 * submit handler after validation fails, never re-implement it per form.
 *
 * "Invalid" means `aria-invalid="true"` (what `FormField`'s `errorText` sets)
 * or the platform's own `:invalid` state on native controls.
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
