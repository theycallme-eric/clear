import { resolve } from 'node:path'

/** Public, byte-preserved test inputs; explicit external paths still take precedence. */
export function bundledEffectsInput(name: string): string | undefined {
  const root = resolve(import.meta.dirname, '../fixtures/effects-reference')
  if (name === 'CLEAR_EFFECTS_REFERENCE_DIR') return root
  if (name === 'CLEAR_EFFECTS_CURRENT_SETTINGS') return resolve(root, 'crt-iab-current-settings.json')
  return undefined
}
