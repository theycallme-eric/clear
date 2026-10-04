import { expect, test } from '../support/authenticated-session'
import { backend } from '../support/backend'
import { captureTarget } from './capture'
import { installDeterministicCapture, playwrightCaptureDriver } from './fixtures'
import { AUTHENTICATED_CAPTURE_TARGETS, VIEWPORT_OF_PROJECT } from './state-inventory'

/**
 * REQ-029 / REQ-030 / TASK-033 — the capture harness, proved on real
 * authenticated routes.
 *
 * Each test holds the session `authenticatedSession` established through the
 * real sign-in screen, asks for a protected route, and captures it only once
 * the route, its heading and its state are the ones the target names. The
 * record and the screenshot are attached to the report on a green run.
 *
 * This is the harness's own baseline, in the project's viewport and the default
 * skin. The full viewport, skin and state matrix belongs to the evidence tasks
 * that consume it. No generation is requested here, and none is allowed.
 */

const SKIN = 'clear'

test.describe('0.14.3 capture harness: authenticated routes (REQ-030)', () => {
  test.skip(!backend.available, backend.reason)

  for (const target of AUTHENTICATED_CAPTURE_TARGETS) {
    test(`captures ${target.screen} at ${target.path} in "${target.state}"`, async ({
      authenticatedPage: page,
      visit,
    }, testInfo) => {
      const viewport = VIEWPORT_OF_PROJECT[testInfo.project.name]
      expect(viewport, `no capture viewport for project "${testInfo.project.name}"`).toBeTruthy()

      const network = await installDeterministicCapture(page, { skin: SKIN })
      await visit(target.path)

      const record = await captureTarget(playwrightCaptureDriver(page, testInfo), {
        target,
        viewport,
        skin: SKIN,
      })

      expect(record.reached).toEqual({
        pathname: target.path,
        heading: target.heading,
        stateVisible: true,
      })
      await expect(page.locator('html')).toHaveAttribute('data-skin', SKIN)
      expect(record.viewport).toMatchObject(page.viewportSize() ?? {})
      expect(record.screenshot.bytes).toBeGreaterThan(0)
      expect(network.blockedGenerations(), 'a capture lane asked for a generation').toBe(0)

      await testInfo.attach(`${record.pairId}.json`, {
        body: JSON.stringify(record, null, 2),
        contentType: 'application/json',
      })
    })
  }
})
