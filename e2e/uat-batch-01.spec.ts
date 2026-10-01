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

async function stubSupabase(page: Page, onboarded: boolean) {
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
}) => {
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
})

test('Generate and Settings follow the direct-form and measured-footer rulings', async ({
  page,
  visit,
}) => {
  await seedSession(page)
  await stubSupabase(page, true)
  await visit('/generate')

  await expect(page.getByRole('heading', { level: 1, name: 'Generate workout' })).toBeVisible()
  await expect(page.locator('main .clr-card')).toHaveCount(0)
  await expect(page.getByLabel('Place')).toHaveValue(LOCATION.id)

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

  await visit('/settings')
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  await expect(page.locator('main .clr-card')).toHaveCount(0)
  await expect(page.locator('main .clr-list')).toHaveCount(1)
  await expect(page.getByRole('heading', { name: 'Training' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Places and equipment' })).toBeVisible()
})

test('Home renders one ordered card hierarchy with no empty active-session surface', async ({
  page,
  visit,
}) => {
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
})
