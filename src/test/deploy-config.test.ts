import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import viteConfig from '../../vite.config'

// ENV-03: the deploy contract lives in files Vercel reads, outside the bundle,
// so assert on the shipped files themselves the way CORE-05 does for
// index.html. Previews and production come from Vercel's Git integration; what
// this repository owns is the build contract, the SPA rewrite, and the list of
// variables a deploy needs.
const repoRoot = resolve(import.meta.dirname, '../..')

const readRepoFile = (relativePath: string) =>
  readFileSync(resolve(repoRoot, relativePath), 'utf-8')

type VercelConfig = {
  framework?: string
  buildCommand?: string
  installCommand?: string
  outputDirectory?: string
  github?: { enabled?: boolean }
  rewrites?: { source: string; destination: string }[]
}

const vercel = JSON.parse(readRepoFile('vercel.json')) as VercelConfig
const envExample = readRepoFile('.env.example')
const gitignore = readRepoFile('.gitignore')

/**
 * Vercel compiles a rewrite `source` with path-to-regexp; a bare capture group
 * is the catch-all form. Compiling it here is what turns "deep links survive a
 * refresh" into something a test can answer rather than a claim about the
 * hosting dashboard.
 */
const matchesSource = (source: string, path: string) =>
  new RegExp(`^${source}$`).test(path)

/** Every `VITE_`-prefixed name app-owned source actually reads. */
function referencedViteVars(): Set<string> {
  const found = new Set<string>()

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      // The design system is vendored byte-identical and declares no app
      // environment of its own.
      if (entry.name === 'design-system' || entry.name === 'node_modules') {
        continue
      }

      const full = resolve(dir, entry.name)

      if (entry.isDirectory()) {
        walk(full)
        continue
      }

      if (!/\.(ts|tsx)$/.test(entry.name)) continue
      // This file names the variables in order to check them; reading itself
      // back would make the assertion circular.
      if (full === resolve(repoRoot, 'src/test/deploy-config.test.ts')) continue

      for (const match of readFileSync(full, 'utf-8').matchAll(
        /import\.meta\.env\.(VITE_[A-Z0-9_]+)/g,
      )) {
        found.add(match[1])
      }
    }
  }

  walk(resolve(repoRoot, 'src'))
  return found
}

describe('deploy configuration (ENV-03)', () => {
  it('builds with the same command the repository validates with', () => {
    expect(vercel.framework).toBe('vite')
    expect(vercel.buildCommand).toBe('npm run build')
    // A lockfile-exact install, so a preview cannot resolve a dependency the
    // pull request did not pin.
    expect(vercel.installCommand).toBe('npm ci')
  })

  it('publishes the directory Vite actually writes', () => {
    expect(vercel.outputDirectory).toBe(viteConfig.build?.outDir ?? 'dist')
  })

  it('leaves the Git integration on, which is what deploys main and every PR', () => {
    expect(vercel.github?.enabled).toBe(true)
  })

  describe('SPA rewrite', () => {
    it('declares exactly one catch-all falling through to index.html', () => {
      expect(vercel.rewrites).toHaveLength(1)
      expect(vercel.rewrites?.[0].destination).toBe('/index.html')
    })

    it.each([
      '/',
      '/history',
      '/history/2026-09-21',
      '/workout/1f0b1f7e-0000-4000-8000-000000000000',
      '/settings/locations',
      '/a/deeply/nested/route',
    ])('serves the app shell for %s', (path) => {
      const source = vercel.rewrites?.[0].source

      expect(source).toBeDefined()
      expect(matchesSource(source!, path)).toBe(true)
    })
  })
})

describe('environment contract (ENV-03)', () => {
  it('stays committed while every other .env file stays ignored', () => {
    expect(gitignore).toMatch(/^\.env\.\*$/m)
    expect(gitignore).toMatch(/^!\.env\.example$/m)
  })

  it('documents the browser-safe Supabase variables a deploy needs', () => {
    expect(envExample).toMatch(/^VITE_SUPABASE_URL=/m)
    expect(envExample).toMatch(/^VITE_SUPABASE_ANON_KEY=/m)
  })

  it('documents every VITE_ variable app-owned source reads', () => {
    for (const name of referencedViteVars()) {
      expect(envExample).toMatch(new RegExp(`^${name}=`, 'm'))
    }
  })

  it('assigns only placeholders — a real value here would be a leak', () => {
    const values = [...envExample.matchAll(/^[A-Z0-9_]+=(.*)$/gm)].map(
      (match) => match[1],
    )

    expect(values.length).toBeGreaterThan(0)
    for (const value of values) {
      // A Supabase anon key is a JWT; a real project URL is not `your-`.
      expect(value).not.toMatch(/eyJ[A-Za-z0-9_-]/)
      expect(value).toMatch(/your-/)
    }
  })

  it('never names a server-side secret as a browser variable', () => {
    expect(envExample).not.toMatch(/^VITE_[A-Z0-9_]*(SERVICE_ROLE|ANTHROPIC)/m)
  })
})
