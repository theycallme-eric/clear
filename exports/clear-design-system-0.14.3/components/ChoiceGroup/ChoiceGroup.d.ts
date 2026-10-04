import type * as React from "react";

export interface ChoiceOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface ChoiceGroupProps extends Omit<React.FieldsetHTMLAttributes<HTMLFieldSetElement>, "onChange"> {
  /** Group name, rendered as a real <legend> so it is announced per option. */
  legend?: React.ReactNode;
  options?: Array<string | ChoiceOption>;
  /** A single value, or an array when `multiple`. */
  value?: string | string[];
  onChange?: (value: string | string[]) => void;
  /** Toggle set instead of a single choice. Changes roles from radio to pressed. */
  multiple?: boolean;
  required?: boolean;
  errorText?: React.ReactNode;
  name?: string;
}

/**
 * Chip-style choice set with fieldset/legend semantics.
 *
 * Single-select implements the full radiogroup pattern: one tab stop, arrow keys
 * to move, Home/End to jump, and selection follows focus. Multi-select is a set
 * of independent toggle buttons, each individually tabbable — the correct
 * pattern for that question, and the reason arrow keys are single-select only.
 *
 * Selection always carries a tick as well as the surface colour.
 */
export declare function ChoiceGroup(props: ChoiceGroupProps): React.JSX.Element;
