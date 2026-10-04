import React from "react";

const CHAMFER = { sm: "clr-chamfer--sm", md: "clr-chamfer--md", lg: "clr-chamfer--lg" };

/* Each variant is a .clr-btn modifier. Surface and border live in CSS rather
   than as inline --surface/--brd, because an inline value would beat every
   :hover and :active rule. That is why Button had no hover or press state
   before 0.8.0. */
const VARIANT = {
  primary: "clr-btn--primary",
  secondary: "",
  quiet: "clr-btn--quiet",
  critical: "clr-btn--critical",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  disabled = false,
  icon,
  iconOnly = false,
  children,
  type = "button",
  className = "",
  style,
  buttonRef,
  ...props
}) {
  const v = VARIANT[variant] ?? VARIANT.secondary;
  const off = disabled || loading;
  const pad = size === "lg" ? "var(--spacing-400) var(--spacing-600)"
    : size === "sm" ? "var(--spacing-200) var(--spacing-300)"
    : "var(--spacing-300) var(--spacing-500)";

  const button = (
    <button
      ref={buttonRef}
      type={type}
      disabled={off}
      /* Busy rather than disabled-with-no-explanation: the control keeps its
         accessible name and announces that work is in flight. */
      aria-busy={loading || undefined}
      className={["clr-chamfer", CHAMFER[size] ?? CHAMFER.md, "clr-btn", v, className].filter(Boolean).join(" ")}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: iconOnly ? 0 : "var(--spacing-200)",
        minHeight: "var(--control-height)",
        minWidth: iconOnly ? "var(--control-height)" : undefined,
        padding: iconOnly ? "var(--spacing-200)" : pad,
        fontFamily: "var(--font-data)",
        fontSize: size === "lg" ? "var(--label-md-size)" : "var(--label-sm-size)",
        fontWeight: "var(--font-weight-bold)",
        letterSpacing: "var(--tracking-data)",
        textTransform: "uppercase",
        background: "transparent",
        border: 0,
        cursor: off ? "not-allowed" : "pointer",
        ...style,
      }}
      {...props}
    >
      {/* Loading shows a scan sweeping the surface (.clr-btn[aria-busy]); the
          label stays, so the control keeps saying what it does. */}
      {!loading && icon}
      {!iconOnly && children}
    </button>
  );
  // Only the primary action glows. The glow sits on an unclipped wrapper so the
  // chamfer's own clip can't cut it off.
  // Every button bleeds 2px; the primary adds its 6px glow on the same wrapper.
  const bleed = off ? "var(--border-disabled)" : variant === "critical" ? "var(--border-toast-negative)" : variant === "quiet" ? "transparent" : "var(--border-cta-primary)";
  return <span className={"clr-bleed" + (variant === "primary" ? " clr-glow" : "")} style={{ "--bleed": bleed }}>{button}</span>;
}

/** Icon-only button. Requires an accessible name via `aria-label`. */
export function IconButton({ label, icon, className = "", ...props }) {
  return (
    <Button
      iconOnly
      icon={icon}
      aria-label={label}
      className={["clr-hit", className].filter(Boolean).join(" ")}
      {...props}
    />
  );
}
