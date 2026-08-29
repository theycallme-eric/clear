import type * as React from "react";

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "defaultValue"> {
  /** Stenciled uppercase label, wired to the field with htmlFor/id. */
  label?: React.ReactNode;
  value?: string;
  defaultValue?: string;
  /** Called with the next value, then the original event. */
  onChange?: (value: string, event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  /** Write placeholders in a real voice — how a person talks, not how a form asks. */
  placeholder?: string;
  /** Render a textarea instead. `type` is ignored when set. */
  multiline?: boolean;
  rows?: number;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  /** Defaults to true when `errorText` is present. Sets aria-invalid. */
  invalid?: boolean;
  /** Persistent guidance. Linked via aria-describedby. */
  helperText?: React.ReactNode;
  /** Validation failure. Linked via aria-describedby and implies invalid. */
  errorText?: React.ReactNode;
  inputRef?: React.Ref<HTMLInputElement | HTMLTextAreaElement>;
}

/**
 * Text field — sharp corners, 2px structure border, surface brightens on focus.
 * Supports id/name/type/required/readOnly/autoComplete, helper and error text
 * wired through aria-describedby, and forwards native focus/blur.
 */
export declare function Input(props: InputProps): React.JSX.Element;
