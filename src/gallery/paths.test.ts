import { describe, expect, it } from 'vitest'

import { isPublicGalleryPath } from './paths'

describe('the public gallery entry boundary', () => {
  it.each(['/gallery', '/gallery/', '/gallery/app', '/gallery/ds', '/gallery/unknown'])('accepts %s', (path) => {
    expect(isPublicGalleryPath(path)).toBe(true)
  })

  it.each(['/', '/settings', '/workout', '/gallery-settings', '/Gallery', '/dev/gallery', '/gallery-reference/0.14.3/styles.css'])('keeps %s outside the public bootstrap', (path) => {
    expect(isPublicGalleryPath(path)).toBe(false)
  })
})
