import React from "react";
import { Chip } from "../Chip/Chip";

export function ChoiceGroup({
  legend,
  options = [],
  value,
  onChange,
  multiple = false,
  name,
  required = false,
  errorText,
  className = "",
  style,
  ...props
}) {
  const autoId = React.useId();
  const errId = `clr-cg-${autoId}-err`;
  const selected = multiple ? (Array.isArray(value) ? value : []) : value;
  const groupRef = React.useRef(null);

  const items = options.map((o) =>
    typeof o === "object" && o !== null ? o : { value: o, label: o }
  );

  const toggle = (v) => {
    if (!onChange) return;
    if (!multiple) { onChange(v); return; }
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  };

  const isOn = (opt) => (multiple ? selected.includes(opt.value) : selected === opt.value);

  /* Roving tabindex, single-select only. A radiogroup is ONE tab stop and the
     arrows move within it; a multi-select toggle set is a series of independent
     buttons, each individually tabbable. Different patterns because they answer
     different questions — claiming radio roles without this is worse than not
     claiming them, since assistive tech announces a radiogroup whose arrow keys
     then do nothing. */
  const enabled = items.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
  const checkedIdx = items.findIndex((o) => !o.disabled && isOn(o));
  const rovingIdx = checkedIdx >= 0 ? checkedIdx : (enabled[0] ?? -1);

  const step = (from, dir) => {
    if (!enabled.length) return from;
    const at = enabled.indexOf(from);
    const next = enabled[(at + dir + enabled.length) % enabled.length];
    return next;
  };

  const select = (i) => {
    if (i < 0 || items[i].disabled) return;
    toggle(items[i].value);
    requestAnimationFrame(() => { const el = groupRef.current && groupRef.current.querySelector('[data-cg="' + i + '"]'); if (el) el.focus(); });
  };

  const onKeyDown = (ev) => {
    if (multiple) return; // independent toggles keep native Tab behaviour
    const dirs = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (ev.key in dirs) {
      ev.preventDefault();
      // Selection follows focus, as the radio pattern requires.
      select(step(rovingIdx < 0 ? enabled[0] : rovingIdx, dirs[ev.key]));
      return;
    }
    if (ev.key === "Home") { ev.preventDefault(); select(enabled[0]); return; }
    if (ev.key === "End") { ev.preventDefault(); select(enabled[enabled.length - 1]); }
  };

  return (
    <fieldset
      className={className}
      aria-describedby={errorText ? errId : undefined}
      aria-invalid={errorText ? true : undefined}
      style={{ border: 0, margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--spacing-200)", ...style }}
      {...props}
    >
      {legend && (
        <legend className="label" style={{ padding: 0 }}>
          {legend}
          {required && <span aria-hidden="true"> *</span>}
        </legend>
      )}
      <div
        role={multiple ? "group" : "radiogroup"}
        aria-required={!multiple && required ? true : undefined}
        onKeyDown={onKeyDown}
        ref={groupRef}
        style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-200)" }}
      >
        {/* Each option IS a Chip, so it follows every chip decision (tint, tick,
            flicker, bleed) by construction. Radio semantics are layered on top. */}
        {items.map((opt, i) => {
          const on = isOn(opt);
          return (
            <Chip
              key={opt.value}
              data-cg={i}
              selected={on}
              disabled={opt.disabled}
              onClick={() => toggle(opt.value)}
              role={multiple ? undefined : "radio"}
              aria-checked={multiple ? undefined : on}
              aria-pressed={multiple ? on : undefined}
              tabIndex={multiple ? undefined : i === rovingIdx ? 0 : -1}
            >
              {opt.label}
            </Chip>
          );
        })}
      </div>
      {errorText && (
        <span id={errId} style={{ fontFamily: "var(--font-data)", fontSize: "var(--label-xs-size)", fontWeight: "var(--font-weight-bold)", letterSpacing: "var(--tracking-data)", textTransform: "uppercase", color: "var(--text-negative)" }}>
          {errorText}
        </span>
      )}
      {name && !multiple && <input type="hidden" name={name} value={selected ?? ""} />}
    </fieldset>
  );
}
