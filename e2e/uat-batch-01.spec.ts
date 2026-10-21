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

test('onboarding holds each step in one card with a pinned footer action', async ({
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
  const card = page.locator('main .clr-card')

  // Every step is one card that holds its own heading without clipping it,
  // with the step's action in the pinned footer, on screen and outside the card.
  const expectContainedStep = async (title: string, action: string) => {
    await expect(card).toHaveCount(1)
    const heading = card.getByRole('heading', { level: 2, name: title })
    await expect(heading).toBeVisible()

    const body = await card.locator('.clr-card__body').boundingBox()
    const label = await heading.boundingBox()
    expect(body).not.toBeNull()
    expect(label).not.toBeNull()
    expect(label!.x).toBeGreaterThanOrEqual(body!.x)
    expect(label!.x + label!.width).toBeLessThanOrEqual(body!.x + body!.width)
    expect(
      await heading.evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true)

    const button = footer().getByRole('button', { name: action })
    await expect(button).toBeVisible()
    await expect(button).toBeInViewport({ ratio: 1 })
    await expect(card.getByRole('button', { name: action })).toHaveCount(0)
  }

  await expectContainedStep('What’s your gym setup?', 'Next')
  await expect(card.getByText('Choose the setup closest to yours.')).toBeVisible()
  await expect(footer().getByRole('button', { name: 'Next' })).toBeDisabled()
  await page.screenshot({ path: testInfo.outputPath('vibe-d-onboarding-question.png') })

  await page.getByRole('radio', { name: 'Home gym' }).click()
  await expect(page.getByRole('radio', { name: 'Home gym' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  const equipment = card.getByRole('group', { name: 'Equipment' })
  await expect(equipment).toHaveCSS('border-top-width', '0px')
  await expectContainedStep('What’s your gym setup?', 'Next')
  await footer().getByRole('button', { name: 'Next' }).click()

  await expectContainedStep('How familiar are you with the gym?', 'Next')
  await page.getByRole('radio', { name: 'Some experience' }).click()
  await footer().getByRole('button', { name: 'Next' }).click()

  await expectContainedStep('What are you going for?', 'Next')
  await page.getByRole('radio', { name: 'Balanced' }).click()
  // REQ-004: the goal's sections are a read-only list inside the card, not a control group.
  await expect(card.getByRole('list', { name: 'Sections this goal enables' })).toBeVisible()
  await expect(card.getByRole('group', { name: 'Sections' })).toHaveCount(0)
  await expectContainedStep('What are you going for?', 'Next')
  await footer().getByRole('button', { name: 'Next' }).click()

  await expectContainedStep('Any ongoing limitations?', 'Skip')
  await expect(card.getByRole('group', { name: 'Work around' })).toHaveCSS(
    'border-top-width',
    '0px',
  )
  await expect(
    page.getByText('Kept with the movements ticked above. Editable later in Settings.'),
  ).toHaveCount(0)
  await footer().getByRole('button', { name: 'Skip' }).click()

  await expectContainedStep('Here’s your setup', 'Finish setup')
  // The confirmation list is the card's content, not a second frame inside it.
  await expect(card.locator('.clr-list')).toHaveCount(1)
  await expect(card.locator('.clr-list.clr-chamfer')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('vibe-d-onboarding-confirmation.png') })

  // Stepping back keeps the answer that was given.
  await footer().getByRole('button', { name: 'Back' }).click()
  await footer().getByRole('button', { name: 'Back' }).click()
  await expectContainedStep('What are you going for?', 'Next')
  await expect(page.getByRole('radio', { name: 'Balanced' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
})

test('Generate and Settings follow the contained-form and measured-footer rulings', async ({
  page,
  visit,
}, testInfo) => {
  await seedSession(page)
  await stubSupabase(page, true)
  await visit('/generate')

  await expect(page.getByRole('heading', { level: 1, name: 'Generate workout' })).toBeVisible()

  // 0.14.3 containment: one card holds every group, label and field, and only
  // the screen title sits on the atmosphere.
  const formCard = page.locator('main .clr-card')
  await expect(formCard).toHaveCount(1)
  await expect(formCard.getByText('Goal:')).toBeVisible()
  await expect(formCard.getByRole('group', { name: 'Anchor', exact: true })).toBeVisible()
  await expect(formCard.getByRole('slider')).toBeVisible()
  await expect(formCard.getByLabel('Place')).toHaveValue(LOCATION.id)
  await expect(formCard.getByLabel('Time available')).toBeVisible()
  await expect(formCard.getByLabel('Notes')).toBeVisible()
  await expect(formCard.getByRole('heading', { level: 1 })).toHaveCount(0)
  await expect(formCard.getByRole('button', { name: 'Generate workout' })).toHaveCount(0)

  const footer = page.locator('main .clr-scroll-region__foot')
  const scroller = page.locator('main .clr-scroll-region__scroller')
  const generate = footer.getByRole('button', { name: 'Generate workout' })
  await expect(generate).toBeVisible()

  // Held until there is a Focus; choosing one is the chip's own selected state.
  await expect(generate).toBeDisabled()
  const upper = formCard.getByRole('button', { name: 'Upper body', exact: true })
  await upper.click()
  await expect(upper).toHaveAttribute('aria-pressed', 'true')
  await expect(generate).toBeEnabled()

  const contained = await page.evaluate(() => {
    const card = document.querySelector<HTMLElement>('main .clr-card')
    const button = document.querySelector<HTMLElement>('main .clr-scroll-region__foot button')
    if (!card || !button) return null
    const cardBox = card.getBoundingClientRect()
    const buttonBox = button.getBoundingClientRect()
    return {
      fieldsInside: [...card.querySelectorAll<HTMLElement>('input, select, textarea')].every(
        (field) => {
          const box = field.getBoundingClientRect()
          return box.left >= cardBox.left - 1 && box.right <= cardBox.right + 1
        },
      ),
      actionInViewport:
        buttonBox.top >= 0 &&
        buttonBox.bottom <= window.innerHeight + 1 &&
        buttonBox.left >= 0 &&
        buttonBox.right <= window.innerWidth + 1,
      noOverflow: document.documentElement.scrollWidth <= window.innerWidth,
    }
  })
  expect(contained).toEqual({ fieldsInside: true, actionInViewport: true, noOverflow: true })

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
  const settingsCards = page.locator('main .clr-card')
  await expect(settingsCards).toHaveCount(5)
  await expect(page.locator('main .clr-list')).toHaveCount(0)
  for (const name of ['Training', 'Limitations', 'Appearance', 'Places and equipment', 'Session']) {
    const heading = page.getByRole('heading', { level: 2, name, exact: true })
    await expect(settingsCards.filter({ has: heading })).toHaveCount(1)
    await expect(heading).toBeVisible()
  }
  await expect(page.getByRole('heading', { name: 'Training' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Places and equipment' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('vibe-d-settings.png') })
})

test('Generate loading and failure remain honest at every supported width', async ({
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
  // The held request is one truthfully busy card — the loader's own, not a
  // card wrapped around it — with the way out pinned in the footer.
  const loader = page.locator('main').getByRole('status')
  await expect(loader).toHaveAttribute('aria-busy', 'true')
  await expect(page.locator('main .clr-card')).toHaveCount(1)
  await expect(
    page.locator('main .clr-scroll-region__foot').getByRole('button', { name: 'Cancel' }),
  ).toBeVisible()
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
