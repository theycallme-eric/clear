import type { Locator, Page, Route } from '@playwright/test'

import type { WorkoutSessionRow } from '../src/state/schemas'
import { makeSessionRow } from '../src/test/factories'
import { fixtureLocation, onboardedProfile } from '../src/test/user-data-double'
import { installDeterministicCapture } from './design-0143/fixtures'
import { expect, test } from './fixtures'

/**
 * TASK-003 / JOURNEY-003 — real Home layout with synthetic, intercepted data.
 * This exercises the production routes and normal stored-session contract;
 * there is no app test bridge, model request, real account or forwarded write.
 * Both phone sizes also run against the ordinary public preview target.
 */
const OWNER = '00000000-0000-4000-8000-000000000003'
const PLACE = 'd0000001-0000-4000-8000-000000000000'
const FIRST_USE = 'Start your first workout. Choose a focus and the rest is filled in.'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
type Viewport = { width: number; height: number }

function daysAgo(days: number) {
  const now = new Date()
  now.setUTCDate(now.getUTCDate() - days)
  return now.toISOString().slice(0, 10)
}

function completed(index: number, daysBack: number, overrides: Partial<WorkoutSessionRow> = {}) {
  const date = daysAgo(daysBack)
  return makeSessionRow({
    id: `00000000-0000-4000-8000-00000000003${index}`,
    user_id: OWNER, location_id: PLACE, date,
    created_at: `${date}T09:00:00.000Z`, updated_at: `${date}T09:31:00.000Z`,
    started_at: `${date}T09:00:00.000Z`, completed_at: `${date}T09:31:00.000Z`,
    title: 'Synthetic upper-body strength Session', session_focus: 'upper_body',
    goal_preset: 'strength', requested_duration_mins: 37,
    actual_duration_mins: 31, requested_intensity: 6, effective_intensity: 6,
    ...overrides,
  })
}

function abandoned(index: number, daysBack: number, started: boolean, overrides: Partial<WorkoutSessionRow> = {}) {
  const date = daysAgo(daysBack)
  return completed(index, daysBack, {
    completed_at: null, abandoned_at: `${date}T09:12:00.000Z`,
    started_at: started ? `${date}T09:00:00.000Z` : null,
    actual_duration_mins: started ? 12 : null,
    counts_for_streak: false,
    ...overrides,
  })
}

const MIXED = [
  completed(1, 1),
  abandoned(2, 2, true, { title: 'Synthetic lower-body power session',
    session_focus: 'lower_body', requested_duration_mins: 29, effective_intensity: 5 }),
  abandoned(3, 3, false, { title: 'Synthetic full-body mobility Session',
    session_focus: 'full_body', requested_duration_mins: 18, effective_intensity: 4 }),
]
const ABANDONED = [
  abandoned(4, 10, true, { title: 'Synthetic unfinished strength Session',
    requested_duration_mins: 20 }),
  abandoned(5, 11, false, { title: 'Synthetic unstarted power session',
    requested_duration_mins: 20 }),
]

async function syntheticHome(page: Page, initial: readonly WorkoutSessionRow[]) {
  let rows = initial
  const originalTitles = new Map([...MIXED, ...ABANDONED].map((row) => [row.id, row.title]))
  const unexpected: string[] = []
  let attemptedWrites = 0
  let functionPosts = 0
  const guard = await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
  await page.route('**/*', async (route) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) return route.continue()
    attemptedWrites += 1
    unexpected.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`)
    return route.abort('blockedbyclient')
  })
  const handler = async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1) ?? ''
    const reply = (body: unknown, status = 200) => route.fulfill({ status, headers: CORS, json: body })
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (url.pathname.startsWith('/functions/v1/')) {
      if (request.method() === 'POST') functionPosts += 1
      unexpected.push(`${request.method()} ${url.pathname}`)
      return route.abort('blockedbyclient')
    }
    if (request.method() === 'GET') {
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'strength' })])
      if (name === 'locations') return reply([fixtureLocation({ id: PLACE, user_id: OWNER, tier: 'full' })])
      if (name === 'workout_sessions') return reply(rows)
      if (['rest_days', 'load_anchors', 'location_equipment', 'saved_workouts',
        'saved_workout_attempts', 'saved_workout_completions'].includes(name)) return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session') return reply(null)
      if (name === 'streak_sessions') return reply(rows
        .filter((row) => row.completed_at !== null)
        .map((row) => ({ session_id: row.id, completed_at: row.completed_at,
          counts_for_streak: row.counts_for_streak })))
      if (['constraints_in_force', 'anchor_evidence', 'conditioning_history'].includes(name)) return reply([])
    }
    if (request.method() !== 'GET') attemptedWrites += 1
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic Home-proof request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-home-preview-session', refreshToken: 'synthetic-home-preview-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-home@example.invalid' },
    }))
  }, { owner: OWNER })
  return {
    // Changes only the next intercepted read. A normal document reload must
    // still carry these rows through the production clients and selectors.
    showHistory(next: readonly WorkoutSessionRow[]) { rows = next },
    assertReadOnly() {
      expect(unexpected).toEqual([])
      expect(attemptedWrites).toBe(0)
      expect(functionPosts).toBe(0)
      expect(guard.blockedGenerations()).toBe(0)
      for (const row of [...MIXED, ...ABANDONED]) expect(row.title).toBe(originalTitles.get(row.id))
    },
  }
}

function card(page: Page, name: string) {
  return page.locator('.clr-card').filter({ has: page.getByRole('heading', { level: 2, name, exact: true }) })
}

function today(page: Page) {
  return page.getByRole('list', { name: 'This week', exact: true })
    .getByRole('listitem').filter({ hasText: /\(today\)/ })
}

async function visibleInOwner(target: Locator, owner: Locator, viewport: Viewport) {
  await target.scrollIntoViewIfNeeded()
  const targetBox = await target.boundingBox()
  const ownerBox = await owner.boundingBox()
  if (targetBox === null || ownerBox === null) throw new Error('Home proof target or scroll owner is missing')
  expect(targetBox.x).toBeGreaterThanOrEqual(0)
  expect(targetBox.x + targetBox.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(targetBox.y).toBeGreaterThanOrEqual(Math.max(0, ownerBox.y) - 1)
  expect(targetBox.y + targetBox.height).toBeLessThanOrEqual(Math.min(viewport.height, ownerBox.y + ownerBox.height) + 1)
  return targetBox
}

/** Expected date text from the supplied calendar day, independent of app formatters. */
function dateText(day: string) {
  const date = new Date(`${day}T12:00:00.000Z`)
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${weekdays[date.getUTCDay()]} ${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

async function inspectRecentRow(row: Locator, source: WorkoutSessionRow, status: string, label: string,
  viewport: Viewport, scroller: Locator) {
  const displayedTitle = source.title.replace(/\s+session\s*$/i, '')
  await expect(row).toHaveAttribute('data-status', status)
  const title = row.locator('[data-part="title"]')
  const statusDate = row.locator('[data-part="status-date"]')
  const statusWord = statusDate.locator('[data-part="status"]')
  const metrics = row.locator('[data-part="metrics"]')
  const link = row.getByRole('link', { name: displayedTitle, exact: true })
  await expect(title).toHaveText(displayedTitle)
  await expect(statusWord).toHaveText(label)
  await expect(statusDate.locator('[data-part="date"]')).toHaveText(dateText(source.date))
  await expect(link).toHaveAttribute('href', `/history/${source.id}`)
  await expect(row).not.toContainText(/\bsession\b/i)
  await expect(metrics).toContainText(`Requested ${source.requested_duration_mins} min`)
  await expect(metrics).toContainText(`Intensity ${source.effective_intensity}/10`)
  if (source.actual_duration_mins === null) await expect(metrics).not.toContainText('Actual')
  else await expect(metrics).toContainText(`Actual ${source.actual_duration_mins} min`)
  const rowBox = await visibleInOwner(row, scroller, viewport)
  // Adjacent rows deliberately draw their divider through the card padding.
  // Measure the undecorated content, keeping full row/owner bounds above.
  for (const content of [title, statusDate, metrics]) {
    const box = await content.boundingBox()
    if (box === null) throw new Error('Recent row content is missing')
    expect(box.x).toBeGreaterThanOrEqual(rowBox.x - 1)
    expect(box.x + box.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 1)
    expect(await content.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  }
  await link.focus()
  await expect(link).toBeFocused()
  await expect(link).toHaveCSS('text-decoration-line', 'none')
  await expect(link).toHaveCSS('border-bottom-width', '0px')
  const geometry = await row.evaluate((element) => {
    const part = (name: string) => {
      const found = element.querySelector<HTMLElement>(`[data-part="${name}"]`)
      if (!found) throw new Error(`Recent row lacks ${name}`)
      return found
    }
    const title = part('title')
    const statusDate = part('status-date')
    const status = part('status')
    const metrics = part('metrics')
    const rect = (element: Element) => {
      const box = element.getBoundingClientRect()
      return { top: box.top, bottom: box.bottom, left: box.left, right: box.right }
    }
    return {
      order: [...element.children].map((child) => child.getAttribute('data-part')),
      title: rect(title), statusDate: rect(statusDate), metrics: rect(metrics),
      titleSize: parseFloat(getComputedStyle(title).fontSize),
      metaSize: parseFloat(getComputedStyle(statusDate).fontSize),
      metricsSize: parseFloat(getComputedStyle(metrics).fontSize),
      statusColor: getComputedStyle(status).color,
      glyph: status.querySelector('svg')?.outerHTML ?? '',
      metricsColor: getComputedStyle(metrics).color,
      metaColor: getComputedStyle(statusDate).color,
      metricItems: [...metrics.children].map((item) => ({
        ...rect(item), whitespace: getComputedStyle(item).whiteSpace,
        fits: item.scrollWidth <= item.clientWidth,
      })),
    }
  })
  expect(geometry.order).toEqual(['title', 'status-date', 'metrics'])
  expect(geometry.statusDate.top).toBeGreaterThanOrEqual(geometry.title.bottom - 1)
  expect(geometry.metrics.top).toBeGreaterThanOrEqual(geometry.statusDate.bottom - 1)
  expect(geometry.metricsSize).toBeGreaterThanOrEqual(geometry.metaSize)
  expect(geometry.metricsColor).not.toBe(geometry.metaColor)
  expect(geometry.glyph).not.toBe('')
  for (const item of geometry.metricItems) {
    expect(item.whitespace).toBe('nowrap')
    expect(item.fits).toBe(true)
    expect(item.left).toBeGreaterThanOrEqual(geometry.metrics.left - 1)
    expect(item.right).toBeLessThanOrEqual(geometry.metrics.right + 1)
  }
  return geometry
}

test.use({ timezoneId: 'UTC' })

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`JOURNEY-003: Home recent rows retain readable hierarchy and explicit Generate at ${viewport.width}x${viewport.height}`, async ({ page, visit, checkA11y }, testInfo) => {
    test.setTimeout(120_000)
    testInfo.annotations.push({ type: 'proof-mode',
      description: 'Production Home and History/Generate routes with intercepted synthetic rows; no backend, model or installed-device proof.' })
    const fixture = await syntheticHome(page, MIXED)
    await page.setViewportSize(viewport)
    await visit('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Today')
    const recents = page.getByRole('list', { name: 'Recent workouts', exact: true })
    await expect(recents.getByRole('listitem')).toHaveCount(3)
    await expect(card(page, 'Train today').getByText(/^Last time:/)).toBeVisible()
    await expect(card(page, 'Train today').getByText(/^Suggested next:/)).toBeVisible()
    await expect(page.getByText('Not training today?', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Mark Rest Day', exact: true })).toBeVisible()
    await expect(today(page)).not.toHaveAttribute('data-day-state', 'workout')
    await expect(page.getByText('Current streak: 1 day, through yesterday', { exact: true })).toBeVisible()
    await expect(page.getByRole('list', { name: 'This week', exact: true }).getByRole('listitem')).toHaveCount(7)
    await page.evaluate(() => document.fonts.ready)
    const scroller = page.locator('main > .clr-scroll-region > .clr-scroll-region__scroller')
    const observations = []
    for (const [index, state, label] of [[0, 'completed', 'Completed'], [1, 'partial', 'Partial'], [2, 'unstarted', 'Not started']] as const) {
      observations.push(await inspectRecentRow(recents.getByRole('listitem').nth(index), MIXED[index], state, label, viewport, scroller))
    }
    expect(new Set(observations.map((item) => item.glyph)).size).toBe(3)
    expect(observations[0].statusColor).not.toBe(observations[1].statusColor)
    expect(observations[0].statusColor).not.toBe(observations[2].statusColor)
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
    await checkA11y()

    // The display-only cleanup belongs to Home. The ordinary chronology still
    // renders the original persisted title, link treatment and larger heading.
    await page.getByRole('link', { name: 'View history', exact: true }).click()
    await expect(page).toHaveURL((url) => url.pathname === '/history')
    const original = page.getByRole('link', { name: MIXED[0].title, exact: true })
    await expect(original).toBeVisible()
    for (const source of MIXED) await expect(page.getByRole('link', { name: source.title, exact: true })).toBeVisible()
    const chronologySize = await original.locator('..').evaluate((element) => parseFloat(getComputedStyle(element).fontSize))
    expect(observations[0].titleSize).toBeLessThan(chronologySize)
    expect(parseFloat(await original.evaluate((element) => getComputedStyle(element).borderBottomWidth))).toBeGreaterThan(0)

    await visit('/')
    const generate = page.getByRole('button', { name: 'Generate workout', exact: true })
    await expect(generate).toBeEnabled()
    await generate.click()
    await expect(page).toHaveURL((url) => url.pathname === '/generate' &&
      url.searchParams.get('minutes') === '37' && url.searchParams.get('place') === PLACE)
    const duration = page.getByRole('spinbutton', { name: 'Time available', exact: true })
    await expect(duration).toHaveValue('37')
    await duration.fill('41')
    await expect(duration).toHaveValue('41')
    await expect(page.getByRole('button', { name: 'Change focus', exact: true })).toBeVisible()
    await checkA11y()

    // A new synthetic read after an ordinary reload checks the existing
    // trained-today rule, not a test-only state mutation in the application.
    fixture.showHistory([completed(6, 0, { title: 'Synthetic completed today Session' }), ...MIXED])
    await visit('/')
    await expect(today(page)).toHaveAttribute('data-day-state', 'workout')
    await expect(page.getByRole('button', { name: 'Mark Rest Day', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Generate workout', exact: true })).toBeEnabled()
    await expect(page.getByText('Not training today?', { exact: true })).toHaveCount(0)
    await checkA11y()
    fixture.assertReadOnly()
  })

  test(`JOURNEY-003: abandoned-only history returns normally without inventing a completed request at ${viewport.width}x${viewport.height}`, async ({ page, visit, checkA11y }, testInfo) => {
    test.setTimeout(120_000)
    testInfo.annotations.push({ type: 'proof-mode',
      description: 'Synthetic partial/unstarted history through normal clients; Home presentation is distinct from Generate recommendation eligibility.' })
    const fixture = await syntheticHome(page, ABANDONED)
    await page.setViewportSize(viewport)
    await visit('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Today')
    const train = card(page, 'Train today')
    await expect(train.getByText('Choose a focus and the rest is filled in.', { exact: true })).toBeVisible()
    await expect(train.getByText(FIRST_USE, { exact: true })).toHaveCount(0)
    await expect(train.getByText(/^Last time:/)).toHaveCount(0)
    await expect(train.getByText(/^Suggested next:/)).toHaveCount(0)
    await expect(page.getByText('Not training today?', { exact: true })).toHaveCount(0)
    // Both abandoned fixtures are outside this week. The deferred empty-week
    // copy and seven-day strip remain intact.
    await expect(page.getByText('No sessions this week yet.', { exact: true })).toBeVisible()
    await expect(page.getByText('No streak yet.', { exact: true })).toBeVisible()
    await expect(page.getByRole('list', { name: 'This week', exact: true }).getByRole('listitem')).toHaveCount(7)
    await expect(today(page)).not.toHaveAttribute('data-day-state', 'workout')
    const recents = page.getByRole('list', { name: 'Recent workouts', exact: true })
    await expect(recents.getByRole('listitem')).toHaveCount(2)
    const mark = page.getByRole('button', { name: 'Mark Rest Day', exact: true })
    await expect(mark).toBeVisible()
    await mark.click()
    const reason = page.getByRole('combobox', { name: 'Reason', exact: true })
    await expect(reason).toBeFocused()
    await reason.selectOption('vacation')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(reason).toHaveCount(0)
    await expect(mark).toBeFocused()
    await expect(today(page)).not.toHaveAttribute('data-day-state', 'rest')
    await checkA11y()

    await page.getByRole('button', { name: 'Generate workout', exact: true }).click()
    await expect(page).toHaveURL((url) => url.pathname === '/generate' && !url.searchParams.has('minutes'))
    const duration = page.getByRole('spinbutton', { name: 'Time available', exact: true })
    await expect(duration).toHaveValue('45')
    await duration.fill('25')
    await expect(duration).toHaveValue('25')
    // An unfinished workout is still not completed recommendation evidence.
    await expect(page.getByText('First workout: choose a starting focus.', { exact: true })).toBeVisible()
    await expect(page.getByRole('group', { name: 'Anchor', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Change focus', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Generate workout', exact: true })).toBeDisabled()
    await checkA11y()
    fixture.assertReadOnly()
  })
}
