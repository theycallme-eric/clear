/**
 * ENV-04 — the dev preflight.
 *
 * The thing under test is a *message*, so these tests read the message. A
 * preflight that detected every failure and printed a stack trace would pass a
 * test that only checked its exit code, and would still be the defect (D4) the
 * requirement exists to kill.
 *
 * Nothing here opens a connection: `pingSupabase` takes its `fetch`, so the
 * paused-project path is exercised by handing it the failure a paused project
 * produces. The env cases run against temporary directories rather than the
 * repository's own (git-ignored, possibly filled-in) `.env`.
 */
import { spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  checkEnvironment,
  contractVariables,
  parseEnvFile,
} from '../../scripts/dev-preflight/env.mjs'
import { dashboardUrl } from '../../scripts/dev-preflight/messages.mjs'
import { pingSupabase } from '../../scripts/dev-preflight/ping.mjs'
import { preflight } from '../../scripts/dev-preflight/preflight.mjs'

const repoRoot = resolve(import.meta.dirname, '../..')
const readRepoFile = (relativePath: string) =>
  readFileSync(resolve(repoRoot, relativePath), 'utf-8')

const REAL_URL = 'https://abcdefghijklmnop.supabase.co'
const REAL_KEY = 'a-real-looking-anon-key'

const temporaryRoots: string[] = []

/**
 * A repository root with only the files the preflight reads: the real
 * `.env.example` (it is the contract, and a copy would drift) plus whatever
 * env files the case wants.
 */
function scratchRoot(files: Record<string, string> = {}): string {
  const root = mkdtempSync(resolve(tmpdir(), 'clear-preflight-'))
  temporaryRoots.push(root)
  writeFileSync(resolve(root, '.env.example'), readRepoFile('.env.example'))
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(resolve(root, name), contents)
  }
  return root
}

/** Run the preflight with its output captured rather than printed. */
async function run(options: Parameters<typeof preflight>[0]) {
  let output = ''
  const code = await preflight({
    ...options,
    write: (text: string) => {
      output += text
    },
  })
  return { code, output }
}

/** The `fetch` a paused project produces: the request never gets an answer. */
const unreachableFetch = () => {
  const error = new TypeError('fetch failed')
  error.cause = new Error('getaddrinfo ENOTFOUND abcdefghijklmnop.supabase.co')
  return Promise.reject(error)
}

const respondWith = (status: number) => () =>
  Promise.resolve(new Response(null, { status }))

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('the environment contract it checks against', () => {
  it('is .env.example itself, not a second list', () => {
    // If this file ever grows a third variable, the preflight requires it
    // without anyone editing the preflight. That is the point.
    const names = contractVariables(repoRoot).map((v) => v.name)
    expect(names).toEqual(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'])
  })

  it("carries each variable's placeholder and its documented description", () => {
    const [url] = contractVariables(repoRoot)
    expect(url.placeholder).toBe('https://your-project-ref.supabase.co')
    expect(url.description).toMatch(/Supabase project URL/)
  })

  it('reads the values Vite would read', () => {
    const root = scratchRoot({
      '.env': `# a comment\nVITE_SUPABASE_URL=${REAL_URL}\n`,
      '.env.local': `export VITE_SUPABASE_ANON_KEY="${REAL_KEY}"\n`,
    })
    const { values, files } = checkEnvironment({ root, processEnv: {} })

    expect(files).toEqual(['.env', '.env.local'])
    expect(values.VITE_SUPABASE_URL).toBe(REAL_URL)
    expect(values.VITE_SUPABASE_ANON_KEY).toBe(REAL_KEY)
  })

  it('lets the real process environment win, as Vite does', () => {
    const root = scratchRoot({ '.env': `VITE_SUPABASE_URL=${REAL_URL}\n` })
    const { values } = checkEnvironment({
      root,
      processEnv: { VITE_SUPABASE_URL: 'https://from-the-shell.supabase.co' },
    })

    expect(values.VITE_SUPABASE_URL).toBe('https://from-the-shell.supabase.co')
  })

  it('ignores lines a .env file does not define', () => {
    expect(parseEnvFile('\n# comment\nnot an assignment\nA=1\n')).toEqual({ A: '1' })
  })
})

describe('a missing variable', () => {
  it('is named, and the message says where the value comes from', async () => {
    const root = scratchRoot({ '.env': `VITE_SUPABASE_URL=${REAL_URL}\n` })
    const { code, output } = await run({ root, processEnv: {}, fetch: unreachableFetch })

    expect(code).toBe(1)
    expect(output).toContain('VITE_SUPABASE_ANON_KEY is not set.')
    expect(output).toContain('Project Settings → API')
    // Named, so the other variable — which is fine — is not implicated.
    expect(output).not.toContain('VITE_SUPABASE_URL is not set')
  })

  it('does not reach Supabase, because there is nothing to reach it with', async () => {
    const root = scratchRoot()
    let called = false
    const { code } = await run({
      root,
      processEnv: {},
      fetch: () => {
        called = true
        return Promise.resolve(new Response(null, { status: 200 }))
      },
    })

    expect(code).toBe(1)
    expect(called).toBe(false)
  })

  it('tells a fresh clone the one command that creates the file', async () => {
    const root = scratchRoot()
    const { output } = await run({ root, processEnv: {}, fetch: unreachableFetch })

    expect(output).toContain('cp .env.example .env')
  })

  it('points at the file to edit when one already exists', async () => {
    const root = scratchRoot({ '.env': `VITE_SUPABASE_URL=${REAL_URL}\n` })
    const { output } = await run({ root, processEnv: {}, fetch: unreachableFetch })

    expect(output).toContain('Edit .env.')
    expect(output).not.toContain('cp .env.example .env')
  })

  it('counts a copied-but-unfilled placeholder as missing, and says so', async () => {
    const root = scratchRoot({ '.env': readRepoFile('.env.example') })
    const { code, output } = await run({ root, processEnv: {}, fetch: unreachableFetch })

    expect(code).toBe(1)
    expect(output).toContain(
      'VITE_SUPABASE_URL still holds the placeholder from .env.example',
    )
    expect(output).toContain('your-project-ref.supabase.co')
  })

  it('counts an empty value as missing', async () => {
    const root = scratchRoot({
      '.env': `VITE_SUPABASE_URL=${REAL_URL}\nVITE_SUPABASE_ANON_KEY=\n`,
    })
    const { code, output } = await run({ root, processEnv: {}, fetch: unreachableFetch })

    expect(code).toBe(1)
    expect(output).toContain('VITE_SUPABASE_ANON_KEY is not set.')
  })
})

describe('an unreachable project', () => {
  it('prints the resume link and exits, with no stack trace', async () => {
    const root = scratchRoot({ '.env': envFile() })
    const { code, output } = await run({ root, processEnv: {}, fetch: unreachableFetch })

    expect(code).toBe(1)
    expect(output).toContain(
      'project paused or unreachable — resume at https://supabase.com/dashboard/project/abcdefghijklmnop',
    )
    expect(output).not.toMatch(/\bat\s+\S+:\d+:\d+/)
    expect(output).not.toContain('TypeError')
  })

  it('says what it tried, in the words the failure used', async () => {
    const root = scratchRoot({ '.env': envFile() })
    const { output } = await run({ root, processEnv: {}, fetch: unreachableFetch })

    expect(output).toContain('getaddrinfo ENOTFOUND')
  })

  it("treats a paused project's HTTP 540 as unreachable", async () => {
    const root = scratchRoot({ '.env': envFile() })
    const { code, output } = await run({
      root,
      processEnv: {},
      fetch: respondWith(540),
    })

    expect(code).toBe(1)
    expect(output).toContain('project paused or unreachable — resume at')
  })

  it('explains the wait rather than reporting a timeout as a crash', async () => {
    const root = scratchRoot({ '.env': envFile() })
    const { code, output } = await run({
      root,
      processEnv: {},
      timeoutMs: 20,
      fetch: (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject((init.signal as AbortSignal).reason),
          )
        }),
    })

    expect(code).toBe(1)
    expect(output).toContain('project paused or unreachable — resume at')
    // The wait it actually waited, not a rounded-to-zero "0s".
    expect(output).toContain('no answer within 20ms')
  })
})

describe('a rejected key', () => {
  it('is a different sentence from a paused project', async () => {
    const root = scratchRoot({ '.env': envFile() })
    const { code, output } = await run({
      root,
      processEnv: {},
      fetch: respondWith(401),
    })

    expect(code).toBe(1)
    expect(output).toContain('rejected VITE_SUPABASE_ANON_KEY')
    expect(output).toContain('anon/public key — never the service-role key')
    expect(output).not.toContain('project paused or unreachable')
  })
})

describe('a healthy project', () => {
  it('reports ready and exits 0, so Vite starts', async () => {
    const root = scratchRoot({ '.env': envFile() })
    const { code, output } = await run({
      root,
      processEnv: {},
      fetch: respondWith(200),
    })

    expect(code).toBe(0)
    expect(output).toContain('Supabase reachable')
  })

  it('asks PostgREST for a pulse, authenticated, and reads no table', async () => {
    let seen: { url: string; headers: Headers } | undefined
    await pingSupabase({
      url: REAL_URL,
      anonKey: REAL_KEY,
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        seen = { url: String(input), headers: new Headers(init?.headers) }
        return Promise.resolve(new Response(null, { status: 200 }))
      },
    })

    expect(seen?.url).toBe(`${REAL_URL}/rest/v1/`)
    expect(seen?.headers.get('apikey')).toBe(REAL_KEY)
    expect(seen?.headers.get('authorization')).toBe(`Bearer ${REAL_KEY}`)
  })
})

describe('the dashboard link', () => {
  it('resolves to the project that is actually asleep', () => {
    expect(dashboardUrl('https://xyzxyzxyzxyzxyz.supabase.co')).toBe(
      'https://supabase.com/dashboard/project/xyzxyzxyzxyzxyz',
    )
  })

  it('falls back to the project list for a URL it cannot read', () => {
    expect(dashboardUrl('https://db.example.test')).toBe(
      'https://supabase.com/dashboard',
    )
  })
})

describe('the command npm run dev actually runs', () => {
  // Everything above tests the exported function. This runs the file, the way
  // the `dev` script does, because the promise is about what a developer sees
  // in a terminal — including the exit code that stops Vite from starting.
  it('exits non-zero and explains itself, with nothing on stderr', () => {
    const result = spawnSync(
      process.execPath,
      [resolve(repoRoot, 'scripts/dev-preflight/preflight.mjs')],
      {
        // `.invalid` never resolves (RFC 2606), so this is the unreachable
        // path without depending on a network or on a real project's state.
        env: {
          PATH: process.env.PATH ?? '',
          VITE_SUPABASE_URL: 'https://clear-preflight-test.invalid',
          VITE_SUPABASE_ANON_KEY: 'not-a-real-key',
        },
        encoding: 'utf-8',
      },
    )

    expect(result.status).toBe(1)
    expect(result.stdout).toContain('project paused or unreachable — resume at')
    // A stack trace is the failure this whole file exists to prevent.
    expect(result.stderr).toBe('')
    expect(result.stdout).not.toMatch(/\bat\s+\S+:\d+:\d+/)
  }, 20_000)
})

describe('the one-command flow', () => {
  it('is what npm run dev does: preflight, then Vite', () => {
    const scripts = (
      JSON.parse(readRepoFile('package.json')) as { scripts: Record<string, string> }
    ).scripts

    expect(scripts.dev).toBe(
      'node scripts/dev-preflight/preflight.mjs && vite',
    )
  })

  it('never mentions Docker — development runs against the hosted project', () => {
    // The D4 promise, checked where it is claimed rather than remembered: the
    // scripts a developer runs and the docs that tell them how to start.
    const setupDocs = ['README.md', 'DEVELOPMENT.md', '.env.example', 'package.json']
    for (const file of [...setupDocs, ...scriptFiles()]) {
      expect(readRepoFile(file).toLowerCase(), `${file} mentions docker`).not.toContain(
        'docker',
      )
    }
  })

  it('documents the paused-project recovery where a developer will look', () => {
    const development = readRepoFile('DEVELOPMENT.md')

    expect(development).toContain('cp .env.example .env')
    expect(development).toContain('npm run dev')
    expect(development).toMatch(/paused/i)
    expect(development).toContain('supabase.com/dashboard')
  })
})

/** Every file under `scripts/`, which the "no docker" promise covers. */
function scriptFiles(): string[] {
  const found: string[] = []

  const walk = (relative: string) => {
    for (const entry of readdirSync(resolve(repoRoot, relative), {
      withFileTypes: true,
    })) {
      const child = `${relative}/${entry.name}`
      if (entry.isDirectory()) walk(child)
      else found.push(child)
    }
  }

  walk('scripts')
  return found
}

/** A `.env` whose values pass the contract check. */
function envFile(): string {
  return `VITE_SUPABASE_URL=${REAL_URL}\nVITE_SUPABASE_ANON_KEY=${REAL_KEY}\n`
}
