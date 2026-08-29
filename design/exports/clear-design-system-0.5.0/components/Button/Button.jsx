import React from "react";

const CHAMFER = { sm: "clr-chamfer--sm", md: "clr-chamfer--md", lg: "clr-chamfer--lg" };

const SURFACE = {
  primary: { surface: "var(--surface-cta-primary)", brd: "var(--border-cta-primary)", color: "var(--text-cta)" },
  secondary: { surface: "var(--surface-cta-secondary)", brd: "var(--border-cta-secondary)", color: "var(--text-cta)" },
  quiet: { surface: "transparent", brd: "transparent", color: "var(--text-cta)" },
  critical: { surface: "var(--surface-toast-negative)", brd: "var(--border-toast-negative)", color: "var(--text-negative)" },
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
  const v = SURFACE[variant] ?? SURFACE.secondary;
  const off = disabled || loading;
  const pad = size === "lg" ? "var(--spacing-400) var(--spacing-600)"
    : size === "sm" ? "var(--spacing-200) var(--spacing-300)"
    : "var(--spacing-300) var(--spacing-500)";

  return (
    <button
      ref={buttonRef}
      type={type}
      disabled={off}
      /* Busy rather than disabled-with-no-explanation: the control keeps its
         accessible name and announces that work is in flight. */
      aria-busy={loading || undefined}
      className={["clr-chamfer", CHAMFER[size] ?? CHAMFER.md, className].filter(Boolean).join(" ")}
      style={{
        "--surface": off ? "var(--surface-disabled)" : v.surface,
        "--brd": off ? "var(--border-disabled)" : v.brd,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: iconOnly ? 0 : "var(--spacing-200)",
        minHeight: 40,
        minWidth: iconOnly ? 40 : undefined,
        padding: iconOnly ? "var(--spacing-200)" : pad,
        fontFamily: "var(--font-data)",
        fontSize: size === "lg" ? "var(--label-md-size)" : "var(--label-sm-size)",
        fontWeight: "var(--font-weight-bold)",
        letterSpacing: "var(--tracking-data-wide)",
        textTransform: "uppercase",
        color: off ? "var(--text-disabled)" : v.color,
        background: "transparent",
        border: 0,
        cursor: off ? "not-allowed" : "pointer",
        transition: "color var(--dur-state) var(--ease-mech)",
        ...style,
      }}
      {...props}
    >
      {loading ? (
        // Stepped bracket, not a spinner. This system has no spinners.
        <span className="clr-load-ticks" aria-hidden="true"></span>
      ) : (
        icon
      )}
      {!iconOnly && children}
    </button>
  );
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
