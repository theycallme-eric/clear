import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import playwrightConfig, {
  MOBILE_VIEWPORT,
  vercelProtectionHeaders,
} from '../../playwright.config'

/**
 * ENV-07 — the harness's own acceptance criteria, asserted on the files that
 * carry them.
 *
 * The E2E suite cannot prove these about itself: a suite that is misconfigured
 * to run only on desktop still passes, and a suite nobody can run in CI passes
 * loudest of all. So the shape of the harness is checked here, in the unit
 * suite that runs on every pull request with no credentials at all, exactly
 * the way ENV-03's deploy contract is checked.
 */

const repoRoot = resolve(import.meta.dirname, '../..')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf-8')

const packageJson = JSON.parse(read('package.json')) as {
  scripts: Record<string, string>
  devDependencies: Record<string, string>
}

const projects = playwrightConfig.projects ?? []

describe('the default Playwright project is a phone (ENV-07)', () => {
  it('lists mobile first, so a bare `playwright test` runs it', () => {
    expect(projects[0]?.name).toBe('mobile')
  })

  it('is 390×844 with touch and a coarse pointer', () => {
    const mobile = projects[0]?.use

    expect(MOBILE_VIEWPORT).toEqual({ width: 390, height: 844 })
    expect(mobile?.viewport).toEqual(MOBILE_VIEWPORT)
    expect(mobile?.hasTouch).toBe(true)
    // Chromium derives `(pointer: coarse)` and `(hover: none)` from this pair;
    // `e2e/viewport.spec.ts` asserts the media queries themselves in a browser.
    expect(mobile?.isMobile).toBe(true)
  })

  it('keeps desktop as additional coverage rather than the baseline', () => {
    const names = projects.map((project) => project.name)

    expect(names).toContain('desktop')
    expect(names.indexOf('desktop')).toBeGreaterThan(names.indexOf('mobile'))
  })
})

describe('a failure keeps a trace and a screenshot (ENV-07)', () => {
  it('retains both, and only for the run that failed', () => {
    expect(playwrightConfig.use?.trace).toBe('retain-on-failure')
    expect(playwrightConfig.use?.screenshot).toBe('only-on-failure')
  })

  it('writes them somewhere git ignores', () => {
    const gitignore = read('.gitignore')

    expect(playwrightConfig.outputDir).toBe('./test-results')
    expect(gitignore).toMatch(/^test-results\/$/m)
    expect(gitignore).toMatch(/^playwright-report\/$/m)
  })
})

describe('the suite runs locally and in CI (ENV-07)', () => {
  const workflow = read('.github/workflows/e2e.yml')

  it('claims only `e2e/*.spec.ts`, leaving `src/**/*.test.ts` to Vitest', () => {
    expect(playwrightConfig.testDir).toBe('./e2e')
    expect(String(playwrightConfig.testMatch)).toContain('spec')
    expect(String(playwrightConfig.testMatch)).not.toContain('test')
  })

  it('starts the dev server locally, and starts nothing when given a URL', () => {
    // This process has no `E2E_BASE_URL`, which is the local case.
    expect(playwrightConfig.webServer).toBeDefined()
    expect(packageJson.scripts['e2e:server']).toContain('vite')
    expect(packageJson.scripts.e2e).toBe('playwright test')
  })

  it('runs in CI against the preview deployment, not a server it built', () => {
    expect(workflow).toContain('deployment_status')
    expect(workflow).toContain(
      'E2E_BASE_URL: ${{ github.event.deployment_status.environment_url }}',
    )
    expect(workflow).toContain('npm run e2e')
    // Never production: this workflow seeds and deletes users.
    expect(workflow).toContain("github.event.deployment.environment == 'Preview'")
  })

  it('never exposes privileged backend credentials to preview code', () => {
    const previewJob = workflow.slice(
      workflow.indexOf('  preview-e2e:'),
      workflow.indexOf('  backend-e2e:'),
    )

    expect(previewJob).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(previewJob).not.toContain('npm run e2e:reset')
    expect(previewJob).toContain(
      'VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}',
    )
    expect(previewJob).toContain('npm run e2e')
  })

  it('uses the documented Vercel headers only when a bypass is supplied', () => {
    expect(vercelProtectionHeaders(undefined)).toBeUndefined()
    expect(vercelProtectionHeaders('test-only-value')).toEqual({
      'x-vercel-protection-bypass': 'test-only-value',
      'x-vercel-set-bypass-cookie': 'true',
    })
  })

  it('is a workflow GitHub will pick up at all', () => {
    // A file GitHub cannot parse never runs, and it says so on the Actions tab
    // rather than in the pull request that broke it.
    expect(workflow).not.toContain('\t')
    const jobs = workflow.slice(workflow.indexOf('\njobs:'))

    expect(
      [...jobs.matchAll(/^ {2}([a-z][a-z0-9-]*):$/gm)].map((match) => match[1]),
    ).toEqual(['rls-standing', 'preview-e2e', 'backend-e2e'])
  })

  it('re-proves row-level security on every pull request (REQ-007)', () => {
    const rlsJob = workflow.slice(
      workflow.indexOf('  rls-standing:'),
      workflow.indexOf('  preview-e2e:'),
    )

    expect(workflow).toContain('pull_request:')
    expect(rlsJob).toContain("github.event_name == 'pull_request'")
    expect(rlsJob).toContain('npx playwright test e2e/rls.spec.ts')
    expect(rlsJob).toContain(
      'SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}',
    )
    // A fork receives no secret, so the job must skip rather than fail.
    expect(rlsJob).toContain(
      'github.event.pull_request.head.repo.full_name == github.repository',
    )
    // And it waits for the reused project to actually hold this schema —
    // TASK-072's gate. Unset is skipped, which is the safe default.
    expect(rlsJob).toContain("vars.E2E_LIVE_SCHEMA_READY == 'true'")
  })

  it('gives each pull request its own namespace, and clears it after', () => {
    const rlsJob = workflow.slice(
      workflow.indexOf('  rls-standing:'),
      workflow.indexOf('  preview-e2e:'),
    )

    expect(rlsJob).toContain(
      'E2E_NAMESPACE: pr-${{ github.event.pull_request.number }}',
    )
    // Before, with the sweep of namespaces nobody will address again; and
    // after, whatever the outcome.
    expect(rlsJob).toContain('npm run e2e:reset -- --stale')
    expect(rlsJob).toMatch(/if: always\(\)\n\s+run: npm run e2e:reset/)
  })

  it('runs privileged OTP and RLS checks only from trusted main', () => {
    const backendJob = workflow.slice(workflow.indexOf('  backend-e2e:'))

    expect(backendJob).toContain("github.event_name == 'push'")
    expect(backendJob).toContain("github.ref == 'refs/heads/main'")
    expect(backendJob).toContain('SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}')
    expect(backendJob).not.toContain('VERCEL_AUTOMATION_BYPASS_SECRET')
    expect(backendJob).toContain('e2e/auth-otp.spec.ts e2e/rls.spec.ts')
    expect(backendJob.match(/npm run e2e:reset/g)).toHaveLength(2)
  })

  it('uploads the trace and screenshot when it fails', () => {
    expect(workflow).toContain('upload-artifact')
    expect(workflow).toContain('test-results/')
  })

  it('has one command each for seed and reset', () => {
    expect(packageJson.scripts['e2e:seed']).toBe('node scripts/e2e/seed.mjs')
    expect(packageJson.scripts['e2e:reset']).toBe('node scripts/e2e/reset.mjs')
  })

  it('pins the runner and the accessibility engine as dev dependencies', () => {
    expect(packageJson.devDependencies['@playwright/test']).toBeDefined()
    expect(packageJson.devDependencies['@axe-core/playwright']).toBeDefined()
  })
})

describe('no test-only branches in src/ (ENV-07)', () => {
  /** Every app-owned source file, excluding the vendored design system. */
  function appSources(): string[] {
    const found: string[] = []

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'design-system') continue

        const full = resolve(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full)
        } else if (
          /\.(ts|tsx)$/.test(entry.name) &&
          !/\.test\.(ts|tsx)$/.test(entry.name)
        ) {
          found.push(full)
        }
      }
    }

    walk(resolve(repoRoot, 'src'))
    return found
  }

  it('never imports the harness or its service-role client from the bundle', () => {
    const offenders = appSources().filter((file) => {
      const source = readFileSync(file, 'utf-8')
      return /from\s+'[^']*(?:\/e2e\/|playwright)/.test(source)
    })

    expect(offenders).toEqual([])
  })

  it('never reads a service-role key from app-owned source', () => {
    const offenders = appSources().filter((file) =>
      /SERVICE_ROLE/.test(readFileSync(file, 'utf-8')),
    )

    expect(offenders).toEqual([])
  })
})

describe('axe-core runs against every screen the suite visits (CORE-05)', () => {
  const e2eDir = resolve(repoRoot, 'e2e')
  const specs = readdirSync(e2eDir).filter((name) => name.endsWith('.spec.ts'))

  it('has specs to check', () => {
    expect(specs.length).toBeGreaterThan(0)
  })

  it('routes every navigation through the scanning fixture', () => {
    // `visit` navigates *and* scans, so the only way to reach a screen without
    // an axe run is to call `page.goto` directly. No spec may.
    const offenders = specs.filter((name) =>
      readFileSync(resolve(e2eDir, name), 'utf-8').includes('page.goto('),
    )

    expect(offenders).toEqual([])
  })

  it('keeps the scan inside the fixture, where a spec cannot skip it', () => {
    const fixtures = read('e2e/fixtures.ts')

    expect(fixtures).toContain("from '@axe-core/playwright'")
    expect(fixtures).toContain('await page.goto(path)')
    expect(fixtures).toContain('await checkA11y()')
  })

  it('fails the run on a violation rather than reporting it', () => {
    const fixtures = read('e2e/fixtures.ts')

    // The attachment is for diagnosis; the assertion is what fails the build.
    expect(fixtures).toContain('results.violations')
    expect(fixtures).toMatch(/expect\([\s\S]*violations[\s\S]*\)\s*\.toEqual\(\[\]\)/)
  })

  /**
   * The fixture guarantees that every *visited* screen is scanned. Nothing in
   * the E2E suite can guarantee that every screen is visited — that is a fact
   * about the route table, so it is checked here, against the route table.
   */
  it('visits every screen the router can render', () => {
    const router = read('src/app/router.tsx')
    const routes = [...router.matchAll(/path:\s*'([^']+)'/g)]
      .map((match) => match[1])
      // DS-07's gallery is development-only and is not a product screen.
      .filter((path) => !path.startsWith('dev/'))

    const screens = read('e2e/screens.ts')
    const covered = [...screens.matchAll(/route:\s*'([^']+)'/g)].map(
      (match) => match[1],
    )

    expect(routes.length).toBeGreaterThan(0)
    expect([...covered].sort()).toEqual([...routes].sort())
  })

  it('walks that list from the specs rather than restating it', () => {
    for (const spec of ['e2e/app-shell.spec.ts', 'e2e/reduced-motion.spec.ts']) {
      expect(read(spec)).toContain("from './screens'")
    }
  })
})
