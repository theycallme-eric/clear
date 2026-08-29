import { useEffect, useId, useRef, useState } from "react";

/**
 * ChamferedFrame — the signature CLEAR container. Bottom-right corner cut at 45°,
 * with a border that follows the diagonal.
 *
 * SVG double-width-stroke + clip technique: stroke the outline at 2× the target
 * width, clip to the shape, and the outer half is discarded — leaving a perfectly
 * uniform inner border with mitred corners no CSS approach matches.
 *
 * Two clips are in play and they must not collide: the mitre clip lives on a <g>
 * wrapper as an SVG attribute, the trace reveal lives on the path as a CSS
 * clip-path. Putting both on one element loses the mitre — CSS wins over the
 * presentation attribute.
 *
 * Motion is baked in (per system default): the frame traces itself on, content
 * materializes in stepped frames, and colour changes drift over 1s — the single
 * slow animation in the system.
 *
 * Layout note: children sit inside a positioned content wrapper, so `display:
 * flex` on the frame itself lays out that wrapper, not the children. Pass layout
 * through `contentStyle` instead.
 *
 * SVG geometry (the 45° path, the 2× stroke) is computed from measured pixels
 * rather than tokens — an internal implementation exception, documented here.
 */

const SIZE_MAP = { sm: 8, md: 12, lg: 24, xl: 32 };

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function ChamferedFrame({
  cornerSize = "md",
  surfaceColor = "var(--surface-card)",
  borderColor = "var(--border-card)",
  borderWidth = 2,
  hasLeftBorder = false,
  bottomBorderOnly = false,
  scan = false,
  trace = true,
  glow = false,
  className = "",
  style,
  contentStyle,
  children,
  ...props
}) {
  const ref = useRef(null);
  const [{ width: w, height: h }, setDims] = useState({ width: 0, height: 0 });
  const [traced, setTraced] = useState(false);
  const clipId = `chamfer-${useId().replace(/:/g, "")}`;
  const s = SIZE_MAP[cornerSize] ?? SIZE_MAP.md;

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const measure = () => setDims({ width: el.offsetWidth, height: el.offsetHeight });
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!trace || reducedMotion()) { setTraced(true); return; }
    const t = setTimeout(() => setTraced(true), 20);
    return () => clearTimeout(t);
  }, [trace]);

  const shapePath = `M 0 0 L ${w} 0 L ${w} ${h - s} L ${w - s} ${h} L 0 ${h} Z`;

  const strokePath = bottomBorderOnly
    ? `M 0 ${h} L ${w - s} ${h} L ${w} ${h - s}`
    : hasLeftBorder
    ? shapePath
    : `M 0 0 L ${w} 0 L ${w} ${h - s} L ${w - s} ${h} L 0 ${h}`;

  const clipStyle =
    w > 0 && h > 0
      ? { clipPath: `polygon(0 0, ${w}px 0, ${w}px ${h - s}px, ${w - s}px ${h}px, 0 ${h}px)` }
      : undefined;

  return (
    <div
      ref={ref}
      className={className}
      style={{
        position: "relative",
        isolation: "isolate",
        ...(glow ? { filter: `drop-shadow(0 0 8px ${borderColor})` } : null),
        ...style,
        ...clipStyle,
      }}
      {...props}
    >
      {w > 0 && h > 0 && (
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "hidden", zIndex: 0 }}
        >
          <defs>
            <clipPath id={clipId}>
              <path d={shapePath} />
            </clipPath>
          </defs>
          <path d={shapePath} stroke="none" style={{ fill: surfaceColor, transition: "fill var(--dur-atmos) var(--ease-drift)" }} />
          <g clipPath={`url(#${clipId})`}>
            <path
              d={strokePath}
              fill="none"
              strokeWidth={borderWidth * 2}
              strokeLinecap="butt"
              strokeLinejoin="miter"
              style={{
                stroke: borderColor,
                clipPath: traced ? "inset(0 0 0 0)" : "inset(0 100% 0 0)",
                transition:
                  "stroke var(--dur-atmos) var(--ease-drift), clip-path var(--dur-slow) var(--step-24)",
              }}
            />
          </g>
        </svg>
      )}
      {scan && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute", left: 0, right: 0, top: 0, height: "24%", zIndex: 2, pointerEvents: "none",
            background: `linear-gradient(to bottom, transparent, ${borderColor}38, transparent)`,
            animation: "clr-scan-sweep var(--dur-scan) linear infinite",
          }}
        />
      )}
      <div style={{ position: "relative", zIndex: 1, height: "100%", ...contentStyle }}>{children}</div>
    </div>
  );
}
