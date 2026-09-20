import React from "react";

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
  const refs = React.useRef([]);

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
    requestAnimationFrame(() => refs.current[i] && refs.current[i].focus());
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
        style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-200)" }}
      >
        {items.map((opt, i) => {
          const on = isOn(opt);
          return (
            <button
              key={opt.value}
              ref={(el) => { refs.current[i] = el; }}
              type="button"
              role={multiple ? undefined : "radio"}
              aria-checked={multiple ? undefined : on}
              aria-pressed={multiple ? on : undefined}
              tabIndex={multiple ? undefined : i === rovingIdx ? 0 : -1}
              disabled={opt.disabled}
              onClick={() => toggle(opt.value)}
              className={["clr-chamfer", "clr-chamfer--sm", on ? "clr-chamfer--selected" : ""].filter(Boolean).join(" ")}
              style={{
                display: "inline-flex", alignItems: "center", gap: "var(--spacing-200)",
                minHeight: 40, padding: "var(--spacing-200) var(--spacing-400)",
                fontFamily: "var(--font-data)", fontSize: "var(--label-sm-size)",
                fontWeight: "var(--font-weight-bold)", letterSpacing: "var(--tracking-data)",
                textTransform: "uppercase",
                color: opt.disabled ? "var(--text-disabled)" : on ? "var(--text-selected)" : "var(--text-unselected)",
                background: "transparent", border: 0,
                cursor: opt.disabled ? "not-allowed" : "pointer",
                ...(opt.disabled ? { "--surface": "var(--surface-disabled)", "--brd": "var(--border-disabled)" } : null),
              }}
            >
              {/* Second, non-colour cue — selection never rests on hue alone. */}
              <svg viewBox="0 0 24 24" aria-hidden="true" width="10" height="10"
                style={{ flex: "0 0 auto", fill: "currentColor", opacity: on ? 1 : 0, width: on ? 10 : 0,
                  transition: "opacity var(--dur-state) var(--ease-mech), width var(--dur-state) var(--ease-mech)" }}>
                <path d="M9.6 20.4 2.4 13.2l3.4-3.4 3.8 3.8L18.2 3l3.4 3.4z" />
              </svg>
              {opt.label}
            </button>
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
