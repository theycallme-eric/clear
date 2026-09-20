import React from "react";

/**
 * OverflowRail — keeps a row of peer items reachable when the width can't hold
 * them. Containment, horizontal scrolling, edge cues, active-item reveal.
 *
 * It owns behaviour, not meaning. It renders no role of its own: whatever
 * semantics the consumer needs — tablist, navigation, plain group — are passed
 * through `trackProps` onto the element that directly contains the items, so
 * `role="tablist"` still has `role="tab"` children as its immediate descendants.
 * TabBar composes this and keeps every bit of its tabs contract; a route nav
 * composes it inside <nav>. The rail never decides which of those you are.
 *
 * Reachability is not an opt-in. The rail is inert while everything fits and
 * engages the moment it doesn't — there is no prop to turn scrolling on, because
 * a prop is a thing a consumer can forget and then ship an unreachable
 * destination.
 *
 * KEYBOARD: the rail deliberately adds NO tab stop of its own. Its items are
 * focusable (tabs, links, buttons), and focusing an item that sits outside the
 * viewport scrolls it in natively — so the content is already reachable, and a
 * tabbable wrapper would only add a stop that competes with a roving tabindex.
 * The edge cues are pointer affordances: aria-hidden, never focusable.
 */
export function OverflowRail({
  children,
  activeIndex,
  gap = "var(--spacing-600)",
  revealPadding = 24,
  trackProps = {},
  className = "",
  style,
  ...props
}) {
  const scrollerRef = React.useRef(null);
  const trackRef = React.useRef(null);
  const mounted = React.useRef(false);
  const frame = React.useRef(0);
  const [cue, setCue] = React.useState({ start: false, end: false });

  const measure = React.useCallback(() => {
    const s = scrollerRef.current;
    if (!s) return;
    // abs() so the same test holds in RTL, where scrollLeft runs negative.
    const pos = Math.abs(s.scrollLeft);
    const max = s.scrollWidth - s.clientWidth;
    // 1px slack: fractional layout widths otherwise leave a cue permanently lit.
    setCue({ start: pos > 1, end: pos < max - 1 });
  }, []);

  /* Read on the next frame rather than inside the event. A scroll event can be
     delivered before the browser has settled the final offset — sampling then
     leaves a cue showing the previous position until something else nudges it.
     One frame later the geometry is stable. */
  const scheduleMeasure = React.useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      measure();
    });
  }, [measure]);

  React.useEffect(() => {
    const s = scrollerRef.current;
    const t = trackRef.current;
    if (!s || !t) return;
    measure();
    s.addEventListener("scroll", scheduleMeasure, { passive: true });
    let ro;
    if (typeof ResizeObserver !== "undefined") {
      // Both boxes: the viewport changing and the content changing are
      // independent reasons for a cue to appear.
      ro = new ResizeObserver(scheduleMeasure);
      ro.observe(s);
      ro.observe(t);
    }
    return () => {
      s.removeEventListener("scroll", scheduleMeasure);
      if (ro) ro.disconnect();
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [measure, scheduleMeasure]);

  const scrollBy = (delta, smooth) => {
    const s = scrollerRef.current;
    if (!s) return;
    const reduce =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    s.scrollTo({ left: s.scrollLeft + delta, behavior: smooth && !reduce ? "smooth" : "auto" });
  };

  // Reveal the active item. Rect maths rather than offsetLeft, which is measured
  // against whichever ancestor happens to be positioned.
  React.useEffect(() => {
    const s = scrollerRef.current;
    const t = trackRef.current;
    if (!s || !t || activeIndex == null) return;
    const el = t.children[activeIndex];
    if (!el) return;
    const sr = s.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const pad = revealPadding;
    let delta = 0;
    if (er.left < sr.left + pad) delta = er.left - sr.left - pad;
    else if (er.right > sr.right - pad) delta = er.right - sr.right + pad;
    if (delta) scrollBy(delta, mounted.current);
    mounted.current = true;
    // Children can change without a scroll or a resize — re-checking here keeps
    // the cue honest when the item set itself changes.
    scheduleMeasure();
  }, [activeIndex, revealPadding, children, scheduleMeasure]);

  const page = (dir) => {
    const s = scrollerRef.current;
    if (!s) return;
    scrollBy(dir * Math.max(s.clientWidth * 0.8, 120), true);
  };

  return (
    <div
      className={"clr-rail " + className}
      style={{ position: "relative", minWidth: 0, ...style }}
      {...props}
    >
      <div ref={scrollerRef} className="clr-rail__scroller">
        <div
          ref={trackRef}
          {...trackProps}
          style={{ display: "flex", gap, width: "max-content", minWidth: "100%", ...trackProps.style }}
        >
          {children}
        </div>
      </div>
      <Cue side="start" on={cue.start} onClick={() => page(-1)} />
      <Cue side="end" on={cue.end} onClick={() => page(1)} />
    </div>
  );
}

/**
 * A hard structural edge rule plus a stepped chevron — the same angular
 * vocabulary as the rest of the system. Deliberately not a fade: a gradient
 * would soften an edge CLEAR draws sharp everywhere else, and it reads as a
 * rendering artefact rather than as "there is more this way".
 */
function Cue({ side, on, onClick }) {
  const start = side === "start";
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      onClick={onClick}
      className="clr-rail__cue"
      data-side={side}
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        [start ? "left" : "right"]: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        padding: 0,
        border: 0,
        [start ? "borderRight" : "borderLeft"]:
          "var(--border-width) solid var(--border-rail-cue)",
        background: "var(--surface-rail-cue)",
        color: "var(--text-rail-cue)",
        cursor: "pointer",
        opacity: on ? 1 : 0,
        pointerEvents: on ? "auto" : "none",
        transition: "opacity var(--dur-state) var(--ease-mech)",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d={start ? "M17 3L7 10.5V13.5L17 21V16L11 12L17 8V3Z" : "M7 3L17 10.5V13.5L7 21V16L13 12L7 8V3Z"} />
      </svg>
    </button>
  );
}
