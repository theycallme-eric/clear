import React from "react";

/**
 * TextAction (DS-009): the quietest action in the system. The label style in
 * the action colour, ending in a chevron, with no frame. Use it for "View all"
 * on a card or "Skip for now" under a primary. Renders a link with `href`,
 * otherwise a button. Keeps a 40px tap target.
 */
export function TextAction({ href, block = false, className = "", children, ...props }) {
  const cls = ["clr-text-action", block ? "clr-text-action--block" : "", className].filter(Boolean).join(" ");
  return href
    ? <a href={href} className={cls} {...props}>{children}</a>
    : <button type="button" className={cls} {...props}>{children}</button>;
}
