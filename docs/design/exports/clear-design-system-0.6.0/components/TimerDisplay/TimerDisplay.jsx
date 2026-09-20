import React from "react";
export function TimerDisplay({ seconds = 0, lowThreshold = 10, size = "md", label = "Time remaining", className = "", style, ...props }) {
  const low = seconds <= lowThreshold;
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(Math.floor(seconds % 60)).padStart(2, "0");
  const chars = (mm + ":" + ss).split("");
  return (
    <div className={["clr-chamfer clr-chamfer--md", low ? "clr-chamfer--timer-low pulse-micro" : "clr-chamfer--timer", className].filter(Boolean).join(" ")}
      /* Labelled once, and NOT a live region: announcing every second makes the
         rest of the screen unusable with a screen reader. The label carries the
         meaning; consumers announce milestones themselves if they need to. */
      role="timer"
      aria-label={label}
      style={{ display: "inline-flex", justifyContent: "center", padding: "var(--spacing-200) var(--spacing-500)", ...style }}
      {...props}>
      <span aria-hidden="true" style={{ fontFamily: "var(--font-data)", fontWeight: "var(--font-weight-bold)", fontSize: size === "lg" ? 40 : 24, letterSpacing: "0.06em",
        color: low ? "var(--text-timer-low)" : "var(--text-timer)", display: "inline-flex" }}>
        {/* Digits are decorative; the accessible value is the text below. */}
        {chars.map((c, i) => (
          <span key={i + "-" + c} className={c === ":" ? undefined : "clr-tumble"}
            style={{ display: "inline-block", minWidth: c === ":" ? undefined : "0.62em", textAlign: "center" }}>{c}</span>
        ))}
      </span>
      <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clipPath: "inset(50%)", whiteSpace: "nowrap" }}>
        {mm}:{ss}
      </span>
    </div>
  );
}
