import type * as React from "react";

export interface IntensitySliderProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "type" | "value" | "defaultValue"> {
  value?: number;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  /** Called with the new numeric value, then the original event. */
  onChange?: (value: number, event: React.ChangeEvent<HTMLInputElement>) => void;
  /** Abbreviated prefix, e.g. "Int." — never a sentence. Becomes the accessible name. */
  label?: React.ReactNode;
  /** Spoken value where the number alone is not meaningful, e.g. "7 of 10, hard". */
  valueText?: string;
  disabled?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
}

/**
 * Intensity slider — a real <input type="range">, so all native keyboard
 * behaviour is intact. Rectangular thumb, structure-tinted track, and the
 * readout is an <output> associated with the input. Thumb stays 12×20px while
 * the focus ring and hit area meet touch minimums.
 */
export declare function IntensitySlider(props: IntensitySliderProps): React.JSX.Element;
