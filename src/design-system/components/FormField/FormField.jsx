import React from "react";

export function FormField({
  label,
  htmlFor,
  required = false,
  helperText,
  errorText,
  children,
  className = "",
  style,
  ...props
}) {
  const autoId = React.useId();
  const helpId = `clr-ff-${autoId}-help`;
  const errId = `clr-ff-${autoId}-err`;
  const describedBy = [helperText ? helpId : null, errorText ? errId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-100)", ...style }} {...props}>
      {label && (
        <label htmlFor={htmlFor} className="label">
          {label}
          {required && <span aria-hidden="true"> *</span>}
        </label>
      )}
      {/* Children receive the describedby wiring so any control can sit here. */}
      {typeof children === "function" ? children({ describedBy, invalid: !!errorText }) : children}
      {helperText && <span id={helpId} style={{ fontFamily: "var(--font-body)", fontSize: "var(--paragraph-xs-size)", color: "var(--text-empty-body)" }}>{helperText}</span>}
      {errorText && <span id={errId} style={{ fontFamily: "var(--font-data)", fontSize: "var(--label-xs-size)", fontWeight: "var(--font-weight-bold)", letterSpacing: "var(--tracking-data)", textTransform: "uppercase", color: "var(--text-negative)" }}>{errorText}</span>}
    </div>
  );
}
