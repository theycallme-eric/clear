import type { ComponentPropsWithoutRef } from 'react'

export interface NavProps extends ComponentPropsWithoutRef<'nav'> {
  /** Accessible name; CORE-05 requires every nav landmark to carry one. */
  label: string
}

/** The app's only way to render a `<nav>` — the name is not optional. */
export function Nav({ label, children, ...rest }: NavProps) {
  return (
    <nav aria-label={label} {...rest}>
      {children}
    </nav>
  )
}
