import { createContext, useContext } from 'react'

export interface ScreenRegistry {
  /** Called by `Screen` so `AppChrome` can announce the screen by name. */
  register: (title: string) => void
}

export const ScreenRegistryContext = createContext<ScreenRegistry | null>(null)

export function useScreenRegistry(): ScreenRegistry | null {
  return useContext(ScreenRegistryContext)
}
