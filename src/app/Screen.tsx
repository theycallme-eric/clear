/**
 * The one screen wrapper (CORE-05). Owning `<main id="main">` and the `<h1>`
 * here is what makes "one main, one h1 per screen" structural rather than a
 * convention: screens never render either themselves. It also gives every
 * screen a document title and the focus/announcement target `AppChrome` uses
 * on navigation.
 *
 * REQ-001: a screen with a fixed header passes `header`; the page title is
 * then that header's title in place of the repeated CLEAR logo, and the
 * scrolling content starts with its first card.
 *
 * B05 REQ-003: the header is the region's pinned head. The public region
 * draws its top streak and measures its scroller's top edge only from a head
 * it owns, so a header rendered beside it left the clip line at the header's
 * rule without the scroll treatment. The header keeps its own closing rule
 * (`headRule={false}`, as for any head that ends on a rule of its own) and the
 * streak lights on that rule. With no pinned footer, an overflowing screen
 * gets a bare lower edge layer: the foot's rule, and the bottom inset beneath
 * it, with no action added. Content that fits gets neither.
 */
import {
  isValidElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'

import { AppHeader, ScrollRegion, type AppHeaderProps } from '../design-system/index'
import { ForegroundEchoFrame, ForegroundEchoText } from '../ui/foreground-echo'
import { Heading, HeadingLevelProvider } from '../ui/Heading'
import { useScreenRegistry } from './screen-registry'

const APP_NAME = 'CLEAR'

/** The fixed header's slots; its title is always the screen's own heading. */
export type ScreenHeader = Pick<AppHeaderProps, 'left' | 'meta' | 'actions' | 'className'>

export interface ScreenProps {
  /** Screen name: document title and what a route change announces. */
  title: string
  /** Visible h1 content when it differs from `title` (e.g. a wordmark). */
  heading?: ReactNode
  /** Fixed header above the screen; when set, the h1 is its title. */
  header?: ScreenHeader
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

/**
 * Whether the scroller holding `content` actually overflows. Only watched when
 * `watch` is set; a screen with its own footer already has a lower layer.
 */
function useOverflow(content: RefObject<HTMLElement | null>, watch: boolean): boolean {
  const [overflowing, setOverflowing] = useState(false)

  useLayoutEffect(() => {
    const element = content.current
    const scroller = element?.parentElement
    if (!watch || !element || !scroller) return
    const measure = () => {
      const region = scroller.parentElement
      const edge = region?.querySelector<HTMLElement>(
        ':scope > .clr-scroll-region__foot > [data-screen-edge]',
      )
      const reservedFoot = edge?.parentElement?.getBoundingClientRect().height ?? 0
      const paddingBottom = parseFloat(getComputedStyle(element).paddingBottom) || 0
      // Measure the no-footer layout even while its temporary edge is mounted.
      // The edge owns the safe inset then, so restore that content padding for
      // this comparison and restore the space the public foot reserves.
      const inset = edge?.getBoundingClientRect().height ?? paddingBottom
      const contentHeight = Math.max(element.scrollHeight, element.getBoundingClientRect().height)
        + inset - paddingBottom
      setOverflowing(contentHeight > scroller.clientHeight + reservedFoot + 1)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(scroller)
    observer.observe(element)
    return () => observer.disconnect()
  }, [content, watch])

  return watch && overflowing
}

/** A header slot's one framed action, as its echo target; anything else as given. */
function echoedAction(slot: ReactNode): ReactNode {
  return isValidElement(slot) ? <ForegroundEchoFrame>{slot}</ForegroundEchoFrame> : slot
}

export function Screen({
  title,
  heading,
  header,
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

  // REQ-004: the heading and the header's framed actions stand on the
  // background, so each echoes; the actions' glyphs are inside their frames.
  const pageTitle = (
    <HeadingLevelProvider level={1}>
      <Heading className="clr-screen__title" tabIndex={-1}>
        <ForegroundEchoText>{heading ?? title}</ForegroundEchoText>
      </Heading>
    </HeadingLevelProvider>
  )
  const headerSlots: ScreenHeader | undefined = header && {
    ...header,
    left: echoedAction(header.left),
    actions: echoedAction(header.actions),
  }

  const contentRef = useRef<HTMLDivElement>(null)
  const overflowing = useOverflow(contentRef, !pinnedFoot)

  const head =
    header === undefined ? (
      pinnedHead
    ) : (
      <>
        <AppHeader {...headerSlots}>{pageTitle}</AppHeader>
        {pinnedHead}
      </>
    )

  const foot =
    pinnedFoot || (overflowing ? <div className="clr-screen__edge" data-screen-edge="" /> : undefined)

  return (
    <>
      <main id="main" className="clr-screen" tabIndex={-1}>
        <ScrollRegion
          head={head}
          headRule={header === undefined || pinnedHead ? pinnedHeadRule : false}
          foot={foot}
          scrollerProps={{
            'aria-label': `${title} content`,
            role: 'region',
            tabIndex: 0,
          }}
        >
          <div
            ref={contentRef}
            className={[
              'clr-screen__content',
              centered ? 'clr-screen__content--centered' : null,
              header === undefined ? null : 'clr-screen__content--titled-head',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {header === undefined ? pageTitle : null}
            <HeadingLevelProvider level={2}>{children}</HeadingLevelProvider>
          </div>
        </ScrollRegion>
      </main>
    </>
  )
}
