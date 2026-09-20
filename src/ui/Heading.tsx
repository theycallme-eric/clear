/**
 * CORE-05: heading levels come from structure, never from a hand-picked tag.
 *
 * `Heading` renders `h{level}` from the surrounding section depth, so a block
 * of content moved under a deeper section keeps a correct outline without
 * editing every heading. `HeadingSection` is the only way to go one level
 * deeper, which makes a skipped level (an h4 under an h2) unrepresentable.
 * `Screen` owns level 1; everything inside a screen starts at level 2.
 */
import {
  createContext,
  useContext,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react'

const MAX_LEVEL = 6

const HeadingLevelContext = createContext(1)

type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

export type HeadingProps = ComponentPropsWithoutRef<'h1'>

export function Heading(props: HeadingProps) {
  const level = useContext(HeadingLevelContext)
  const Tag = `h${Math.min(level, MAX_LEVEL)}` as HeadingTag
  return <Tag {...props} />
}

export interface HeadingLevelProviderProps {
  level: number
  children: ReactNode
}

/** Pins the heading level for a subtree. `Screen` uses it; screens should not. */
export function HeadingLevelProvider({
  level,
  children,
}: HeadingLevelProviderProps) {
  return (
    <HeadingLevelContext.Provider value={Math.min(level, MAX_LEVEL)}>
      {children}
    </HeadingLevelContext.Provider>
  )
}

export type HeadingSectionProps = ComponentPropsWithoutRef<'section'>

/** A `<section>` whose contents head one level deeper than its surroundings. */
export function HeadingSection({ children, ...rest }: HeadingSectionProps) {
  const level = useContext(HeadingLevelContext)
  return (
    <section {...rest}>
      <HeadingLevelContext.Provider value={Math.min(level + 1, MAX_LEVEL)}>
        {children}
      </HeadingLevelContext.Provider>
    </section>
  )
}
