import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PUBLIC_LIBRARY_ROUTES } from '../../e2e/required-routes'
import { AppEntry } from '../AppEntry'
import { GALLERY_ENTRIES } from '../dev/gallery-registry'

const { initializeClients } = vi.hoisted(() => ({
  initializeClients: vi.fn(() => { throw new Error('Public gallery initialized real clients') }),
}))
vi.mock('../app/auth-client', () => ({ appAuthClients: initializeClients }))

afterEach(() => {
  window.history.replaceState(null, '', '/')
  localStorage.clear()
  initializeClients.mockClear()
})

async function open(path: string) {
  window.history.replaceState(null, '', path)
  render(<AppEntry pathname={window.location.pathname} />)
  // The shared loading screen has the same h1; wait for the actual gallery.
  await screen.findByRole('navigation', { name: 'Gallery sections' })
  await screen.findByRole('heading', { level: 1, name: 'Component Gallery' })
}

describe('public actual-component gallery', () => {
  it.each(PUBLIC_LIBRARY_ROUTES)('directly serves the required $screen route', async ({ path, section }) => {
    await open(path)
    if (section) expect(screen.getByRole('heading', { level: 2, name: section })).toBeInTheDocument()
    expect(initializeClients).not.toHaveBeenCalled()
  })

  it('opens without account providers or client initialization', async () => {
    await open('/gallery')
    expect(screen.getByText(/no account required/)).toBeInTheDocument()
    expect(screen.getByText(/App source snapshot/)).toBeInTheDocument()
    expect(initializeClients).not.toHaveBeenCalled()
  })

  it('renders the same registered components and all initial states', async () => {
    await open('/gallery/app')
    expect(document.querySelectorAll('.clr-dev-gallery__group')).toHaveLength(GALLERY_ENTRIES.length)
    expect(document.querySelectorAll('.clr-dev-gallery__specimen')).toHaveLength(
      GALLERY_ENTRIES.reduce((total, entry) => total + entry.specimens.length, 0),
    )
    expect(initializeClients).not.toHaveBeenCalled()
  })

  it('keeps archived specimens out of public navigation and rendering', async () => {
    await open('/gallery/ds')
    expect(screen.getByRole('heading', { level: 2, name: 'App-composed' })).toBeInTheDocument()
    expect(document.querySelectorAll('iframe')).toHaveLength(0)
    expect(screen.queryByRole('link', { name: 'Design system' })).not.toBeInTheDocument()
    expect(window.location.pathname).toBe('/gallery/app')
  })

  it('changes skins without persisting preferences and focuses the screen after section navigation', async () => {
    const user = userEvent.setup()
    localStorage.setItem('clear.skin', 'clear')
    await open('/gallery')
    const chrome = document.querySelector('.clr-dev-gallery__chrome') as HTMLElement
    await user.click(within(chrome).getByRole('radio', { name: 'mono' }))
    expect(document.documentElement.dataset.skin).toBe('mono')
    expect(localStorage.getItem('clear.skin')).toBe('clear')
    await user.click(screen.getByRole('link', { name: 'App-composed' }))
    await screen.findByRole('heading', { level: 2, name: 'App-composed' })
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus())
  })
})
