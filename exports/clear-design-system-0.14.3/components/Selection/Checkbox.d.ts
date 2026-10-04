import type * as React from "react";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "type"> {
  checked?: boolean;
  defaultChecked?: boolean;
  /** Visual third state. Ignored while `checked` is true, as the DOM requires. */
  indeterminate?: boolean;
  disabled?: boolean;
  required?: boolean;
  /** Called with the next checked value, then the original event. */
  onChange?: (checked: boolean, event: React.ChangeEvent<HTMLInputElement>) => void;
  /** Accessible name. Wired to the input with htmlFor/id. */
  label?: React.ReactNode;
  inputRef?: React.Ref<HTMLInputElement>;
}

/**
 * Checkbox — a real <input type="checkbox"> styled to CLEAR, so form
 * participation, required, and indeterminate all behave natively.
 * Sharp 20px box with a ≥40px hit area; green means chosen, and the tick is a
 * second, non-colour cue.
 */
export declare function Checkbox(props: CheckboxProps): React.JSX.Element;
