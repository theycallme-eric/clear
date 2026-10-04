import React from "react";
// Track and thumb styling lives in css/foundation.css (.clr-slider).
// A component must never inject a stylesheet during render.

export function IntensitySlider({
  value,
  defaultValue,
  min = 1,
  max = 10,
  step = 1,
  onChange,
  label = "Int.",
  name,
  id,
  disabled = false,
  valueText,
  className = "",
  style,
  inputRef,
  ...props
}) {
  const autoId = React.useId();
  const inputId = id ?? `clr-slider-${autoId}`;
  const outId = `${inputId}-out`;
  const shown = value ?? defaultValue;

  // Label above the control, like every field.
  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-150, 6px)", minWidth: 180, ...style }}>
      <label htmlFor={inputId} className="label" style={{ display: "flex", justifyContent: "space-between", gap: "var(--spacing-300)", whiteSpace: "nowrap", cursor: disabled ? "not-allowed" : "pointer" }}>
        {label}{" "}
        {/* The readout is an <output> tied to the input, so the value is part of
            the control's accessible description rather than loose text. */}
        <output
          id={outId}
          htmlFor={inputId}
          key={shown}
          className="clr-tumble"
          style={{ display: "inline-block", color: "var(--text-cta)" }}
        >
          {shown}
        </output>
      </label>
      <input
        ref={inputRef}
        id={inputId}
        name={name}
        type="range"
        className="clr-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        aria-describedby={outId}
        aria-valuetext={valueText}
        onChange={(ev) => onChange && onChange(Number(ev.target.value), ev)}
        {...props}
      />
    </div>
  );
}
