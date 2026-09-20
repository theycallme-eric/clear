import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

import { toastQueue } from '../state/toasts'

// Vitest runs without injected globals, so testing-library cannot register its
// own afterEach auto-cleanup; do it explicitly.
afterEach(cleanup)

// The root toast queue is a module singleton; drop anything a test showed so
// no toast leaks into the next test's live regions.
afterEach(() => toastQueue.clear())

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

// jsdom 29 reflects <dialog>'s `open` attribute but implements neither
// showModal() nor close(); the vendored Dialog drives both. The shim keeps the
// same observable contract the component relies on: showModal opens, close
// clears `open` and fires a non-bubbling `close` event.
if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement, returnValue?: string) {
    if (!this.open) return
    if (returnValue !== undefined) this.returnValue = returnValue
    this.open = false
    this.dispatchEvent(new Event('close'))
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
