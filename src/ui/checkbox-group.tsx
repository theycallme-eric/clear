/**
 * CheckboxGroup — one semantic, borderless home for app-owned checkbox lists.
 *
 * The design system ships the checkbox itself but not a list composition for
 * several independent checkboxes. A native fieldset/legend still names the
 * relationship; this wrapper simply guarantees that the browser never adds a
 * second visual frame around controls that already carry their own treatment,
 * and puts each row's input over its whole box and label (see
 * checkbox-group.css), so every press on a row toggles that row once.
 */
import type { CSSProperties, FieldsetHTMLAttributes, ReactNode } from 'react'

import './checkbox-group.css'

export interface CheckboxGroupProps
  extends Omit<FieldsetHTMLAttributes<HTMLFieldSetElement>, 'children'> {
  legend: ReactNode
  children: ReactNode
}

const GROUP_STYLE: CSSProperties = {
  border: 0,
  margin: 0,
  padding: 0,
}

export function CheckboxGroup({ legend, children, className, style, ...props }: CheckboxGroupProps) {
  return (
    <fieldset
      className={['clr-stack', 'clr-stack--tight', 'clr-checkbox-group', className].filter(Boolean).join(' ')}
      style={{ ...GROUP_STYLE, ...style }}
      {...props}
    >
      <legend className="label" style={{ padding: 0 }}>
        {legend}
      </legend>
      {children}
    </fieldset>
  )
}
