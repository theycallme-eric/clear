/**
 * The one screen wrapper (CORE-05). Owning `<main id="main">` and the `<h1>`
 * here is what makes "one main, one h1 per screen" structural rather than a
 * convention: screens never render either themselves. It also gives every
 * screen a document title and the focus/announcement target `AppChrome` uses
 * on navigation.
 */
import { useEffect, type ReactNode } from 'react'

import { Heading, HeadingLevelProvider } from '../ui/Heading'
import { useScreenRegistry } from './screen-registry'

const APP_NAME = 'CLEAR'

export interface ScreenProps {
  /** Screen name: document title and what a route change announces. */
  title: string
  /** Visible h1 content when it differs from `title` (e.g. a wordmark). */
  heading?: ReactNode
  children?: ReactNode
}

export function Screen({ title, heading, children }: ScreenProps) {
  const registry = useScreenRegistry()

  useEffect(() => {
    document.title = title === APP_NAME ? APP_NAME : `${title} · ${APP_NAME}`
    registry?.register(title)
  }, [title, registry])

  return (
    <main id="main" tabIndex={-1}>
      <HeadingLevelProvider level={1}>
        <Heading tabIndex={-1}>{heading ?? title}</Heading>
      </HeadingLevelProvider>
      <HeadingLevelProvider level={2}>{children}</HeadingLevelProvider>
    </main>
  )
}
