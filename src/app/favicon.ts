/**
 * SET-01 — the favicon that matches the active skin.
 *
 * A favicon reads no stylesheet, so it cannot follow `--base` and `--structure`
 * the way everything else in the app does. The mark is therefore committed once
 * per skin under `public/icons/`, outside the bundle because those files are
 * fetched by a fixed URL — and outside `src/` because their two colours are
 * literal hex, which the DS-08 gate correctly refuses in app-owned source.
 * `src/test/skin-favicons.test.ts` reads each one back against the skin's own
 * tokens, so a skin whose hues change and a skin added with no mark both fail.
 *
 * What is followed here is the attribute rather than the picker: `data-skin` on
 * `<html>` is where the skin actually is, whoever moved it — SET-01's picker, a
 * restored preference at boot, or `initSkin` tracking the OS contrast setting
 * for a user who has chosen nothing. One observer, one path, and no way for a
 * caller to change the skin and forget the icon.
 */
import { SKINS } from '../design-system/skin'

/** Where the committed marks live, one per skin in `SKINS`. */
export const faviconHref = (skin: string): string | null =>
  SKINS.includes(skin) ? `/icons/favicon-${skin}.svg` : null

/**
 * Point the document's icon link at a skin's mark. An unknown skin leaves the
 * link alone: the document already ships a `<link rel="icon">`, and a wrong
 * icon is worse than a stale one.
 */
export function applyFavicon(
  skin: string,
  doc: Document = document,
): string | null {
  const href = faviconHref(skin)
  if (href === null) return null

  const link =
    doc.querySelector<HTMLLinkElement>('link[rel="icon"]') ??
    doc.head.appendChild(
      Object.assign(doc.createElement('link'), { rel: 'icon' }),
    )

  link.type = 'image/svg+xml'
  link.href = href
  return href
}

/**
 * Apply the active skin's mark now, and again whenever `data-skin` changes.
 * Returns a stop function; `main.tsx` never calls it, because the observer's
 * lifetime is the document's.
 */
export function startFaviconSync(doc: Document = document): () => void {
  const root = doc.documentElement
  const sync = () => applyFavicon(root.getAttribute('data-skin') ?? '', doc)

  sync()

  const observer = new MutationObserver(sync)
  observer.observe(root, { attributes: true, attributeFilter: ['data-skin'] })

  return () => observer.disconnect()
}
