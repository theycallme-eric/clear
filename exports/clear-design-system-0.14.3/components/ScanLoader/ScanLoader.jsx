import React from "react";
import { Progress } from "../Progress/Progress";

export function ScanLoader({
  label = "Scanning",
  lines = [],
  value,
  max,
  status = "ok",
  className = "",
  style,
  ...props
}) {
  const determinate = typeof value === "number" && typeof max === "number" && max > 0;
  const pct = determinate ? Math.round((value / max) * 100) : undefined;
  const busy = status !== "failed";

  return (
    <div className="clr-bleed clr-bleed--block" style={{ "--bleed": "var(--border-card)" }}>
    <div className="clr-card"><span className="clr-card__bar" aria-hidden="true"></span>
    <div
      /* A failed check glitches once: glitch means failure. */
      className={["clr-chamfer", "clr-chamfer--lg", "clr-card__body", "clr-scan", status === "failed" ? "clr-glitch" : "", className].filter(Boolean).join(" ")}
      /* The region announces itself as busy, and its label updates politely.
         Individual rows are not announced — a boot log read aloud line by line
         is noise, not information. */
      role="status"
      aria-live="polite"
      aria-busy={busy}
      style={{ padding: "var(--spacing-400) var(--spacing-500)", ...style }}
      {...props}
    >
      <span className="clr-scan-band" aria-hidden="true"></span>
      <div className="label" style={{ marginBottom: lines.length || determinate ? "var(--spacing-200)" : 0 }}>
        {label}
        <span className="" aria-hidden="true">…</span>
      </div>

      {determinate && (
        <Progress value={value} max={max} aria-label={typeof label === "string" ? label : undefined} style={{ marginBottom: "var(--spacing-200)" }} />
      )}

      {lines.length > 0 && (
        <div className="clr-boot" aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-100)" }}>
          {lines.map((l, i) => (
            <div key={i} style={{ fontFamily: "var(--font-data)", fontSize: "var(--label-xs-size)", fontWeight: "var(--font-weight-bold)", letterSpacing: "var(--tracking-data)", textTransform: "uppercase", color: "var(--text-scan-line)" }}>
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
    </div>
    </div>
  );
}
