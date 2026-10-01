/**
 * One framed navigation action for AppHeader exits.
 *
 * UAT #286 rejected the quiet arrow-and-label treatment: a route exit is an
 * action and must look actionable. Centralising it prevents Generate, History,
 * Settings sub-routes and Session Detail from inventing four variants.
 */
import type { ReactNode } from 'react'

import { ArrowLeft, Button, type ButtonProps } from '../design-system/index'

export interface HeaderBackButtonProps
  extends Omit<ButtonProps, 'children' | 'icon' | 'size' | 'variant'> {
  children: ReactNode
}

export function HeaderBackButton({ children, ...props }: HeaderBackButtonProps) {
  return (
    <Button
      {...props}
      variant="secondary"
      size="sm"
      icon={<ArrowLeft size={20} />}
    >
      {children}
    </Button>
  )
}
