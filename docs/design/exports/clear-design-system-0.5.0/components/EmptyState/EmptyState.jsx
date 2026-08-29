import React from "react";
export function EmptyState({ title = "Nothing here", message, actionLabel, onAction, icon, style }) {
  return (
    <div className="clr-chamfer clr-chamfer--lg"
      style={{ "--surface": "var(--surface-empty)", "--brd": "var(--border-empty)",
        padding: "var(--spacing-700) var(--spacing-600)", textAlign: "center", ...style }}>
      {icon && <div style={{ color: "var(--icon-empty)", marginBottom: "var(--spacing-300)", display: "flex", justifyContent: "center" }}>{icon}</div>}
      <div style={{ fontFamily: "var(--font-display)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase",
        fontSize: "var(--heading-h5-size)", lineHeight: "var(--heading-h5-line-height)", color: "var(--text-empty-title)" }}>{title}</div>
      {message && <p style={{ margin: "var(--spacing-200) 0 0", fontSize: "var(--paragraph-sm-size)",
        color: "var(--text-empty-body)" }}>{message}</p>}
      {actionLabel && (
        <button onClick={onAction} className="clr-chamfer clr-chamfer--sm clr-btn" style={{ marginTop: "var(--spacing-400)" }}>{actionLabel}</button>
      )}
    </div>
  );
}
