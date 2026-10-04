/**
 * Card containment: a card holds content and element frames, never another
 * card. The shared adapters read this to drop their own framing when a card
 * already surrounds them.
 */
import { createContext, useContext } from 'react'

export const CardContainmentContext = createContext(false)

/** True when the caller renders inside a Card body. */
export function useInsideCard() {
  return useContext(CardContainmentContext)
}
