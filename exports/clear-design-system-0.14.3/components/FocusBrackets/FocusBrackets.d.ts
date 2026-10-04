import type * as React from "react";

/** FocusBrackets takes no props. */
export interface FocusBracketsProps {}

/**
 * Corner brackets around whatever has keyboard focus. Mount once near the app
 * root; it renders nothing in place. Selectable controls (buttons, chips, tabs,
 * checkboxes) get brackets; text fields keep their lit border. Without it,
 * controls fall back to a lit border.
 */
export declare function FocusBrackets(props: FocusBracketsProps): React.JSX.Element | null;
