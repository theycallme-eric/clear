import type * as React from "react";

export interface TabItem {
  label: React.ReactNode;
  disabled?: boolean;
}

export interface TabBarProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** Plain labels, or objects when a tab needs to be disabled. */
  tabs?: Array<React.ReactNode | TabItem>;
  active?: number;
  onChange?: (index: number) => void;
  /**
   * Shared id prefix linking tabs to panels. Defaults to a generated stable id;
   * pass the same value to each TabPanel.
   */
  idBase?: string;
}

export interface TabPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  idBase: string;
  index: number;
  active: number;
}

/**
 * Underline tabs implementing the ARIA tabs pattern: one tab in the tab
 * sequence, arrow keys to move, Home/End to jump, aria-controls tying each tab
 * to its panel. Focus follows selection (automatic activation).
 */
export declare function TabBar(props: TabBarProps): React.JSX.Element;

/** The matching panel. Renders children only while active; adds .clr-tab-enter. */
export declare function TabPanel(props: TabPanelProps): React.JSX.Element;
