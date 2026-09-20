import React from "react";
import { OverflowRail } from "../OverflowRail/OverflowRail";

export function TabBar({
  tabs = [],
  active = 0,
  onChange,
  idBase,
  className = "",
  style,
  ...props
}) {
  const autoId = React.useId();
  const base = idBase ?? `clr-tabs-${autoId}`;
  const refs = React.useRef([]);

  const items = tabs.map((t, i) =>
    typeof t === "object" && t !== null && !React.isValidElement(t)
      ? { label: t.label, disabled: !!t.disabled }
      : { label: t, disabled: false }
  );

  const move = (from, dir) => {
    const n = items.length;
    for (let step = 1; step <= n; step++) {
      const i = (from + dir * step + n * step) % n;
      if (!items[i].disabled) return i;
    }
    return from;
  };

  const select = (i) => {
    if (items[i].disabled) return;
    if (onChange) onChange(i);
    // Focus follows selection, which is the automatic-activation tabs pattern.
    requestAnimationFrame(() => refs.current[i] && refs.current[i].focus());
  };

  const onKeyDown = (ev) => {
    const map = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 };
    if (ev.key in map) { ev.preventDefault(); select(move(active, map[ev.key])); return; }
    if (ev.key === "Home") { ev.preventDefault(); select(move(-1, 1)); return; }
    if (ev.key === "End") { ev.preventDefault(); select(move(items.length, -1)); }
  };

  return (
    /* The rail owns containment and scrolling; the tablist stays exactly as it
       was. role="tablist" rides on the track so role="tab" children remain its
       immediate descendants, and the bottom rule sits on the rail itself so it
       spans the visible width instead of scrolling away with the content. */
    <OverflowRail
      activeIndex={active}
      className={className}
      style={{
        borderBottom: "var(--border-width) solid var(--border-tab-rail)",
        ...style,
      }}
      trackProps={{ role: "tablist", onKeyDown, ...props }}
    >
      {items.map((t, i) => {
        const on = i === active;
        return (
          <button
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="tab"
            id={`${base}-tab-${i}`}
            aria-selected={on}
            aria-controls={`${base}-panel-${i}`}
            aria-disabled={t.disabled || undefined}
            /* Exactly one tab in the tab sequence — arrows move within the set. */
            tabIndex={on ? 0 : -1}
            disabled={t.disabled}
            onClick={() => select(i)}
            style={{
              fontFamily: "var(--font-data)",
              fontSize: "var(--label-sm-size)",
              fontWeight: "var(--font-weight-bold)",
              textTransform: "uppercase",
              letterSpacing: "var(--tracking-data)",
              color: t.disabled
                ? "var(--text-disabled)"
                : on
                ? "var(--text-tab-active)"
                : "var(--text-tab-inactive)",
              background: "transparent",
              border: 0,
              cursor: t.disabled ? "not-allowed" : "pointer",
              padding: "var(--spacing-200) 0",
              marginBottom: "calc(var(--border-width) * -1)",
              minHeight: 40,
              /* A tab must never shrink its own label to fit — shrinking is what
                 the rail is for. */
              flex: "0 0 auto",
              whiteSpace: "nowrap",
              borderBottom:
                "var(--border-width) solid " + (on ? "var(--border-tab-active)" : "transparent"),
              transition:
                "color var(--dur-state) var(--ease-mech), border-color var(--dur-state) var(--ease-mech)",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </OverflowRail>
  );
}

/** Panel for tab `index`. Pass the same `idBase` you gave the TabBar. */
export function TabPanel({ idBase, index, active, children, className = "", style, ...props }) {
  const on = index === active;
  return (
    <div
      role="tabpanel"
      id={`${idBase}-panel-${index}`}
      aria-labelledby={`${idBase}-tab-${index}`}
      hidden={!on}
      tabIndex={0}
      className={(on ? "clr-tab-enter " : "") + className}
      style={style}
      {...props}
    >
      {on ? children : null}
    </div>
  );
}
