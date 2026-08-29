// App.jsx — root state machine
const { useState: _useState } = React;

function App() {
  const [route, setRoute] = _useState('boot');
  const [hasActive, setHasActive] = _useState(false);

  const screen = (() => {
    switch (route) {
      case 'boot': return <window.BootScreen onDone={() => setRoute('home')} />;
      case 'home': return <window.HomeScreen
        hasActive={hasActive}
        onGenerate={() => setRoute('generate')}
        onResume={() => setRoute('active')}
      />;
      case 'generate': return <window.GenerateScreen
        onBack={() => setRoute('home')}
        onGenerate={() => setRoute('ready')}
      />;
      case 'ready': return <window.WorkoutReadyScreen
        onBack={() => setRoute('generate')}
        onRegenerate={() => setRoute('generate')}
        onStart={() => { setHasActive(true); setRoute('active'); }}
      />;
      case 'active': return <window.ActiveWorkoutScreen
        onBack={() => setRoute('home')}
        onFinish={() => { setHasActive(false); setRoute('debrief'); }}
      />;
      case 'debrief': return <window.DebriefScreen onHome={() => setRoute('home')} />;
      default: return null;
    }
  })();

  return (
    <div className="app-root">
      <window.AnimatedBackground />
      {screen}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
