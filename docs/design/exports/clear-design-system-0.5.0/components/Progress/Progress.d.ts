import type * as React from "react";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Omit for indeterminate. Only pass a number when real progress is known. */
  value?: number;
  max?: number;
  /** Terse and factual: "Generating", "Session 3 of 5". */
  label?: React.ReactNode;
  showValue?: boolean;
  /** Draw N tick divisions, so the bar reads as an instrument scale. */
  segments?: number;
}

/**
 * Progress bar. Stepped fill, never a smooth glide. Determinate when `value` is
 * given, otherwise an indeterminate sweep with aria-busy — do not fake a value
 * you do not have.
 */
export declare function Progress(props: ProgressProps): React.JSX.Element;
