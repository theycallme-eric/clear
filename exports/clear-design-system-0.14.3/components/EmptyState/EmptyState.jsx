import React from "react";
/**
 * An empty list, as a plain message inside its own card (accent bar included): what's missing and
 * what to do. Put it where the list will be, so the screen looks the same once
 * it fills. The screen's primary action belongs in its pinned footer
 * (.clr-footer), not here.
 */
export function EmptyState({ title = "Nothing here", message, icon, style }) {
  return (
    <div className="clr-bleed clr-bleed--block" style={{ "--bleed": "var(--border-card)" }}>
      <div className="clr-card"><span className="clr-card__bar" aria-hidden="true"></span>
      <div className="clr-chamfer clr-chamfer--md clr-card__body"
        style={{ padding: "var(--spacing-300)", display: "flex", flexDirection: "column", gap: "var(--spacing-200)", ...style }}>
        {icon && <div style={{ color: "var(--icon-empty)", display: "flex" }}>{icon}</div>}
        <div style={{ fontSize: "var(--paragraph-sm-size)", lineHeight: "var(--paragraph-md-line-height)", color: "var(--text-paragraph)" }}>{title}</div>
        {message && <p style={{ margin: 0, fontSize: "var(--paragraph-sm-size)", color: "var(--text-secondary)" }}>{message}</p>}
      </div>
      </div>
    </div>
  );
}
