import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest runs without injected globals, so testing-library cannot register its
// own afterEach auto-cleanup; do it explicitly.
afterEach(cleanup)

// jsdom implements neither Element.scrollTo nor window.matchMedia; the vendored
// OverflowRail needs both for active-item reveal and reduced-motion handling.
if (typeof Element.prototype.scrollTo !== 'function') {
  Element.prototype.scrollTo = function scrollTo(this: Element, options?: ScrollToOptions | number, y?: number) {
    if (typeof options === 'object' && options !== null) {
      if (options.left != null) (this as HTMLElement).scrollLeft = options.left
      if (options.top != null) (this as HTMLElement).scrollTop = options.top
    } else {
      if (typeof options === 'number') (this as HTMLElement).scrollLeft = options
      if (typeof y === 'number') (this as HTMLElement).scrollTop = y
    }
  }
}

if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
