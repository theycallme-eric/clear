/**
 * SET-01 — the appearance choice, which is a wrapper and not an implementation.
 *
 * `skin.js` ships the whole persistence contract — `localStorage['clear.skin']`
 * → `prefers-contrast: more` → the app default, an explicit choice always
 * winning — so nothing here stores anything, reads a media query, or writes the
 * attribute. What this module adds is the one thing the export cannot know: the
 * *choice*, which has an option the skin list does not, because "follow the
 * system" is the absence of a stored skin rather than a skin.
 *
 * The option list is derived from `SKINS`. Adding a skin to the export adds an
 * option here with no code change, which is why there is no list in this file
 * and no switch over skin names. The two maps below are copy, not membership: a
 * skin missing from either still gets an option, labelled from its own id.
 */
import { useState } from 'react'

import { setSkin, SKINS, storedSkin } from '../design-system/skin'

/**
 * The option that is not a skin. It is `setSkin(null)` — no stored choice, so
 * the OS contrast preference is followed live again.
 */
export const SYSTEM_APPEARANCE = 'system'

/** A skin id from `SKINS`, or `SYSTEM_APPEARANCE`. */
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
  [SYSTEM_APPEARANCE]: 'follows your contrast setting',
  mono: 'enhanced contrast',
}

const titleCase = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1)

/** The label for one choice: its display name, plus its note when it has one. */
export function appearanceLabel(choice: AppearanceChoice): string {
  const name =
    choice === SYSTEM_APPEARANCE
      ? 'System'
      : (DISPLAY_NAMES[choice] ?? titleCase(choice))
  const note = NOTES[choice]

  return note === undefined ? name : `${name} — ${note}`
}

/**
 * Every option the picker offers: the system option, then every skin the export
 * ships, in the order it ships them.
 */
export function appearanceOptions(): AppearanceOption[] {
  return [SYSTEM_APPEARANCE, ...SKINS].map((choice) => ({
    value: choice,
    label: appearanceLabel(choice),
  }))
}

/**
 * The choice as stored — which is the stored skin, or the system option when
 * nothing is stored. Deliberately not `currentSkin()`: while no choice is
 * stored the active skin is `mono` for a user who asked the OS for more
 * contrast, and showing Mono as *their* choice would be wrong the moment they
 * changed that setting.
 */
export function currentAppearance(): AppearanceChoice {
  return storedSkin() ?? SYSTEM_APPEARANCE
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
  setSkin(choice === SYSTEM_APPEARANCE ? null : choice, { persist })
}

/**
 * The picker's state: the stored choice to start with, and a setter that
 * applies before it re-renders. Nothing subscribes to the OS preference —
 * `initSkin` already follows it while no choice is stored, and the answer to
 * "what did you choose" does not change when it flips.
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
