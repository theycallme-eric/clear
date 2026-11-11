/**
 * Where the set-logging half-sheet is drawn, and which movement has it open.
 *
 * The workout shell mounts one host (`SetLoggingSheetHost`) and one slot in
 * its pinned foot (`SetLoggingSheetSlot`). A movement's logger asks this seam
 * for its placement: with a host, its sheet is portalled into that slot and at
 * most one movement's sheet is open at a time; with none — a renderer test, a
 * gallery specimen — it keeps its own open state and draws the sheet in place.
 *
 * Collapsing a sheet only hides it. The draft it was holding belongs to the
 * logger that opened it, so a collapse and a reopen lose nothing.
 *
 * TASK-043 (REQ-019, C45): a logger whose family has adopted the shared
 * focused logging dialog (`refinements/logging-overlay.tsx`) asks for a
 * `focused` placement. The host still records which movement is open — so at
 * most one entry is open, and the footer's rest steps aside for the one the
 * entry draws — but the dialog is not drawn in the half-sheet's slot: it is
 * portalled to the document body, where the native modal brings its own
 * backdrop, and the half-sheet layer stays closed and draws no second dim.
 */
import { createContext, use, useCallback, useLayoutEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface SetLoggingSheetHostApi {
  /** The movement whose sheet is open, by key, or null when none is. */
  readonly openKey: string | null
  /** True when the open entry is drawn in the focused logging dialog (TASK-043). */
  readonly openFocused: boolean
  open(key: string, focused?: boolean): void
  /** Closes `key`'s sheet, and leaves another movement's open sheet alone. */
  close(key: string): void
  /** The slot the open sheet is drawn into; null until it has mounted. */
  readonly container: HTMLElement | null
  attach(element: HTMLElement | null): void
}

export const SetLoggingSheetHostContext = createContext<SetLoggingSheetHostApi | null>(null)

/**
 * True while some movement's entry is open — in the shell's slot or in the
 * focused logging dialog. Either way it draws the running rest itself.
 */
export function useSetLoggingSheetOpen(): boolean {
  const host = use(SetLoggingSheetHostContext)
  return host !== null && host.openKey !== null
}

/** True while the open entry is the half-sheet drawn in the shell's slot. */
export function useSetLoggingSheetLayerOpen(): boolean {
  const host = use(SetLoggingSheetHostContext)
  return host !== null && host.openKey !== null && !host.openFocused
}

export interface SetLoggingSheetPlacement {
  readonly open: boolean
  setOpen(open: boolean): void
  /**
   * Draws the sheet where it belongs: the shell's slot, or in place. A
   * `focused` placement draws its dialog whether open or not — the native
   * dialog closes itself and hands focus back — portalled to the document
   * body under a host, in place without one.
   */
  place(sheet: ReactNode): ReactNode
}

export interface SetLoggingSheetPlacementOptions {
  /** TASK-043: the entry is the shared focused logging dialog, not the half-sheet. */
  readonly focused?: boolean
}

export function useSetLoggingSheetPlacement(
  key: string,
  { focused = false }: SetLoggingSheetPlacementOptions = {},
): SetLoggingSheetPlacement {
  const host = use(SetLoggingSheetHostContext)
  const [localOpen, setLocalOpen] = useState(false)

  const hostClose = host?.close
  // A movement that leaves the screen — another section opened — takes its
  // sheet with it, so the shell never believes a sheet is open that nobody draws.
  // A layout effect, so the footer's rest returns in the same commit rather than
  // leaving a frame with the countdown drawn nowhere.
  useLayoutEffect(() => () => hostClose?.(key), [hostClose, key])

  const hostOpen = host?.open
  const setOpen = useCallback(
    (next: boolean) => {
      if (hostOpen === undefined || hostClose === undefined) {
        setLocalOpen(next)
        return
      }
      if (next) hostOpen(key, focused)
      else hostClose(key)
    },
    [focused, hostClose, hostOpen, key],
  )

  if (host === null) {
    return {
      open: localOpen,
      setOpen,
      place: (sheet) => (focused || localOpen ? sheet : null),
    }
  }

  const open = host.openKey === key
  const container = host.container
  return {
    open,
    setOpen,
    place: (sheet) =>
      focused
        ? createPortal(sheet, document.body)
        : open && container !== null ? createPortal(sheet, container) : null,
  }
}
