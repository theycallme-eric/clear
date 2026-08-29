import React from "react";

export function Chip({
  selected = false,
  disabled = false,
  onClick,
  children,
  className = "",
  style,
  ...props
}) {
  const [flick, setFlick] = React.useState(false);
  const handleClick = (ev) => {
    if (disabled) return;
    setFlick(false);
    requestAnimationFrame(() => setFlick(true));
    // Consumer handler runs regardless of our own state work.
    if (onClick) onClick(ev);
  };
  const cls = [
    "clr-chamfer",
    "clr-chamfer--sm",
    selected ? "clr-chamfer--selected" : "",
    flick ? "clr-interlace" : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <button
      type="button"
      /* A chip is a toggle, so pressed state — not a checkbox, not a tab. */
      aria-pressed={selected}
      disabled={disabled}
      onClick={handleClick}
      onAnimationEnd={() => setFlick(false)}
      className={cls}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--spacing-200)",
        minHeight: 40,
        fontFamily: "var(--font-data)",
        fontSize: "var(--label-sm-size)",
        lineHeight: "var(--label-sm-line-height)",
        fontWeight: "var(--font-weight-bold)",
        textTransform: "uppercase",
        letterSpacing: "var(--tracking-data)",
        color: disabled
          ? "var(--text-disabled)"
          : selected
          ? "var(--text-selected)"
          : "var(--text-unselected)",
        padding: "var(--spacing-200) var(--spacing-400)",
        background: "transparent",
        border: 0,
        cursor: disabled ? "not-allowed" : "pointer",
        ...(disabled ? { "--surface": "var(--surface-disabled)", "--brd": "var(--border-disabled)" } : null),
        ...style,
      }}
      {...props}
    >
      {/* Second, non-colour cue: a solid tick appears when selected. Anyone who
          cannot separate the green from the unselected tint still sees a mark. */}
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        width="10"
        height="10"
        style={{
          flex: "0 0 auto",
          fill: "currentColor",
          opacity: selected ? 1 : 0,
          width: selected ? 10 : 0,
          transition: "opacity var(--dur-state) var(--ease-mech), width var(--dur-state) var(--ease-mech)",
        }}
      >
        <path d="M9.6 20.4 2.4 13.2l3.4-3.4 3.8 3.8L18.2 3l3.4 3.4z" />
      </svg>
      {children}
    </button>
  );
}
