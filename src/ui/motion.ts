/**
 * CORE-05: an app-composed JS animation (rAF loops, timed reveals) must render
 * its final state immediately under reduced motion. CSS animation gets the
 * same guarantee from the end-state block in src/styles/a11y.css; this is the
 * check for animation driven from script.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}
