import React from "react";
// Placeholder styling lives in css/foundation.css (.clr-input::placeholder).
// A component must never inject a stylesheet during render.

export function Input({
  label,
  value,
  defaultValue,
  onChange,
  onFocus,
  onBlur,
  placeholder,
  multiline = false,
  rows = 3,
  disabled = false,
  readOnly = false,
  required = false,
  invalid,
  helperText,
  errorText,
  id,
  name,
  type = "text",
  autoComplete,
  className = "",
  style,
  inputRef,
  ...props
}) {
  const autoId = React.useId();
  const inputId = id ?? `clr-input-${autoId}`;
  const helpId = `${inputId}-help`;
  const errId = `${inputId}-err`;
  const [focus, setFocus] = React.useState(false);

  // Error text present implies invalid unless the consumer says otherwise.
  const isInvalid = invalid ?? !!errorText;
  const describedBy = [helperText ? helpId : null, errorText ? errId : null]
    .filter(Boolean).join(" ") || undefined;

  const Tag = multiline ? "textarea" : "input";
  // Border and surface move together: an invalid field is an urgency frame, not
  // a structure frame wearing a red border.
  const borderColor = disabled
    ? "var(--border-disabled)"
    : isInvalid
    ? "var(--border-input-invalid)"
    : focus
    ? "var(--border-card)"
    : "var(--border-input)";

  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-100)", minWidth: 0, ...style }}>
      {label && (
        <label htmlFor={inputId} className="label" style={{ minWidth: 0 }}>
          {label}
          {required && <span aria-hidden="true"> *</span>}
        </label>
      )}
      <Tag
        ref={inputRef}
        className="clr-input"
        id={inputId}
        name={name}
        type={multiline ? undefined : type}
        rows={multiline ? rows : undefined}
        value={value}
        defaultValue={defaultValue}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        autoComplete={autoComplete}
        aria-invalid={isInvalid || undefined}
        aria-describedby={describedBy}
        onChange={(ev) => onChange && onChange(ev.target.value, ev)}
        onFocus={(ev) => { setFocus(true); if (onFocus) onFocus(ev); }}
        onBlur={(ev) => { setFocus(false); if (onBlur) onBlur(ev); }}
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "var(--paragraph-md-size)",
          fontWeight: "var(--font-weight-medium)",
          color: "var(--text-input)",
          /* DS-007. A form control's intrinsic min-width is its size attribute,
             which as a flex/grid item becomes an unbreakable floor and pushes
             the parent wide. Releasing it here lets the field take the width it
             is given; the parent decides when to stack instead. Consumers used
             to need `min-width: 0` overrides reaching into these internals. */
          minWidth: 0,
          width: "100%",
          boxSizing: "border-box",
          background: disabled
            ? "var(--surface-disabled)"
            : isInvalid
            ? "var(--surface-input-invalid)"
            : focus
            ? "var(--surface-input-active)"
            : "var(--surface-input)",
          border: "var(--border-width) solid " + borderColor,
          padding: "var(--spacing-200) var(--spacing-300)",
          minHeight: multiline ? undefined : 40,
          resize: multiline ? "vertical" : undefined,
          transition:
            "background var(--dur-state) var(--ease-mech), border-color var(--dur-state) var(--ease-mech)",
          cursor: disabled ? "not-allowed" : undefined,
        }}
        {...props}
      />
      {helperText && (
        <span id={helpId} style={{ fontFamily: "var(--font-body)", fontSize: "var(--paragraph-xs-size)", color: "var(--text-empty-body)" }}>
          {helperText}
        </span>
      )}
      {errorText && (
        <span id={errId} style={{ fontFamily: "var(--font-data)", fontSize: "var(--label-xs-size)", fontWeight: "var(--font-weight-bold)", letterSpacing: "var(--tracking-data)", textTransform: "uppercase", color: "var(--text-negative)" }}>
          {errorText}
        </span>
      )}
    </div>
  );
}
