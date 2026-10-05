/**
 * Select — the DS-04b native `<select>` styled to CLEAR.
 *
 * The control is the platform's: keyboard behaviour, type-ahead and the mobile
 * picker come free, and the opened dropdown is never reimplemented.
 * `appearance: none` strips only the closed control's chrome so it can sit in
 * the same element frame Input uses — the 8px chamfered `clr-field`, emitting
 * through its bleed wrapper, same surface ladder, same warning glyph. Label,
 * helper and error wiring go through FormField, which hands down the same aria
 * contract Input builds in.
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
      // FormField has no shrink release of its own; Input's root does.
      style={{ minWidth: 0, ...style }}
    >
      {({ describedBy, invalid: fieldInvalid }) => {
        const isInvalid = invalid ?? fieldInvalid
        // Border and surface move together, exactly as Input's do: an invalid
        // field is an urgency frame, not a structure frame wearing a red border.
        // Focus wins the border over invalid — the error text still says what
        // is wrong — while the surface keeps the urgency tint.
        const borderColor = disabled
          ? 'var(--border-disabled)'
          : focus
            ? 'var(--border-field-focus)'
            : isInvalid
              ? 'var(--border-input-invalid)'
              : 'var(--border-input)'
        const surface = disabled
          ? 'var(--surface-disabled)'
          : isInvalid
            ? 'var(--surface-input-invalid)'
            : focus
              ? 'var(--surface-input-active)'
              : 'var(--surface-input)'
        const showGlyph = isInvalid && !disabled

        return (
          // The frame carries border, surface and bleed, as Input's does; the
          // control itself is borderless and takes the width it is given.
          <span
            className="clr-bleed clr-bleed--block"
            style={{ '--bleed': borderColor, minWidth: 0 } as CSSProperties}
          >
            <div
              className="clr-chamfer clr-chamfer--sm clr-field"
              style={
                {
                  '--surface': surface,
                  '--brd': borderColor,
                  minHeight: 'var(--control-height)',
                  transition:
                    'background var(--dur-state) var(--ease-mech), border-color var(--dur-state) var(--ease-mech)',
                  cursor: disabled ? 'not-allowed' : undefined,
                } as CSSProperties
              }
            >
              <select
                ref={selectRef}
                className="clr-input"
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
                  flex: '1 1 auto',
                  boxSizing: 'border-box',
                  background: 'transparent',
                  border: 0,
                  borderRadius: 0,
                  paddingTop: 'var(--spacing-200)',
                  paddingBottom: 'var(--spacing-200)',
                  paddingLeft: 'var(--spacing-300)',
                  // Clearance for the chevron, and the warning glyph beside it.
                  paddingRight: showGlyph
                    ? 'calc(var(--spacing-800) + var(--icon-size) + var(--spacing-200))'
                    : 'var(--spacing-800)',
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
                  gap: 'var(--spacing-200)',
                  pointerEvents: 'none',
                  color: 'var(--text-input)',
                }}
              >
                <ChevronDown size={16} />
                {showGlyph && (
                  // Not colour alone: Input's warning glyph, in the field itself.
                  <span className="clr-field__glyph" style={{ padding: 0 }}>
                    <svg viewBox="0 0 24 24">
                      <path d="M10 2h4l8 20H2zM11 9v6h2V9zm0 8v2h2v-2z" />
                    </svg>
                  </span>
                )}
              </span>
            </div>
          </span>
        )
      }}
    </FormField>
  )
}
