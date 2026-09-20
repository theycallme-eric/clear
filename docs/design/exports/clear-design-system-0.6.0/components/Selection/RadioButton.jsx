import React from "react";

export function RadioButton({
  checked,
  defaultChecked,
  disabled = false,
  required = false,
  onChange,
  label,
  id,
  name,
  value,
  className = "",
  style,
  inputRef,
  ...props
}) {
  const autoId = React.useId();
  const inputId = id ?? `clr-rb-${autoId}`;
  return (
    <span className={"clr-check clr-check--radio " + className} style={style}>
      <input
        ref={inputRef}
        type="radio"
        id={inputId}
        name={name}
        value={value}
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        required={required}
        onChange={(ev) => onChange && onChange(ev.target.value, ev)}
        {...props}
      />
      <span className="clr-check__box" aria-hidden="true">
        <span className="clr-check__pip"></span>
      </span>
      {label && <label htmlFor={inputId} className="clr-check__label">{label}</label>}
    </span>
  );
}
