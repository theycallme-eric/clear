/**
 * The open section's name, for the secondary label on each block card's top
 * row (REQ-008). The workout shell provides it around the section's blocks;
 * a block drawn anywhere else has no section to name and states its size.
 */
import { createContext, use } from 'react'

export const SectionLabelContext = createContext<string | null>(null)

export function useSectionLabel(): string | null {
  return use(SectionLabelContext)
}
