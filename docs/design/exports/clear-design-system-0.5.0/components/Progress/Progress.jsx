import React from "react";

export function Progress({
  value,
  max = 100,
  label,
  showValue = false,
  segments = 0,
  className = "",
  style,
  ...props
}) {
  const determinate = typeof value === "number";
  const pct = determinate ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;

  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-100)", ...style }}>
      {(label || showValue) && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--spacing-200)" }}>
          {label && <span className="label">{label}</span>}
          {showValue && determinate && (
            <span className="label" style={{ color: "var(--text-cta)" }}>{Math.round(pct)}%</span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={determinate ? value : undefined}
        aria-valuemin={determinate ? 0 : undefined}
        aria-valuemax={determinate ? max : undefined}
        aria-label={typeof label === "string" ? label : undefined}
        aria-busy={!determinate || undefined}
        style={{ height: 6, background: "var(--surface-track)", position: "relative", overflow: "hidden" }}
        {...props}
      >
        {/* Stepped fill, never a smooth glide — progress in this system ticks. */}
        <div style={{
          width: determinate ? pct + "%" : "35%",
          height: "100%",
          background: "var(--surface-thumb)",
          transition: "width var(--dur-state) var(--step-8)",
          ...(determinate ? null : { animation: "clr-progress-indet var(--dur-scan) var(--step-8) infinite" }),
        }}></div>
        {segments > 1 && (
          // Tick marks read as an instrument scale rather than a gradient bar.
          <div aria-hidden="true" style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: `repeat(${segments}, 1fr)` }}>
            {Array.from({ length: segments }).map((_, i) => (
              <span key={i} style={{ borderRight: i < segments - 1 ? "var(--border-width) solid var(--bg)" : "none" }}></span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
