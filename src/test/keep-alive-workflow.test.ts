import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// ENV-05. The keep-alive lives in a file GitHub reads, not in the bundle, so —
// as ENV-03 does for vercel.json and DATA-01a does for the catalog migration —
// the assertions are made against the shipped artefact itself.
//
// What this can and cannot prove. Only a scheduled run against the real project
// proves the project stays awake; these tests prove the workflow says what
// ENV-05 requires it to say: twice weekly plus manual dispatch, a read and only
// a read, the anon key and only the anon key, nowhere a log could keep it, and
// a red run that explains itself.
const repoRoot = resolve(import.meta.dirname, '../..')

const read = (relativePath: string) =>
  readFileSync(resolve(repoRoot, relativePath), 'utf-8')

const workflow = read('.github/workflows/keep-alive.yml')
const readme = read('README.md')

/**
 * The workflow with comments removed. Most of this file is prose explaining
 * decisions, and a comment that says "DELETE THIS FILE" or names the
 * service-role key in order to rule it out must not read as doing either. YAML
 * comments and the shell comments inside `run:` blocks share the same marker.
 */
const directives = workflow
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('#'))
  .join('\n')

/**
 * The body of every `run: |` block — the part that becomes a shell script on a
 * runner, where a secret would be visible in the process listing and an
 * interpolated expression would be baked into the script text.
 */
function runScripts(source: string): string[] {
  const lines = source.split('\n')
  const scripts: string[] = []

  lines.forEach((line, index) => {
    const opener = /^(\s*)run: \|\s*$/.exec(line)
    if (!opener) return

    const openerIndent = opener[1].length
    const body: string[] = []

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor]
      const indent = candidate.length - candidate.trimStart().length

      // A blank line belongs to the block; anything at or left of the `run:`
      // key has closed it.
      if (candidate.trim() !== '' && indent <= openerIndent) break
      body.push(candidate)
    }

    scripts.push(body.join('\n'))
  })

  return scripts
}

const scripts = runScripts(workflow)

/** Every `cron:` expression the workflow schedules itself with. */
const crons = [...directives.matchAll(/^\s*-\s*cron:\s*'([^']+)'\s*$/gm)].map(
  (match) => match[1],
)

describe('Supabase keep-alive workflow (ENV-05)', () => {
  it('is a workflow GitHub will pick up', () => {
    expect(directives).toMatch(/^name:\s*\S/m)
    expect(directives).toMatch(/^on:$/m)
    // Tabs are not YAML. A file GitHub cannot parse never runs at all, and it
    // reports that on the Actions tab rather than in a pull request.
    expect(workflow).not.toContain('\t')
  })

  it('runs on a schedule and on manual dispatch', () => {
    expect(crons).toHaveLength(1)
    expect(directives).toMatch(/^\s*workflow_dispatch:\s*$/m)
  })

  it('pings twice a week, never more than four days apart', () => {
    const [minute, hour, dayOfMonth, month, dayOfWeek] = crons[0].split(/\s+/)

    // One ping per scheduled day, every day-of-month, every month.
    expect(minute).toMatch(/^\d{1,2}$/)
    expect(hour).toMatch(/^\d{1,2}$/)
    expect(dayOfMonth).toBe('*')
    expect(month).toBe('*')

    const days = dayOfWeek
      .split(',')
      .map(Number)
      .sort((left, right) => left - right)

    expect(days).toHaveLength(2)
    expect(days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6))
      .toBe(true)

    // The free plan pauses after seven days. The gap that matters is the one
    // that wraps the weekend, so measure both, and leave enough headroom that
    // a single dropped run is survivable.
    const gaps = [days[1] - days[0], days[0] + 7 - days[1]]
    expect(Math.max(...gaps)).toBeLessThanOrEqual(4)
  })

  it('authenticates the request with the project anon key', () => {
    expect(directives).toMatch(
      /^\s*SUPABASE_ANON_KEY:\s*\$\{\{\s*secrets\.SUPABASE_ANON_KEY\s*\}\}\s*$/m,
    )
    expect(directives).toMatch(
      /^\s*SUPABASE_URL:\s*\$\{\{\s*secrets\.SUPABASE_URL\s*\}\}\s*$/m,
    )

    const ping = scripts.join('\n')
    expect(ping).toMatch(/--header\s+"apikey: \$\{SUPABASE_ANON_KEY\}"/)
    expect(ping).toMatch(/\$\{SUPABASE_URL/)
  })

  it('never asks for a key that could write', () => {
    expect(directives).not.toMatch(/SERVICE_ROLE/)
    expect(directives).not.toMatch(/SUPABASE_DB_URL|ANTHROPIC/)
  })

  it('reads, and has no way to do anything else', () => {
    for (const method of [...directives.matchAll(/--request\s+(\S+)/g)]) {
      expect(method[1]).toBe('GET')
    }

    // The short forms and every body-carrying flag, so "it only ever sends a
    // GET" is a property of the file rather than of one line in it.
    expect(directives).not.toMatch(/(^|\s)-X(\s|$)/)
    expect(directives).not.toMatch(/(^|\s)(--data|--data-raw|-d|--form|-F|--upload-file|-T)(\s|$)/)
  })

  it('never puts the key anywhere a log could keep it', () => {
    for (const script of scripts) {
      // An expression interpolated into a `run:` block is substituted into the
      // script text itself. Secrets reach this job as environment variables,
      // and only as environment variables.
      expect(script).not.toContain('${{')
      // `set -x` would echo the curl invocation, headers included.
      expect(script).not.toMatch(/set\s+-[a-z]*x/)
      // Naming the secret in a diagnostic is fine; expanding it is not.
      expect(script).not.toMatch(/echo[^\n]*\$\{?SUPABASE_ANON_KEY/)
    }

    // The response body is discarded; only the status code is printed.
    const ping = scripts.join('\n')
    expect(ping).toMatch(/--output\s+\/dev\/null/)
    expect(ping).toMatch(/--write-out\s+'%\{http_code\}'/)
  })

  it('asks GitHub for nothing beyond read access', () => {
    expect(directives).toMatch(/^permissions:\n\s+contents:\s*read\s*$/m)
    // Indented lines only — `\s` would swallow the blank line that ends the
    // block and with it the rest of the file.
    const permissions = /^permissions:\n((?:[ \t]+.*\n)+)/m.exec(directives)
    expect(permissions?.[1]).not.toMatch(/write/)
  })

  it('goes red when the project does not answer', () => {
    const ping = scripts[0]

    expect(ping).toMatch(/http_status/)
    expect(ping).toMatch(/"200"/)
    expect(ping).toMatch(/exit 1/)
    // A missing secret is a configuration failure, not a silent pass.
    expect(ping).toMatch(/SUPABASE_URL:-/)
  })

  it('says what broke, in the place the failure notification links to', () => {
    expect(directives).toMatch(/^\s*if:\s*always\(\)\s*$/m)
    expect(directives).toMatch(/GITHUB_STEP_SUMMARY/)
    expect(directives).toMatch(/::error title=/)
    // The two things a reader needs: that the project may be paused, and that
    // the workflow is disposable once the plan changes.
    expect(directives).toMatch(/paused/i)
    expect(directives).toMatch(/paid plan/i)
  })
})

describe('keep-alive documentation (ENV-05)', () => {
  it('tells the reader the action exists and what it does', () => {
    expect(readme).toMatch(/keep-alive\.yml/)
    expect(readme).toMatch(/pause/i)
  })

  it('tells the reader when to remove it', () => {
    expect(readme).toMatch(/paid plan/i)
    expect(readme).toMatch(/delete/i)
  })
})
