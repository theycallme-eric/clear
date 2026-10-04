import React from "react";
export function TimerDisplay({ seconds = 0, lowThreshold = 10, size = "md", label = "Time remaining", className = "", style, ...props }) {
  const low = seconds <= lowThreshold;
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(Math.floor(seconds % 60)).padStart(2, "0");
  const chars = (mm + ":" + ss).split("");
  return (
    <span className={"clr-bleed" + (low ? " clr-pulse-micro" : "")} style={{ "--bleed": low ? "var(--border-timer-low)" : "var(--border-timer)" }}>
    {/* A card: the accent bar follows the timer's colour and its low state. */}
    <span className="clr-card"><span className="clr-card__bar" aria-hidden="true"></span>
    <div className={["clr-chamfer clr-chamfer--md clr-card__body", low ? "clr-chamfer--timer-low" : "clr-chamfer--timer", className].filter(Boolean).join(" ")}
      /* Labelled once, and NOT a live region: announcing every second makes the
         rest of the screen unusable with a screen reader. The label carries the
         meaning; consumers announce milestones themselves if they need to. */
      role="timer"
      aria-label={label}
      style={{ display: "inline-flex", justifyContent: "center", padding: "var(--spacing-200) var(--spacing-500)", ...style }}
      {...props}>
      <span aria-hidden="true" style={{ fontFamily: "var(--font-data)", fontWeight: "var(--font-weight-bold)", fontSize: size === "lg" ? 40 : 24, letterSpacing: "var(--tracking-data)",
        color: low ? "var(--text-timer-low)" : "var(--text-timer)", display: "inline-flex",
        /* Digits change colour on the same schedule as the frame (--dur-alert). */
        transition: "color var(--dur-alert) var(--step-4)" }}>
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
    </span>
    </span>
  );
}
