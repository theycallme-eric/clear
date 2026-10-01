import type { Page, Route } from '@playwright/test'

import { expect, test } from './fixtures'

const USER_ID = '00000000-0000-4000-8000-00000000ba01'
const NOW = '2026-09-29T00:00:00.000+00:00'

const LOCATION = {
  id: '00000000-0000-4000-8000-00000000ba02',
  user_id: USER_ID,
  created_at: NOW,
  updated_at: NOW,
  name: 'Building gym',
  tier: 'building',
  is_default: true,
}

const COMPLETED_SESSION = {
  id: '00000000-0000-4000-8000-00000000ba03',
  user_id: USER_ID,
  location_id: LOCATION.id,
  created_at: '2026-09-30T08:00:00.000+00:00',
  updated_at: '2026-09-30T10:00:00.000+00:00',
  date: '2026-09-30',
  title: 'Completed session',
  overview: null,
  session_focus: 'upper_body',
  goal_preset: 'balanced',
  requested_duration_mins: 45,
  effective_duration_target_mins: 45,
  computed_duration_mins: 42,
  actual_duration_mins: 41,
  requested_intensity: 5,
  effective_intensity: 5,
  adjustment_reason: null,
  generation_notes: null,
  prompt_version: 'e2e',
  contract_version: '4.1.0',
  started_at: '2026-09-30T09:00:00.000+00:00',
  completed_at: '2026-09-30T09:41:00.000+00:00',
  abandoned_at: null,
  mood: null,
  session_notes: null,
  counts_for_streak: true,
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}

function profile(onboarded: boolean) {
  return {
    id: USER_ID,
    created_at: NOW,
    updated_at: NOW,
    experience_level: onboarded ? 'some' : null,
    goal_preset: onboarded ? 'balanced' : null,
    enabled_sections: ['warmup', 'primary_lift', 'accessory', 'cooldown'],
    weight_unit: 'kg',
    onboarded_at: onboarded ? NOW : null,
  }
}

async function seedSession(page: Page) {
  await page.addInitScript((userId) => {
    localStorage.setItem(
      'clear.auth.session',
      JSON.stringify({
        accessToken: 'e2e-uat-batch-01',
        refreshToken: 'e2e-uat-batch-01',
        expiresAt: Date.now() + 60 * 60 * 1000,
        user: { id: userId, email: 'clear-e2e-uat@example.com' },
      }),
    )
  }, USER_ID)
}

async function stubSupabase(
  page: Page,
  onboarded: boolean,
  history: readonly unknown[] = [],
) {
  const answer = async (route: Route, body: unknown) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS })
      return
    }
    await route.fulfill({ status: 200, headers: CORS, json: body })
  }

  await page.route('**/auth/v1/**', (route) => answer(route, {}))
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/rest/v1/profiles')) {
      return answer(route, [profile(onboarded)])
    }
    if (url.pathname.endsWith('/rest/v1/locations')) {
      return answer(route, onboarded ? [LOCATION] : [])
    }
    if (url.pathname.endsWith('/rest/v1/workout_sessions')) {
      return answer(route, history)
    }
    if (url.pathname.endsWith('/rest/v1/rpc/resume_session')) {
      return answer(route, null)
    }
    return answer(route, [])
  })
  await page.route('**/functions/v1/**', (route) => answer(route, {}))
}

test('onboarding uses direct questions, a pinned footer, and one framed confirmation list', async ({
  page,
  visit,
}, testInfo) => {
  await seedSession(page)
  await stubSupabase(page, false)
  await visit('/onboarding')

  const atmosphere = page.locator('.clr-atmosphere')
  await expect(atmosphere).not.toHaveAttribute('data-context')
  expect(
    await atmosphere.evaluate((layer) =>
      Number(getComputedStyle(layer).getPropertyValue('--atmosphere-opacity')),
    ),
  ).toBe(0.4)

  const footer = () => page.locator('main .clr-footer')
  await expect(page.locator('main .clr-card')).toHaveCount(0)
  await expect(page.getByText('Choose the setup closest to yours.')).toBeVisible()
  await expect(footer().getByRole('button', { name: 'Next' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('vibe-d-onboarding-question.png') })

  await page.getByRole('radio', { name: 'Home gym' }).click()
  const equipment = page.getByRole('group', { name: 'Equipment' })
  await expect(equipment).toHaveCSS('border-top-width', '0px')
  await footer().getByRole('button', { name: 'Next' }).click()

  await page.getByRole('radio', { name: 'Some experience' }).click()
  await footer().getByRole('button', { name: 'Next' }).click()

  await page.getByRole('radio', { name: 'Balanced' }).click()
  await expect(page.getByRole('group', { name: 'Sections' })).toHaveCSS('border-top-width', '0px')
  await footer().getByRole('button', { name: 'Next' }).click()

  await expect(page.getByRole('group', { name: 'Work around' })).toHaveCSS(
    'border-top-width',
    '0px',
  )
  await expect(
    page.getByText('Kept with the movements ticked above. Editable later in Settings.'),
  ).toHaveCount(0)
  await footer().getByRole('button', { name: 'Skip' }).click()

  await expect(page.getByRole('heading', { name: 'Here’s your setup' })).toBeVisible()
  await expect(page.locator('main .clr-list')).toHaveCount(1)
  await expect(footer().getByRole('button', { name: 'Finish setup' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('vibe-d-onboarding-confirmation.png') })
})

test('Generate restores one chamfered instrument while Settings keeps the measured composition', async ({
  page,
  visit,
}, testInfo) => {
  await seedSession(page)
  await stubSupabase(page, true)
  await visit('/generate')

  await expect(page.getByRole('heading', { level: 1, name: 'Generate workout' })).toBeVisible()
  await expect(page.locator('main .clr-card')).toHaveCount(1)
  const panel = page.locator('main .generate-composition')
  await expect(panel.locator('.clr-card__body')).toHaveClass(/clr-chamfer--info/)
  await expect(panel.locator('.clr-card__bar')).toHaveCount(1)
  await expect(panel.getByText('Goal', { exact: true })).toBeVisible()
  await expect(panel.getByText('Balanced', { exact: true })).toBeVisible()
  await expect(panel.getByText(/a little of everything/i)).toHaveCount(0)
  await expect(panel.getByRole('link', { name: /settings/i })).toHaveCount(0)

  const home = page.getByRole('button', { name: 'Home', exact: true })
  await expect(home).toHaveClass(/clr-btn/)
  await expect(home).not.toHaveClass(/clr-btn--quiet/)

  const intensity = page.getByRole('slider', { name: 'Intensity' })
  await expect(intensity).toHaveAttribute('min', '1')
  await expect(intensity).toHaveAttribute('max', '10')
  await expect(page.getByText(/runs \d+ to \d+/i)).toHaveCount(0)
  await expect(page.getByLabel('Place')).toHaveValue(LOCATION.id)
  await expect(page.getByText(/equipment saved with this place/i)).toHaveCount(0)
  await expect(page.getByText(/context for today/i)).toHaveCount(0)

  const footer = page.locator('main .clr-scroll-region__foot')
  const scroller = page.locator('main .clr-scroll-region__scroller')
  await expect(footer.getByRole('button', { name: 'Generate workout' })).toBeVisible()

  const separated = await page.evaluate(() => {
    const content = document.querySelector<HTMLElement>('main .clr-scroll-region__scroller')
    const foot = document.querySelector<HTMLElement>('main .clr-scroll-region__foot')
    if (!content || !foot) return false
    return content.getBoundingClientRect().bottom <= foot.getBoundingClientRect().top + 1
  })
  expect(separated).toBe(true)
  await expect(scroller).toHaveCSS('overflow-y', 'auto')
  await page.screenshot({ path: testInfo.outputPath('vibe-d-generate.png') })

  await visit('/settings')
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  await expect(page.locator('main .clr-card')).toHaveCount(0)
  await expect(page.locator('main .clr-list')).toHaveCount(1)
  await expect(page.getByRole('heading', { name: 'Training' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Places and equipment' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('vibe-d-settings.png') })
})

test('returning Generate keeps the recommended Anchor collapsed until Edit', async ({
  page,
  visit,
}, testInfo) => {
  await seedSession(page)
  await stubSupabase(page, true, [COMPLETED_SESSION])
  await visit('/generate')

  const panel = page.locator('main .generate-composition')
  const edit = panel.getByRole('button', { name: 'Edit', exact: true })
  await expect(edit).toHaveAttribute('aria-expanded', 'false')
  await expect(panel.getByRole('group', { name: 'Anchor', exact: true })).toHaveCount(0)
  await expect(panel).not.toContainText(/sessions you’ve logged|no .+ in \d+ days/i)

  await edit.click()
  const choices = panel.getByRole('group', { name: 'Focus for this workout' })
  await expect(choices).toBeVisible()
  await expect(choices.getByRole('button')).toHaveCount(4)
  await page.screenshot({ path: testInfo.outputPath('uat-generate-anchor-edit.png') })
})

test('generation loading and failure remain honest at every supported width', async ({
  page,
  visit,
}, testInfo) => {
  await seedSession(page)
  await stubSupabase(page, true)

  let answerGeneration!: () => void
  const heldGeneration = new Promise<void>((resolve) => {
    answerGeneration = resolve
  })

  await page.route('**/functions/v1/generate-workout', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS })
      return
    }

    await heldGeneration
    const requestId = route.request().headers()['x-request-id'] ?? 'req_vibe_d'
    await route.fulfill({
      status: 502,
      headers: CORS,
      json: {
        code: 'GENERATION_MODEL_ERROR',
        message: 'Generation service error. Try again.',
        requestId,
        failure: 'generation.upstream',
      },
    })
  })

  await visit('/generate')
  const anchor = page.getByRole('group', { name: 'Anchor', exact: true })
  await anchor.getByRole('button', { name: 'Upper body', exact: true }).click()
  await page.getByRole('button', { name: 'Generate workout', exact: true }).click()

  await expect(page.locator('main h1')).toHaveAccessibleName('Generating session')
  await expect(page).toHaveURL((url) => url.pathname === '/generate')
  await page.screenshot({ path: testInfo.outputPath('vibe-d-loading.png') })

  answerGeneration()
  await expect(
    page.locator('main').getByRole('status').filter({ hasText: 'Generation failed' }),
  ).toBeVisible()
  await expect(page.getByRole('alert')).toContainText(
    'The generation service did not answer. Try again in a moment.',
  )
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('vibe-d-generation-error.png'),
    animations: 'disabled',
  })
})

test('Home renders one ordered card hierarchy with no empty active-session surface', async ({
  page,
  visit,
}, testInfo) => {
  await seedSession(page)
  await stubSupabase(page, true)
  await visit('/')

  await expect(page.getByText('No workout in progress')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Suggested next' })).toHaveCount(0)
  await expect(page.locator('main .clr-card__bar--lg')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Mark Rest Day' })).toBeVisible()

  const cardHeadings = await page.locator('main .clr-card').evaluateAll((cards) =>
    cards.map((card) => card.querySelector('h2')?.textContent?.trim() ?? null),
  )
  expect(cardHeadings.slice(0, 2)).toEqual(['Train today', 'This week'])
  await page.screenshot({ path: testInfo.outputPath('vibe-d-home.png') })
})
