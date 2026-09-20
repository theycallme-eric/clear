import type * as React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * primary   — the one forward action on a screen
   * secondary — the default; everything that is not the single primary action
   * quiet     — tertiary, for dense rows where a border would add noise
   * critical  — destructive or irreversible. Never the only warning; pair with copy.
   */
  variant?: "primary" | "secondary" | "quiet" | "critical";
  size?: "sm" | "md" | "lg";
  /** Shows the stepped load indicator, sets aria-busy, and blocks activation. */
  loading?: boolean;
  disabled?: boolean;
  /** Leading glyph from the CLEAR icon set. */
  icon?: React.ReactNode;
  /** Drops the label from the layout. Prefer IconButton, which requires a name. */
  iconOnly?: boolean;
  buttonRef?: React.Ref<HTMLButtonElement>;
}

export interface IconButtonProps extends Omit<ButtonProps, "iconOnly" | "children"> {
  /** Required accessible name — an icon alone is not a label. */
  label: string;
  icon: React.ReactNode;
}

/** Chamfered button. Visible size stays compact; hit area is at least 40px. */
export declare function Button(props: ButtonProps): React.JSX.Element;

/** Square icon button with a mandatory accessible name and a 40–44px target. */
export declare function IconButton(props: IconButtonProps): React.JSX.Element;
