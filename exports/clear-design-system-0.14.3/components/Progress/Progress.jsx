import React from "react";

export function Progress({
  value,
  max = 100,
  label,
  showValue = false,
  segments = 20,
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
        style={{ display: "flex", gap: 2, height: 8, position: "relative", overflow: "hidden" }}
        {...props}
      >
        {/* Segmented, never a continuous fill: each segment is lit or not. The
            indeterminate state steps a lit block of segments across. */}
        {Array.from({ length: Math.max(1, segments) }).map((_, i) => {
          const n = Math.max(1, segments);
          const lit = determinate ? i < Math.round((pct / 100) * n) : false;
          return <span key={i} style={{ flex: 1, background: lit ? "var(--surface-thumb)" : "var(--surface-track)" }}></span>;
        })}
        {!determinate && (
          <span aria-hidden="true" style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "35%", background: "var(--surface-thumb)", animation: "clr-progress-indet var(--dur-scan) var(--step-8) infinite" }}></span>
        )}
      </div>
    </div>
  );
}
