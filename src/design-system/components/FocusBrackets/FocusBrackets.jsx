import React from "react";

/**
 * FocusBrackets: corner brackets around whatever has keyboard focus.
 *
 * Mount once, near the root of the app. It draws a single bracket layer on
 * document.body, so it is never clipped by a chamfered shape or an overflow
 * container, and it sets data-clr-focus="brackets" on <html> so selectable
 * controls drop their fallback focus style.
 *
 * Text fields are skipped on purpose: they show focus by lighting their own
 * border, on every device. Checkbox and radio brackets wrap the drawn box, not
 * the invisible input over it. Brackets snap on; focus is never animated.
 */
const FIELD = 'input:not([type="checkbox"],[type="radio"],[type="range"],[type="button"],[type="submit"],[type="reset"]),textarea,select,[contenteditable="true"]';
const GAP = 5;

export function FocusBrackets() {
  React.useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-clr-focus", "brackets");
    const layer = document.createElement("div");
    layer.className = "clr-focus-brackets";
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);

    let target = null;
    let frame = 0;
    const place = () => {
      frame = 0;
      if (!target || !target.isConnected) { layer.style.opacity = "0"; return; }
      const r = target.getBoundingClientRect();
      layer.style.transform = "translate(" + (r.left - GAP) + "px," + (r.top - GAP) + "px)";
      layer.style.width = r.width + GAP * 2 + "px";
      layer.style.height = r.height + GAP * 2 + "px";
      layer.style.opacity = "1";
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(place); };
    // Follow the focused control's size, e.g. a chip that loses its tick when
    // it's unselected while focused.
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => schedule()) : null;
    const onIn = (e) => {
      const el = e.target;
      let visible = false;
      try { visible = el.matches(":focus-visible"); } catch (_) { visible = true; }
      if (!visible || el.matches(FIELD)) target = null;
      else target = (el.closest(".clr-check") && el.closest(".clr-check").querySelector(".clr-check__box")) || el;
      if (ro) { ro.disconnect(); if (target) ro.observe(target); }
      place();
    };
    const onOut = () => { target = null; if (ro) ro.disconnect(); place(); };

    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
      if (ro) ro.disconnect();
      layer.remove();
      root.removeAttribute("data-clr-focus");
    };
  }, []);
  return null;
}
