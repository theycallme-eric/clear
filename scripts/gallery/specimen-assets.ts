import { readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, relative, resolve, sep } from 'node:path'

import type { Plugin } from 'vite'

import { PUBLIC_SPECIMEN_BASE, VENDOR_DIR } from '../../src/dev/specimen-url.ts'

const TYPES: Readonly<Record<string, string>> = {
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

/** Only reference documents and their static dependencies are public, not the archive tree. */
export function publicSpecimenFiles(root: string): string[] {
  const vendor = resolve(root, VENDOR_DIR)
  const pending = readdirSync(resolve(vendor, 'preview'))
    .filter((file) => file.endsWith('.html'))
    .map((file) => `preview/${file}`)
  for (const entry of readdirSync(resolve(vendor, 'components'), { withFileTypes: true })) {
    if (entry.isDirectory()) pending.push(`components/${entry.name}/card.html`)
  }
  const files = new Set<string>()
  while (pending.length > 0) {
    const file = pending.pop()!
    if (files.has(file)) continue
    if (file.split('/').some((part) => ['_source', 'uploads', 'templates'].includes(part))) {
      throw new Error(`Upstream reference reaches a nonpublic archive directory: ${file}`)
    }
    if (TYPES[extname(file)] === undefined) throw new Error(`Unsupported reference asset: ${file}`)
    const bytes = readFileSync(resolve(vendor, file))
    files.add(file)
    if (!['.html', '.css'].includes(extname(file))) continue
    const text = bytes.toString('utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
    const urls = [
      ...text.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g),
      ...text.matchAll(/url\(\s*["']?([^'"\s)]+)["']?\s*\)/g),
      ...text.matchAll(/@import\s+["']([^"']+)["']/g),
    ].map((match) => match[1])
    for (const url of urls) {
      if (/^(?:[a-z][\w+.-]*:|\/|#)/i.test(url)) continue
      const path = decodeURIComponent(url.split(/[?#]/, 1)[0])
      if (path === '' || path.startsWith('#') || path.startsWith('data:')) continue
      const target = relative(vendor, resolve(vendor, dirname(file), path)).split(sep).join('/')
      if (target === '..' || target.startsWith('../')) throw new Error(`Reference escapes archive: ${file}`)
      pending.push(target)
    }
  }
  return [...files].sort()
}

export function publicSpecimenAssets(): Plugin {
  let root = ''
  let files: string[] = []
  return {
    name: 'clear-public-reference-assets',
    configResolved(config) {
      root = config.root
      files = publicSpecimenFiles(root)
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split(/[?#]/, 1)[0]
        if (!path.startsWith(PUBLIC_SPECIMEN_BASE)) return next()
        let file: string
        try { file = decodeURIComponent(path.slice(PUBLIC_SPECIMEN_BASE.length)) }
        catch { res.statusCode = 400; res.end(); return }
        if (!files.includes(file)) { res.statusCode = 404; res.end(); return }
        res.setHeader('Content-Type', TYPES[extname(file)])
        res.setHeader('Cache-Control', 'no-cache')
        res.end(readFileSync(resolve(root, VENDOR_DIR, file)))
      })
    },
    generateBundle() {
      for (const file of files) {
        this.emitFile({
          type: 'asset',
          fileName: PUBLIC_SPECIMEN_BASE.slice(1) + file,
          source: readFileSync(resolve(root, VENDOR_DIR, file)),
        })
      }
    },
  }
}
