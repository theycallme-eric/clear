/**
 * SET-01 — the favicon follows the active skin.
 *
 * The subject is the attribute rather than the picker, so the tests move
 * `data-skin` the way anything in the app moves it — `setSkin` — and assert
 * what the document's icon link ends up pointing at. The negative matters as
 * much as the positive: an attribute value that names no skin must leave the
 * link where it is rather than request a file that does not exist.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { setSkin, SKINS } from '../design-system/skin'
import { applyFavicon, faviconHref, startFaviconSync } from './favicon'

const iconLink = () =>
  document.querySelector<HTMLLinkElement>('link[rel="icon"]')

/** The shipped document ships one; tests start from the same shape. */
function mountIconLink(href = '/icon.svg'): HTMLLinkElement {
  const link = document.createElement('link')
  link.rel = 'icon'
  link.type = 'image/svg+xml'
  link.href = href
  document.head.appendChild(link)
  return link
}

const stopped: Array<() => void> = []

afterEach(() => {
  for (const stop of stopped.splice(0)) stop()
  document.head.querySelectorAll('link[rel="icon"]').forEach((link) => link.remove())
  document.documentElement.removeAttribute('data-skin')
  localStorage.clear()
})

describe('the href', () => {
  it('names a mark for every skin the export ships', () => {
    for (const skin of SKINS) {
      expect(faviconHref(skin)).toBe(`/icons/favicon-${skin}.svg`)
    }
  })

  it('has none for a value that is not a skin', () => {
    expect(faviconHref('ember')).toBeNull()
    expect(faviconHref('')).toBeNull()
  })
})

describe('applying one', () => {
  it('repoints the link the document already ships', () => {
    const link = mountIconLink()

    expect(applyFavicon('mono')).toBe('/icons/favicon-mono.svg')
    expect(link.getAttribute('href')).toBe('/icons/favicon-mono.svg')
    expect(document.querySelectorAll('link[rel="icon"]')).toHaveLength(1)
  })

  it('adds one when the document has none', () => {
    expect(applyFavicon('signal')).toBe('/icons/favicon-signal.svg')
    expect(iconLink()?.getAttribute('href')).toBe('/icons/favicon-signal.svg')
    expect(iconLink()?.type).toBe('image/svg+xml')
  })

  it('leaves the link alone for an unknown skin', () => {
    const link = mountIconLink()

    expect(applyFavicon('ember')).toBeNull()
    expect(link.getAttribute('href')).toBe('/icon.svg')
  })
})

describe('the sync', () => {
  it('matches the skin that is already active when it starts', () => {
    mountIconLink()
    setSkin('vapour')

    stopped.push(startFaviconSync())

    expect(iconLink()?.getAttribute('href')).toBe('/icons/favicon-vapour.svg')
  })

  it('follows a skin change, whoever made it', async () => {
    mountIconLink()
    stopped.push(startFaviconSync())

    // The picker's own call. Any other writer of the attribute — a restored
    // preference, `initSkin` tracking the OS — arrives here the same way.
    setSkin('signal')

    await Promise.resolve()
    expect(iconLink()?.getAttribute('href')).toBe('/icons/favicon-signal.svg')
  })

  it('stops when it is stopped', async () => {
    mountIconLink()
    const stop = startFaviconSync()
    setSkin('mono')
    await Promise.resolve()

    stop()
    setSkin('vapour')
    await Promise.resolve()

    expect(iconLink()?.getAttribute('href')).toBe('/icons/favicon-mono.svg')
  })
})
