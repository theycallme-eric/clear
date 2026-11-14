/**
 * TASK-016 (C40; R81, R90, R91, R100, R110): the focused logging dialog's
 * title, for the form it holds.
 *
 * The selected simple hierarchy has one title: the dialog's. A logging form
 * held by `LoggingOverlay` reads this context, drops its own inline title and
 * names itself by the dialog's (`aria-labelledby`), so the dialog never shows
 * a second, competing heading under its own. Inline — in a card on the route
 * — the context is `null` and the form keeps its own title, unchanged.
 *
 * The id is the dialog title's element id; `null` outside the dialog.
 */
import { createContext, useContext } from 'react'

export const LoggingOverlayTitleContext = createContext<string | null>(null)

/** The holding dialog's title id, or `null` when the form is not in one. */
export function useLoggingOverlayTitle() {
  return useContext(LoggingOverlayTitleContext)
}
