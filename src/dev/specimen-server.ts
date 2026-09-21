/**
 * DS-07 — the dev-only middleware that serves the export's specimen cards.
 *
 * "Served **unmodified**" is the acceptance criterion, so this reads the
 * vendored file and writes its bytes. It deliberately does not go through
 * Vite's own transform pipeline: a card requested as a page would be rewritten
 * with the HMR client injected, and its `<link rel="stylesheet" href="../styles.css">`
 * would come back as a JavaScript module rather than CSS. The cards are plain
 * documents with relative references, and this serves them as exactly that —
 * which is also why the prefix mirrors the vendored folder's own shape, so
 * `../styles.css` and `../../_ds_bundle.js` resolve the way the export wrote
 * them.
 *
 * `apply: 'serve'` keeps the whole thing out of every production build; the
 * plugin is loaded by `vite.config.ts` and never by browser code.
 */
import { readFile } from 'node:fs/promises'
import { extname, isAbsolute, relative, resolve, sep } from 'node:path'

import type { Plugin } from 'vite'

// Explicit extension: this module is reached through `vite.config.ts`, which
// Vite's native config loader resolves with Node's own rules.
import { SPECIMEN_BASE, VENDOR_DIR } from './specimen-url.ts'

/**
 * Extensions the export's specimens actually reference, each with the type the
 * browser needs to honour it. An allow-list rather than a lookup: a request for
 * anything else is not a specimen asset and falls through to Vite.
 */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
}

export interface SpecimenRequest {
  /** Absolute path of the vendored file to serve. */
  path: string
  contentType: string
}

/**
 * Maps a request URL onto a vendored file, or null when it is not a specimen
 * request. Null is also the answer for anything that tries to climb out of the
 * vendored folder or asks for a type the specimens never reference — the
 * middleware serves the export, not the repository.
 */
export function resolveSpecimenRequest(
  url: string,
  root: string,
): SpecimenRequest | null {
  const path = url.split(/[?#]/, 1)[0]
  if (!path.startsWith(SPECIMEN_BASE)) return null

  let requested: string
  try {
    requested = decodeURIComponent(path.slice(SPECIMEN_BASE.length))
  } catch {
    return null // a malformed escape is not a file name
  }
  if (requested === '' || requested.includes('\0')) return null

  const vendorRoot = resolve(root, VENDOR_DIR)
  const target = resolve(vendorRoot, requested)
  const inside = relative(vendorRoot, target)
  if (inside === '' || inside.startsWith('..' + sep) || isAbsolute(inside)) {
    return null
  }

  const contentType = CONTENT_TYPES[extname(target).toLowerCase()]
  if (contentType === undefined) return null

  return { path: target, contentType }
}

/** The dev-server plugin. Never present in a build — `apply: 'serve'`. */
export function specimenServer(): Plugin {
  return {
    name: 'clear-dev-specimens',
    apply: 'serve',
    configureServer(server) {
      const root = server.config.root

      server.middlewares.use((req, res, next) => {
        const request = resolveSpecimenRequest(req.url ?? '', root)
        if (request === null) {
          next()
          return
        }

        readFile(request.path).then((body) => {
          res.setHeader('Content-Type', request.contentType)
          // The vendored tree changes only on a version bump, but a reviewer
          // comparing two runs should never be looking at a cached card.
          res.setHeader('Cache-Control', 'no-cache')
          res.end(body)
        }, next)
      })
    },
  }
}
