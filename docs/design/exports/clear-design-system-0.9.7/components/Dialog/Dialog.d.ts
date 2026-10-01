import type * as React from "react";

export interface DialogProps extends React.DialogHTMLAttributes<HTMLDialogElement> {
  open?: boolean;
  /**
   * Fired once per dismissal, whatever the cause — Esc, a backdrop click, or
   * your own action. Programmatically driving `open` to false does NOT fire it,
   * so a controlled parent cannot loop.
   */
  onClose?: () => void;
  /** Becomes the accessible name via aria-labelledby. */
  title?: React.ReactNode;
  /** Buttons, in reading order. Put the safe choice first. */
  actions?: React.ReactNode;
  /** Destructive confirmation: critical border and heading. Copy must say what is lost. */
  critical?: boolean;
  /**
   * Allow a click outside the panel to dismiss. Default false, deliberately: a
   * destructive confirmation must not be dismissible by a stray click, and Esc
   * plus an explicit cancel action already cover the safe exits.
   */
  dismissOnBackdrop?: boolean;
}

/**
 * Modal dialog built on native <dialog> + showModal(), so the focus trap, Esc
 * handling, background inertness and top-layer stacking are the platform's
 * rather than ours. Chamfered frame, no rounded corners, no backdrop blur.
 */
export declare function Dialog(props: DialogProps): React.JSX.Element;
