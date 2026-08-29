import type * as React from "react";
export interface TimerDisplayProps {
  seconds?: number;
  /** At or below this many seconds the timer flips to the urgency treatment. Default 10. */
  lowThreshold?: number;
  size?: "md" | "lg";
  style?: React.CSSProperties;
}
/** Countdown readout — selection-green at rest, urgency-red when low. Digits tumble like a split-flap; red means time pressure, never danger. */
export declare function TimerDisplay(props: TimerDisplayProps): React.JSX.Element;
