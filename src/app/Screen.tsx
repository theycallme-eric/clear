/**
 * The one screen wrapper (CORE-05). Owning `<main id="main">` and the `<h1>`
 * here is what makes "one main, one h1 per screen" structural rather than a
 * convention: screens never render either themselves. It also gives every
 * screen a document title and the focus/announcement target `AppChrome` uses
 * on navigation.
 */
import { useEffect, type ReactNode } from 'react'

import { ScrollRegion } from '../design-system/index'
import { Heading, HeadingLevelProvider } from '../ui/Heading'
import { useScreenRegistry } from './screen-registry'

const APP_NAME = 'CLEAR'

export interface ScreenProps {
  /** Screen name: document title and what a route change announces. */
  title: string
  /** Visible h1 content when it differs from `title` (e.g. a wordmark). */
  heading?: ReactNode
  /** Optional transparent layer pinned above this screen's scrolling content. */
  pinnedHead?: ReactNode
  /** Optional transparent layer pinned below this screen's scrolling content. */
  pinnedFoot?: ReactNode
  /** Omit the head rule when pinnedHead already draws its own closing rule. */
  pinnedHeadRule?: boolean
  /**
   * Centre the title and content as one group in the visible height. The group
   * still starts at the top and scrolls when it is taller than the viewport.
   */
  centered?: boolean
  children?: ReactNode
}

export function Screen({
  title,
  heading,
  pinnedHead,
  pinnedFoot,
  pinnedHeadRule = true,
  centered = false,
  children,
}: ScreenProps) {
  const registry = useScreenRegistry()

  useEffect(() => {
    document.title = title === APP_NAME ? APP_NAME : `${title} · ${APP_NAME}`
    registry?.register(title)
  }, [title, registry])

  return (
    <main id="main" className="clr-screen" tabIndex={-1}>
      <ScrollRegion
        head={pinnedHead}
        headRule={pinnedHeadRule}
        foot={pinnedFoot}
        scrollerProps={{
          'aria-label': `${title} content`,
          role: 'region',
          tabIndex: 0,
        }}
      >
        <div
          className={
            centered ? 'clr-screen__content clr-screen__content--centered' : 'clr-screen__content'
          }
        >
          <HeadingLevelProvider level={1}>
            <Heading tabIndex={-1}>{heading ?? title}</Heading>
          </HeadingLevelProvider>
          <HeadingLevelProvider level={2}>{children}</HeadingLevelProvider>
        </div>
      </ScrollRegion>
    </main>
  )
}
