import React from "react";

/**
 * ChamferedFrame: a thin wrapper over the .clr-chamfer classes.
 *
 * Before 0.9.1 this drew its own SVG frame, which drifted from the CSS frame
 * (no surface scanlines, a different glow). It now renders the same classes,
 * so a card looks identical whichever way it was built.
 *
 * Role coherence: `role` sets both layers from one role. `borderColor` alone
 * derives a 10% surface from it. `surfaceColor` / `borderColor` stay as
 * escape hatches.
 */
const SIZE = { sm: "clr-chamfer--sm", md: "clr-chamfer--md", lg: "clr-chamfer--lg" };
const ROLES = ["structure", "interaction", "selection", "urgency", "info"];

/* Corner size by card height: under 80px small, up to 140px medium, above
   large. So similar cards always get the same corner. */
const sizeForHeight = (h) => (h < 80 ? "sm" : h <= 140 ? "md" : "lg");

export function ChamferedFrame({
  cornerSize = "auto",
  role,
  surfaceColor,
  borderColor,
  borderWidth = 2,
  scan = false,
  trace = true,
  className = "",
  style,
  contentStyle,
  children,
  ...props
}) {
  const ref = React.useRef(null);
  const [autoSize, setAutoSize] = React.useState("md");
  React.useEffect(() => {
    if (cornerSize !== "auto" || typeof ResizeObserver === "undefined") return;
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAutoSize(sizeForHeight(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [cornerSize]);
  const size = cornerSize === "auto" ? autoSize : cornerSize;

  const vars = {};
  if (borderColor) vars["--brd"] = borderColor;
  if (surfaceColor) vars["--surface"] = surfaceColor;
  else if (borderColor && !role) vars["--surface"] = `rgb(from ${borderColor} r g b / 0.10)`;
  if (borderWidth !== 2) vars["--bw"] = borderWidth + "px";

  const cls = [
    "clr-chamfer",
    SIZE[size] ?? SIZE.md,
    ROLES.includes(role) ? "clr-chamfer--" + role : "",
    scan ? "clr-scan" : "",
    trace ? "clr-trace" : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <div className="clr-bleed clr-bleed--block" style={{ "--bleed": borderColor || (ROLES.includes(role) ? "var(--border-frame-" + role + ")" : "var(--border-card)") }}>
      <div ref={ref} className={cls} style={{ ...vars, paddingBottom: "calc(var(--chamfer-" + size + ") + var(--spacing-300) * 0.414)", ...style }} {...props}>
        {scan && <div className="clr-scan-band" aria-hidden="true"></div>}
        <div style={{ position: "relative", ...contentStyle }}>{children}</div>
      </div>
    </div>
  );
}
