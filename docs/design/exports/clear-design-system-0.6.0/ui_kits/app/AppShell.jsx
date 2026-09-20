// AppShell.jsx — animated background + root container
function AnimatedBackground() {
  return (
    <div className="bg-root" aria-hidden="true">
      <div className="bg-blob bg-blob-amber" />
      <div className="bg-blob bg-blob-blue" />
      <div className="bg-blob bg-blob-cyan" />
      <div className="bg-blob bg-blob-dark" />
      <div className="bg-overlay" />
      <div className="bg-grain" />
      <div className="bg-scanlines" />
    </div>
  );
}

function PageHeader({ left, center = 'logo', right, onBack, onMenu, timer }) {
  const renderLeft = () => {
    if (left === 'back') return (
      <button className="hdr-btn" onClick={onBack} aria-label="Back">
        <window.Icon_ArrowLeft size={20} />
      </button>
    );
    return left || <span className="hdr-spacer" />;
  };
  const renderCenter = () => {
    if (center === 'logo') return <window.ClearLogo size="md" />;
    if (center === 'timer') return <div className="hdr-timer">{timer}</div>;
    return <span className="hdr-center-text">{center}</span>;
  };
  const renderRight = () => {
    if (right === 'menu') return (
      <button className="hdr-btn" onClick={onMenu} aria-label="Menu">
        <window.Icon_Menu size={20} />
      </button>
    );
    return right || <span className="hdr-spacer" />;
  };
  return (
    <header className="page-header">
      <div className="page-header-slot">{renderLeft()}</div>
      <div className="page-header-slot center">{renderCenter()}</div>
      <div className="page-header-slot right">{renderRight()}</div>
    </header>
  );
}

window.AnimatedBackground = AnimatedBackground;
window.PageHeader = PageHeader;
