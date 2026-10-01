import React from "react";
/**
 * An empty list, as a plain message inside its own frame: what's missing and
 * what to do. Put it where the list will be, so the screen looks the same once
 * it fills. The screen's primary action belongs in its pinned footer
 * (.clr-footer), not here.
 *
 * actionLabel / onAction are deprecated in 0.9.5. They still render, as a
 * secondary button under the message, so existing screens don't lose their action.
 */
export function EmptyState({ title = "Nothing here", message, actionLabel, onAction, icon, style }) {
  return (
    <div className="clr-bleed clr-bleed--block" style={{ "--bleed": "var(--border-card)" }}>
      <div className="clr-chamfer clr-chamfer--md"
        style={{ padding: "var(--spacing-300)", display: "flex", flexDirection: "column", gap: "var(--spacing-200)", ...style }}>
        {icon && <div style={{ color: "var(--icon-empty)", display: "flex" }}>{icon}</div>}
        <div style={{ fontSize: "var(--paragraph-sm-size)", lineHeight: "var(--paragraph-md-line-height)", color: "var(--text-paragraph)" }}>{title}</div>
        {message && <p style={{ margin: 0, fontSize: "var(--paragraph-sm-size)", color: "var(--text-secondary)" }}>{message}</p>}
        {actionLabel && (
          <span className="clr-bleed" style={{ alignSelf: "flex-start", "--bleed": "var(--border-cta-primary)" }}>
            <button type="button" onClick={onAction} className="clr-chamfer clr-chamfer--sm clr-btn">{actionLabel}</button>
          </span>
        )}
      </div>
    </div>
  );
}
