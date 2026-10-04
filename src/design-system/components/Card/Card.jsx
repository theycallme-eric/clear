import React from "react";

/**
 * Card: a frame with the 12px accent bar and a heading inside it. Holds one
 * thing or one group: a list, a status, a form, a readout. Every card carries
 * the bar; the bar has no colour of its own and follows the card's role.
 *
 * A card holds content and element frames (chips, buttons, fields), never
 * another card. Sub-groups inside a card use a rule under a heading.
 * For a bare frame with no bar or heading, use ChamferedFrame.
 */
const sizeForHeight = (h) => (h < 80 ? "sm" : h <= 140 ? "md" : "lg");
const ROLES = ["structure", "interaction", "selection", "urgency", "info", "timer", "timer-low"];
const PAD = { sm: "var(--spacing-200) var(--spacing-300)", md: "var(--spacing-300)", lg: "var(--spacing-400)" };

export function Card({ heading, meta, role, cornerSize = "auto", padding = "md", className = "", style, children, ...props }) {
  const ref = React.useRef(null);
  const [auto, setAuto] = React.useState("md");
  React.useEffect(() => {
    if (cornerSize !== "auto" || typeof ResizeObserver === "undefined" || !ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver(() => setAuto(sizeForHeight(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [cornerSize]);
  const size = cornerSize === "auto" ? auto : cornerSize;
  const r = ROLES.includes(role) ? role : null;
  const bleed = r ? (r.startsWith("timer") ? "var(--border-" + r + ")" : "var(--border-frame-" + r + ")") : "var(--border-card)";

  return (
    <div className="clr-bleed clr-bleed--block" style={{ "--bleed": bleed }}>
      <div className="clr-card">
        <span className="clr-card__bar" aria-hidden="true"></span>
        <div ref={ref} {...props}
          className={["clr-chamfer", "clr-chamfer--" + size, r ? "clr-chamfer--" + r : "", "clr-card__body", className].filter(Boolean).join(" ")}
          style={{ padding: PAD[padding] || PAD.md,
            /* Bottom padding keeps the corner as clear as the sides: content's
               bottom-right corner sits one side-padding away from the cut, which
               needs bottom ≥ cut + side × (√2 − 1). Every corner size. */
            paddingBottom: "max(" + (PAD[padding] || PAD.md).split(" ")[0] + ", calc(var(--chamfer-" + size + ") + " + ((PAD[padding] || PAD.md).split(" ")[1] || (PAD[padding] || PAD.md)) + " * 0.414))",
            display: "flex", flexDirection: "column", gap: "var(--spacing-200)", ...style }}>
          {(heading || meta) && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "var(--spacing-300)" }}>
              {heading && <span className="label" style={{ color: "var(--text-card-label)" }}>{heading}</span>}
              {meta && <span className="label" style={{ color: "var(--text-secondary)" }}>{meta}</span>}
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
