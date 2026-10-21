/**
 * SET-01 / U24 — the appearance choice, which is a wrapper and not an
 * implementation.
 *
 * `skin.js` ships the storage half of the contract — `localStorage['clear.skin']`,
 * unknown values ignored — and this module uses that and nothing else of its
 * precedence. What it deliberately does *not* use is the export's second rung,
 * `prefers-contrast: more` → `mono`: the product offers explicit skins only, so
 * an OS setting never picks one. With nothing stored — never chosen, or the
 * retired System option, which was the absence of a stored skin — the active
 * skin is the product default. Enhanced contrast is still one choice away:
 * Mono is an explicit option and says what it is.
 *
 * The option list is derived from `SKINS`. Adding a skin to the export adds an
 * option here with no code change, which is why there is no list in this file
 * and no switch over skin names. The two maps below are copy, not membership: a
 * skin missing from either still gets an option, labelled from its own id.
 */
import { useState } from 'react'

import { setSkin, SKINS, storedSkin } from '../design-system/skin'

/**
 * The skin a device shows while nothing explicit is stored. `index.html`'s
 * head bootstrap writes the same value before first paint.
 */
export const DEFAULT_SKIN = 'clear'

/** A skin id from `SKINS`. */
export type AppearanceChoice = string

/** One option in the picker. */
export interface AppearanceOption {
  value: AppearanceChoice
  label: string
}

/**
 * Display names for skins whose id is not how the product writes it. A skin
 * absent from this map is labelled from its id, so a new skin needs no entry.
 */
const DISPLAY_NAMES: Readonly<Record<string, string>> = {
  clear: 'CLEAR',
}

/**
 * What an option says about itself beyond its name.
 *
 * Mono is **enhanced contrast**, never "accessible": accessibility is the
 * baseline and applies to all four skins equally, so naming one of them the
 * accessible one would say the other three are less so (ATOMIC.md §7.1).
 */
const NOTES: Readonly<Record<string, string>> = {
  mono: 'enhanced contrast',
}

const titleCase = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1)

/** The label for one choice: its display name, plus its note when it has one. */
export function appearanceLabel(choice: AppearanceChoice): string {
  const name = DISPLAY_NAMES[choice] ?? titleCase(choice)
  const note = NOTES[choice]

  return note === undefined ? name : `${name} — ${note}`
}

/** Every option the picker offers: every skin the export ships, in its order. */
export function appearanceOptions(): AppearanceOption[] {
  return SKINS.map((choice) => ({
    value: choice,
    label: appearanceLabel(choice),
  }))
}

/**
 * The skin this device uses: the stored explicit choice, else the product
 * default. Never the OS contrast preference — and a stored value the export
 * does not know, such as a legacy `system`, is no choice at all.
 */
export function currentAppearance(): AppearanceChoice {
  return storedSkin() ?? DEFAULT_SKIN
}

/**
 * Apply a choice. The skin flips on `<html>` immediately — every screen with
 * it, because the ramps derive at `:root` — and the choice survives a reload.
 *
 * `persist: false` is the gallery's, which must be able to look at four skins
 * in a row without overwriting the reviewer's own preference.
 */
export function applyAppearance(
  choice: AppearanceChoice,
  { persist = true }: { persist?: boolean } = {},
): void {
  setSkin(choice, { persist })
}

/**
 * The picker's state: the device's skin to start with, and a setter that
 * applies before it re-renders. Nothing subscribes to the OS preference,
 * because nothing about the skin follows it.
 */
export function useAppearance(options: { persist?: boolean } = {}): [
  AppearanceChoice,
  (choice: AppearanceChoice) => void,
] {
  const { persist } = options
  const [choice, setChoice] = useState<AppearanceChoice>(currentAppearance)

  return [
    choice,
    (next: AppearanceChoice) => {
      applyAppearance(next, { persist })
      setChoice(next)
    },
  ]
}
