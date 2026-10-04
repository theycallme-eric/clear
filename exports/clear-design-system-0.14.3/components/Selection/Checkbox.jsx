import React from "react";

export function Checkbox({
  checked,
  defaultChecked,
  indeterminate = false,
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
  const inputId = id ?? `clr-cb-${autoId}`;
  const localRef = React.useRef(null);
  const ref = inputRef ?? localRef;

  // Indeterminate exists only as a DOM property, never as an attribute.
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked;
  }, [indeterminate, checked, ref]);

  return (
    <span className={"clr-check " + className} style={style}>
      <input
        ref={ref}
        type="checkbox"
        id={inputId}
        name={name}
        value={value}
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        required={required}
        onChange={(ev) => onChange && onChange(ev.target.checked, ev)}
        {...props}
      />
      <span className="clr-check__box" aria-hidden="true">
        <span className="clr-check__dash"></span>
      </span>
      {label && <label htmlFor={inputId} className="clr-check__label">{label}</label>}
    </span>
  );
}
