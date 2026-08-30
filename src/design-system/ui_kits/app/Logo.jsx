// Logo.jsx — ClearLogo wordmark with scanline
const { useEffect, useState } = React;

function ClearLogo({ size = 'md', boot = false, variant = 'wordmark', className = '' }) {
  const SIZE = {
    sm: { fontSize: 14, scanH: 1 },
    md: { fontSize: 24, scanH: 1 },
    lg: { fontSize: 48, scanH: 2 },
    xl: { fontSize: 72, scanH: 2 },
  }[size];
  const [phase, setPhase] = useState(boot ? 'idle' : 'done');

  useEffect(() => {
    if (phase !== 'idle') return;
    const id = requestAnimationFrame(() => setPhase('animating'));
    const done = setTimeout(() => setPhase('done'), 1600);
    return () => { cancelAnimationFrame(id); clearTimeout(done); };
  }, [phase]);

  if (variant === 'icon') {
    const size = Math.round(SIZE.fontSize * 1.75);
    return (
      <div className={`clear-logo-icon ${className}`} style={{ width: size, height: size }}>
        <span className="clear-logo-icon-letter" style={{ fontSize: SIZE.fontSize }}>C</span>
        <span className="clear-logo-icon-scan" style={{ height: SIZE.scanH }} />
      </div>
    );
  }

  const scanTop =
    phase === 'idle' ? '0%' :
    phase === 'done' ? '57%' :
    undefined;

  return (
    <div className={`clear-logo ${className}`}>
      <span className="clear-logo-sizer" style={{ fontSize: SIZE.fontSize }}>CLEAR</span>
      <div
        className={phase === 'animating' ? 'clear-logo-text-reveal' : ''}
        style={{ position: 'absolute', inset: 0, clipPath: phase === 'idle' ? 'inset(0 0 100% 0)' : undefined }}
        onAnimationEnd={() => setPhase('done')}
      >
        <span className="clear-logo-top" style={{ fontSize: SIZE.fontSize }}>CLEAR</span>
        <span
          className={phase === 'animating' ? 'clear-logo-bottom clear-logo-bottom-dim' : 'clear-logo-bottom'}
          style={{ fontSize: SIZE.fontSize, opacity: phase === 'done' ? 0.55 : 1 }}
        >
          CLEAR
        </span>
      </div>
      <div
        className={phase === 'animating' ? 'clear-logo-scan clear-logo-scanline-sweep' : 'clear-logo-scan'}
        style={{ height: SIZE.scanH, top: scanTop, opacity: phase === 'idle' ? 0 : 1 }}
      />
    </div>
  );
}

window.ClearLogo = ClearLogo;
