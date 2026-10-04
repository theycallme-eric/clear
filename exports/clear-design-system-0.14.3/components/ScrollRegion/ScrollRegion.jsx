import React from "react";

/**
 * ScrollRegion: a vertically scrolling area inside a fixed shell, with
 * optional layers pinned to its top and bottom edges.
 *
 * It is the vertical counterpart of OverflowRail. It handles behaviour only and
 * carries no navigation or product meaning.
 *
 * EDGE MODEL. Content is clipped at a hard rule and never passes under a pinned
 * layer. The scroller starts below the head and ends above the foot, so the
 * layers need no surface and the atmosphere shows through them. There is no
 * fade: CLEAR draws edges sharp. Motion is indicated by a streak on each edge.
 * The streaks are invisible at rest, light up while scrolling, and settle
 * --dur-streak-settle after the last scroll event.
 *
 * MEASUREMENT. Layer heights are measured and published as --head-h and
 * --foot-h on the wrapper; they are never guessed. The scroller stays hidden
 * until the first real measurement, and there is no fallback length. A
 * mounted layer measuring 0 means layout has not resolved yet, so the zero is
 * never published. ResizeObserver, font loading and mount are the primary
 * triggers. A bounded timer retry runs only when all of those report zero.
 * Once measured, the region is never hidden again.
 */
const RETRY_MAX = 30;
// Fallback retry backoff: first wait, and the ceiling it doubles up to.
const RETRY_FIRST_MS = 16;
const RETRY_CAP_MS = 200;

export function ScrollRegion({
  title,
  actions,
  head,
  headRule = true,
  foot,
  children,
  className = "",
  style,
  scrollerProps = {},
  ...props
}) {
  const wrapRef = React.useRef(null);
  const headRef = React.useRef(null);
  const footRef = React.useRef(null);
  const scrollerRef = React.useRef(null);
  const settleRef = React.useRef(0);
  const [measured, setMeasured] = React.useState(false);
  const [scrolling, setScrolling] = React.useState(false);

  const hasHead = !!(title || actions || head);
  const hasFoot = !!foot;

  // Returns true when every mounted layer has a real, non-zero height.
  const publish = React.useCallback(() => {
    const w = wrapRef.current;
    if (!w) return false;
    const read = (el) => (el ? el.getBoundingClientRect().height : 0);
    const h = hasHead ? read(headRef.current) : 0;
    const f = hasFoot ? read(footRef.current) : 0;
    if ((hasHead && !h) || (hasFoot && !f)) return false;
    w.style.setProperty("--head-h", h + "px");
    w.style.setProperty("--foot-h", f + "px");
    setMeasured(true);
    return true;
  }, [hasHead, hasFoot]);

  React.useEffect(() => {
    let cancelled = false;
    let timer = 0;
    let tries = 0;
    // Fallback only: 16ms rising to 200ms, at most RETRY_MAX attempts. Some
    // hosts don't fire ResizeObserver on mount; this covers them without
    // making every consumer poll.
    const retry = () => {
      if (cancelled || publish() || ++tries >= RETRY_MAX) return;
      timer = setTimeout(retry, Math.min(RETRY_FIRST_MS * 2 ** (tries - 1), RETRY_CAP_MS));
    };
    if (!publish()) timer = setTimeout(retry, RETRY_FIRST_MS);

    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => publish());
      if (headRef.current) ro.observe(headRef.current);
      if (footRef.current) ro.observe(footRef.current);
      if (wrapRef.current) ro.observe(wrapRef.current);
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => !cancelled && publish());

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (ro) ro.disconnect();
    };
  }, [publish]);

  // Re-measure after every render too: slot content can change height
  // without anything resizing the wrapper.
  React.useEffect(() => { publish(); });

  React.useEffect(() => () => clearTimeout(settleRef.current), []);

  const settleMs = () => {
    const w = wrapRef.current;
    const v = w ? parseFloat(getComputedStyle(w).getPropertyValue("--dur-streak-settle")) : NaN;
    return Number.isFinite(v) ? v : 420;
  };

  // Drawn scrollbar: size and position published on the wrapper.
  const placeBar = () => {
    const w = wrapRef.current, sc = scrollerRef.current;
    if (!w || !sc) return;
    const track = sc.clientHeight, full = sc.scrollHeight;
    if (full <= track + 1) { w.style.setProperty("--bar-h", "0px"); return; }
    const h = Math.max(24, (track / full) * track);
    const top = sc.offsetTop + (sc.scrollTop / (full - track)) * (track - h);
    // Centre the bar in the gap between the content and the frame's edge.
    const first = sc.firstElementChild && sc.firstElementChild.firstElementChild || sc.firstElementChild;
    if (first) {
      const gap = sc.getBoundingClientRect().right - first.getBoundingClientRect().right;
      if (gap > 2) w.style.setProperty("--bar-right", Math.max(0, (gap - 2) / 2) + "px");
    }
    w.style.setProperty("--bar-h", h + "px");
    w.style.setProperty("--bar-top", top + "px");
  };

  const onScroll = (e) => {
    placeBar();
    setScrolling(true);
    clearTimeout(settleRef.current);
    settleRef.current = setTimeout(() => setScrolling(false), settleMs());
    if (scrollerProps.onScroll) scrollerProps.onScroll(e);
  };

  return (
    <div
      ref={wrapRef}
      className={"clr-scroll-region " + className}
      data-measured={measured ? "" : undefined}
      data-scrolling={scrolling ? "" : undefined}
      style={style}
      {...props}
    >
      <div
        ref={scrollerRef}
        {...scrollerProps}
        onScroll={onScroll}
        className={"clr-scroll-region__scroller " + (scrollerProps.className || "")}
      >
        {children}
      </div>
      {hasHead && <div className="clr-scroll-region__streak" aria-hidden="true" />}
      <div className="clr-scroll-region__streak clr-scroll-region__streak--bottom" aria-hidden="true" />
      <div className="clr-scroll-region__bar" aria-hidden="true" />
      {hasHead && (
        <div
          ref={headRef}
          className="clr-scroll-region__head"
          data-rule={headRule ? "" : undefined}
        >
          {(title || actions) && (
            <div className="clr-scroll-region__title-row">
              {title && <div className="clr-scroll-region__title">{title}</div>}
              {actions && <div className="clr-scroll-region__actions">{actions}</div>}
            </div>
          )}
          {head}
        </div>
      )}
      {hasFoot && (
        <div ref={footRef} className="clr-scroll-region__foot">
          {foot}
        </div>
      )}
    </div>
  );
}
