// AppShell.jsx: the system atmosphere + the page header.
function AnimatedBackground() {
  return (
    <div className="clr-atmosphere clr-atmosphere--fixed" aria-hidden="true">
      <span className="clr-atmosphere__blob clr-atmosphere__blob--structure"></span>
      <span className="clr-atmosphere__blob clr-atmosphere__blob--interaction"></span>
      <span className="clr-atmosphere__blob clr-atmosphere__blob--info"></span>
      <span className="clr-atmosphere__blob clr-atmosphere__blob--selection"></span>
      <span className="clr-atmosphere__overlay"></span>
      <span className="clr-atmosphere__scan"></span>
    </div>
  );
}

function PageHeader({ left, center = 'logo', right, onBack, onMenu }) {
  const slot = (v, kind) => {
    if (v === 'back') return <window.IconButton label="Back" onClick={onBack}><window.Icon_ArrowLeft size={16} /></window.IconButton>;
    if (v === 'menu') return <window.IconButton label="Menu" onClick={onMenu}><window.Icon_Menu size={16} /></window.IconButton>;
    return v || <span className="hdr-spacer" />;
  };
  const mid = center === 'logo' ? <window.ClearLogo size="md" />
    : typeof center === 'string' ? <span className="hdr-center-text">{center}</span> : center;
  return (
    <header className="page-header">
      <div className="page-header-slot">{slot(left)}</div>
      <div className="page-header-slot center">{mid}</div>
      <div className="page-header-slot right">{slot(right)}</div>
    </header>
  );
}

// The screen's primary action, pinned at the bottom with a full-width line.
function Footer({ children }) {
  return <div className="clr-footer">{children}</div>;
}

Object.assign(window, { AnimatedBackground, PageHeader, Footer });
