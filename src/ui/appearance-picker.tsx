/**
 * SET-01 — the appearance picker.
 *
 * A wrapper over two things that already exist: `ChoiceGroup`, which is the
 * shipped radiogroup (one tab stop, arrow keys, and a tick on the selection so
 * colour is never the only cue), and `src/state/appearance.ts`, which is itself
 * a wrapper over the export's `skin.js`. Nothing about persistence, the OS
 * contrast preference, or the `data-skin` attribute is decided here.
 *
 * Controlled on purpose. The choice is state a screen owns — Settings holds it
 * through `useAppearance`, the gallery holds a fixed one so a reviewer can look
 * at a selected option without touching their own stored preference — and a
 * component that both stored the choice and drew it could only be reviewed in
 * whichever state the reviewer happened to be in.
 */
import { ChoiceGroup } from '../design-system/index'
import { appearanceOptions, type AppearanceChoice } from '../state/appearance'

export interface AppearancePickerProps {
  /** The current choice: a skin id, or `SYSTEM_APPEARANCE`. */
  value: AppearanceChoice
  onChange: (choice: AppearanceChoice) => void
  /** Overrides the legend when a screen has already named the section. */
  legend?: string
}

/** ChoiceGroup reports `string | string[]`; this group is single-select. */
function single(value: string | string[]): string {
  return Array.isArray(value) ? (value[0] ?? '') : value
}

export function AppearancePicker({
  value,
  onChange,
  legend = 'Appearance',
}: AppearancePickerProps) {
  return (
    <ChoiceGroup
      legend={legend}
      // Derived from `SKINS`, never a list written out here: a skin added to
      // the export becomes an option with no change to this file.
      options={appearanceOptions()}
      value={value}
      onChange={(next) => onChange(single(next))}
    />
  )
}
