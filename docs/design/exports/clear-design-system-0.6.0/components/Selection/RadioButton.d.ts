import type * as React from "react";

export interface RadioButtonProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "type"> {
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  required?: boolean;
  /** Called with the input's value, then the original event. */
  onChange?: (value: string, event: React.ChangeEvent<HTMLInputElement>) => void;
  label?: React.ReactNode;
  /** Radios sharing a `name` form a group: arrow keys move within it natively. */
  name?: string;
  inputRef?: React.Ref<HTMLInputElement>;
}

/**
 * RadioButton — a real <input type="radio"> styled to CLEAR. Give every radio in
 * a group the same `name` and native arrow-key navigation and roving tabindex
 * come for free.
 *
 * CLEAR has no circles, so the control is a square with a solid inner square.
 */
export declare function RadioButton(props: RadioButtonProps): React.JSX.Element;
