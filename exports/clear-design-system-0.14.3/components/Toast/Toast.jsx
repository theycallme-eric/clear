import React from "react";

const X = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M12 8.6 18.6 2 22 5.4 15.4 12 22 18.6 18.6 22 12 15.4 5.4 22 2 18.6 8.6 12 2 5.4 5.4 2z" />
  </svg>
);

/* Severity glyphs. Border hue alone cannot carry severity — it collapses
   entirely in the mono skin and is weak for red-green deficiency in the colour
   skins. Drawn in CLEAR construction: solid fill, orthogonal + 45° only, no
   circles, distinct silhouettes so they separate by SHAPE and not just tone. */
const GLYPH = {
  /* Square badge with a cut-out bar — a stamped "i". */
  info: "M2 2h20v20H2V2zm8.75 5h2.5v2.5h-2.5V7zm0 4.5h2.5V17h-2.5v-5.5z",
  /* Thick two-segment tick, square ends, 45° bend. */
  positive: "M9.6 20.4 2.4 13.2l3.4-3.4 3.8 3.8L18.2 3l3.4 3.4z",
  /* Triangle with the exclamation cut through it. */
  negative: "M12 2.5 23 21.5H1L12 2.5zm-1.3 7 .4 6h1.8l.4-6h-2.6zm.05 7.5V19.5h2.5V17h-2.5z",
};

const VARIANTS = {
  info: { surface: "var(--surface-toast-info)", border: "var(--border-toast-info)", icon: "var(--icon-toast-info)", evenOdd: true },
  positive: { surface: "var(--surface-toast-positive)", border: "var(--border-toast-positive)", icon: "var(--icon-toast-positive)", evenOdd: false },
  negative: { surface: "var(--surface-toast-negative)", border: "var(--border-toast-negative)", icon: "var(--icon-toast-negative)", evenOdd: true },
};

export function Toast({
  children,
  variant = "info",
  actionLabel,
  onAction,
  onDismiss,
  className = "",
  style,
  ...props
}) {
  const v = VARIANTS[variant] ?? VARIANTS.info;
  // Only failures interrupt. Everything else waits for a gap in speech —
  // announcing every confirmation assertively trains people to ignore alerts.
  const isAlert = variant === "negative";
  // Leaving is phosphor decay, built in: dismiss plays it, then calls onDismiss.
  // The timer is the fallback for reduced motion, where no animation ends.
  const [leaving, setLeaving] = React.useState(false);
  const done = React.useRef(false);
  const finish = () => { if (done.current) return; done.current = true; onDismiss && onDismiss(); };
  const dismiss = () => { if (leaving) return; setLeaving(true); setTimeout(finish, 260); };

  return (
    <div className="clr-bleed clr-bleed--block" style={{ "--bleed": v.border }}>
      <div
        role={isAlert ? "alert" : "status"}
        aria-live={isAlert ? "assertive" : "polite"}
        className={["clr-chamfer", "clr-chamfer--md", leaving ? "clr-phosphor-out" : "clr-phosphor-in", className].filter(Boolean).join(" ")}
        onAnimationEnd={(e) => { if (leaving && e.target === e.currentTarget) finish(); }}
        style={{
          "--surface": v.surface,
          "--brd": v.border,
          display: "flex",
          alignItems: "center",
          gap: "var(--spacing-400)",
          minHeight: 64,
          padding: "var(--spacing-300) var(--spacing-400)",
          ...style,
        }}
        {...props}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "0 0 auto", width: "var(--icon-size)", height: "var(--icon-size)", fill: v.icon }}>
          <path fillRule={v.evenOdd ? "evenodd" : undefined} d={GLYPH[variant] ?? GLYPH.info} />
        </svg>
        {/* 1 1 auto, not flex: 1. A zero basis let a shrink-to-fit toast size itself
            as if the message had no width, so it wrapped with room to spare. */}
        <span style={{ flex: "1 1 auto", minWidth: 0, fontFamily: "var(--font-body)", fontSize: "var(--paragraph-sm-size)", fontWeight: "var(--font-weight-medium)", color: "var(--fg)" }}>
          {children}
        </span>
        {actionLabel && (
          <button
            type="button"
            onClick={onAction}
            className="cta"
            style={{ background: "transparent", border: 0, color: "var(--text-cta)", cursor: "pointer", fontSize: "var(--label-sm-size)", padding: "var(--spacing-100)", minHeight: "var(--control-height)", whiteSpace: "nowrap" }}
          >
            {actionLabel}
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="clr-hit"
            style={{ background: "transparent", border: 0, color: "var(--text-disabled)", cursor: "pointer", padding: "var(--spacing-100)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          >
            <X />
          </button>
        )}
      </div>
    </div>
  );
}
