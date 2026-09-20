import type { MouseEvent } from 'react'

/**
 * First focusable element in the app (CORE-05). Visually hidden until focused
 * (`.skip-link` in src/styles/a11y.css). The click handler focuses `#main`
 * directly so the jump works identically under client-side routing.
 */
export function SkipLink() {
  function skipToMain(event: MouseEvent<HTMLAnchorElement>) {
    const main = document.getElementById('main')
    if (main === null) return
    event.preventDefault()
    if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1')
    main.focus()
  }

  return (
    <a className="skip-link" href="#main" onClick={skipToMain}>
      Skip to content
    </a>
  )
}
