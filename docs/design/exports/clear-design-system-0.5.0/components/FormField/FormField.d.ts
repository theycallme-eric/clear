import type * as React from "react";

export interface FormFieldRenderArgs {
  /** Pass to the control's aria-describedby. */
  describedBy?: string;
  invalid: boolean;
}

export interface FormFieldProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  label?: React.ReactNode;
  /** Id of the control this label belongs to. */
  htmlFor?: string;
  required?: boolean;
  helperText?: React.ReactNode;
  errorText?: React.ReactNode;
  /** Element, or a render function receiving the aria wiring. */
  children?: React.ReactNode | ((args: FormFieldRenderArgs) => React.ReactNode);
}

/**
 * Label + helper + error scaffolding for any control. Input has this built in;
 * FormField is for wrapping Chips, Sliders, ChoiceGroups and third-party
 * controls in the same structure with the same aria wiring.
 */
export declare function FormField(props: FormFieldProps): React.JSX.Element;
