import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { GalleryMotion } from './gallery-motion'
import { MOTION_PATTERNS } from './gallery-motion-patterns'

describe('restored Motion Lab', () => {
  it('accounts for every original effect using the shipped motion vocabulary', () => {
    const original = readFileSync(resolve(import.meta.dirname, '../design-system/preview/motion-lab.html'), 'utf8')
    const effects = [...original.matchAll(/data-fx="([^"]+)"/g)].map(match => match[1]).sort()
    expect(MOTION_PATTERNS.map(pattern => pattern.id).sort()).toEqual(effects)
    const css = readFileSync(resolve(import.meta.dirname, '../design-system/css/motion.css'), 'utf8')
    for (const pattern of MOTION_PATTERNS) expect(css).toContain('.' + pattern.className)
  })

  it('keeps timing experiments local and restores system defaults', async () => {
    const user = userEvent.setup()
    const { container } = render(<GalleryMotion />)
    const lab = container.querySelector<HTMLElement>('[data-motion-lab]')!
    const globalTiming = document.documentElement.style.getPropertyValue('--dur-base')
    await user.click(screen.getByRole('button', { name: 'Local timing controls' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Duration (ms)' }), { target: { value: '600' } })
    expect(lab.style.getPropertyValue('--dur-base')).toBe('600ms')
    expect(document.documentElement.style.getPropertyValue('--dur-base')).toBe(globalTiming)
    await user.click(screen.getByRole('button', { name: 'Reset timing' }))
    expect(lab.style.getPropertyValue('--dur-base')).toBe('')
    expect(screen.getByText('System timing')).toBeInTheDocument()
  })

  it('offers both real scroll samples and identifies the unresolved proposal', () => {
    const { container } = render(<GalleryMotion />)
    const samples = container.querySelectorAll('[data-gallery-scroll]')
    expect(samples).toHaveLength(2)
    expect(within(samples[0] as HTMLElement).getByText('Entry 01')).toBeInTheDocument()
    expect(within(samples[1] as HTMLElement).getByText('Entry 01')).toBeInTheDocument()
    expect(screen.getByText(/gallery-only comparison/)).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Scroll both samples (%)' })).toBeInTheDocument()
  })
})
