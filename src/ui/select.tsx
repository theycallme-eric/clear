/**
 * Select — the DS-04b native `<select>` styled to CLEAR.
 *
 * The control is the platform's: keyboard behaviour, type-ahead and the mobile
 * picker come free, and the opened dropdown is never reimplemented.
 * `appearance: none` strips only the closed control's chrome so the token
 * styling can make it a visual sibling of Input — same structure border, same
 * surface ladder, sharp corners. Label, helper and error wiring go through
 * FormField, which hands down the same aria contract Input builds in.
 */
import { useId, useState } from 'react'
import type {
  ChangeEvent,
  CSSProperties,
  FocusEvent,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
} from 'react'

import { ChevronDown, FormField } from '../design-system/index'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps
  extends Omit<
    SelectHTMLAttributes<HTMLSelectElement>,
    // `multiple`/`size` turn the control into an inline listbox — out of scope
    // for a dropdown; onChange is replaced by Input's (value, event) shape.
    'onChange' | 'multiple' | 'size'
  > {
  label?: ReactNode
  /** Flat option list; pass native <option>/<optgroup> children instead for grouping. */
  options?: SelectOption[]
  /** Matches Input: the selected value first, then the native event. */
  onChange?: (value: string, event: ChangeEvent<HTMLSelectElement>) => void
  /** Error text present implies invalid unless the consumer says otherwise. */
  invalid?: boolean
  helperText?: ReactNode
  errorText?: ReactNode
  selectRef?: Ref<HTMLSelectElement>
}

export function Select({
  label,
  options,
  children,
  onChange,
  onFocus,
  onBlur,
  disabled = false,
  required = false,
  invalid,
  helperText,
  errorText,
  id,
  className,
  style,
  selectRef,
  ...props
}: SelectProps) {
  const autoId = useId()
  const selectId = id ?? `clear-select-${autoId}`
  const [focus, setFocus] = useState(false)

  return (
    <FormField
      label={label}
      htmlFor={selectId}
      required={required}
      helperText={helperText}
      errorText={errorText}
      className={className}
      style={style}
    >
      {({ describedBy, invalid: fieldInvalid }) => {
        const isInvalid = invalid ?? fieldInvalid
        // Border and surface move together, exactly as Input's do: an invalid
        // field is an urgency frame, not a structure frame wearing a red border.
        const borderColor = disabled
          ? 'var(--border-disabled)'
          : isInvalid
            ? 'var(--border-input-invalid)'
            : focus
              ? 'var(--border-card)'
              : 'var(--border-input)'
        const background = disabled
          ? 'var(--surface-disabled)'
          : isInvalid
            ? 'var(--surface-input-invalid)'
            : focus
              ? 'var(--surface-input-active)'
              : 'var(--surface-input)'

        return (
          <span style={{ position: 'relative', display: 'block', minWidth: 0 }}>
            <select
              ref={selectRef}
              id={selectId}
              disabled={disabled}
              required={required}
              aria-invalid={isInvalid || undefined}
              aria-describedby={describedBy}
              onChange={(ev) => onChange && onChange(ev.target.value, ev)}
              onFocus={(ev: FocusEvent<HTMLSelectElement>) => {
                setFocus(true)
                if (onFocus) onFocus(ev)
              }}
              onBlur={(ev: FocusEvent<HTMLSelectElement>) => {
                setFocus(false)
                if (onBlur) onBlur(ev)
              }}
              style={{
                // Strips the closed control's platform chrome only; the opened
                // dropdown stays native.
                appearance: 'none',
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--paragraph-md-size)',
                fontWeight: 'var(--font-weight-medium)' as CSSProperties['fontWeight'],
                color: 'var(--text-input)',
                minWidth: 0,
                width: '100%',
                boxSizing: 'border-box',
                background,
                border: 'var(--border-width) solid ' + borderColor,
                borderRadius: 0,
                paddingTop: 'var(--spacing-200)',
                paddingBottom: 'var(--spacing-200)',
                paddingLeft: 'var(--spacing-300)',
                // Clearance for the chevron on the right.
                paddingRight: 'var(--spacing-800)',
                minHeight: 40,
                transition:
                  'background var(--dur-state) var(--ease-mech), border-color var(--dur-state) var(--ease-mech)',
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
              {...props}
            >
              {options?.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                >
                  {option.label}
                </option>
              ))}
              {children}
            </select>
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                right: 'var(--spacing-300)',
                display: 'inline-flex',
                alignItems: 'center',
                pointerEvents: 'none',
                color: 'var(--text-input)',
              }}
            >
              <ChevronDown size={16} />
            </span>
          </span>
        )
      }}
    </FormField>
  )
}
