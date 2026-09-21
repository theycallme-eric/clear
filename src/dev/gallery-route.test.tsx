/**
 * The gallery as a route: the two sections REQ-029 names, and the two switchers
 * that make it a review surface rather than a screenshot.
 */
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { SKINS } from '../design-system/skin'
import { renderApp } from '../test/render'
import { ATMOSPHERE_LEVELS } from './gallery-atmosphere'
import { SPECIMENS } from './specimens'

describe('/dev/gallery', () => {
  it('is one screen with both sections reachable', async () => {
    renderApp(['/dev/gallery'])

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Component Gallery' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Design system' })).toHaveAttribute(
      'href',
      '/dev/gallery/ds',
    )
    expect(screen.getByRole('link', { name: 'App-composed' })).toHaveAttribute(
      'href',
      '/dev/gallery/app',
    )
  })

  it('serves the export’s cards at /dev/gallery/ds, one frame per file', async () => {
    renderApp(['/dev/gallery/ds'])

    await screen.findByRole('heading', { level: 2, name: 'Design system' })
    const frames = document.querySelectorAll('iframe')

    expect(frames).toHaveLength(SPECIMENS.length)
    for (const specimen of SPECIMENS) {
      expect(
        document.querySelector(`iframe[src="${specimen.url}"]`),
        specimen.file,
      ).not.toBeNull()
    }
  })

  it('frames the app-composed parts at /dev/gallery/app', async () => {
    renderApp(['/dev/gallery/app'])

    expect(
      await screen.findByRole('heading', { level: 2, name: 'App-composed' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 3, name: 'CollapsibleSection' }),
    ).toBeInTheDocument()
  })

  it('cycles all four skins live through setSkin()', async () => {
    const user = userEvent.setup()
    renderApp(['/dev/gallery'])
    await screen.findByRole('heading', { level: 1, name: 'Component Gallery' })

    for (const skin of SKINS) {
      await user.click(screen.getByRole('radio', { name: skin }))
      expect(document.documentElement.dataset.skin).toBe(skin)
    }
    // The gallery reviews skins; it does not decide the reviewer's own.
    expect(localStorage.getItem('clear.skin')).toBeNull()
  })

  it('cycles all three atmosphere levels, and hands the route its own back', async () => {
    const user = userEvent.setup()
    const { unmount } = renderApp(['/dev/gallery'])
    await screen.findByRole('heading', { level: 1, name: 'Component Gallery' })

    for (const level of ATMOSPHERE_LEVELS) {
      await user.click(
        screen.getByRole('radio', { name: new RegExp(`^${level}`) }),
      )
      expect(document.documentElement.dataset.atmosphere).toBe(level)
    }

    unmount()
    await waitFor(() =>
      // IA.md §4 gives the gallery `quiet`; an override must not outlive it.
      expect(document.documentElement.dataset.atmosphere).toBe('quiet'),
    )
  })
})
