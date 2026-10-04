// Screens.jsx — All 5 screens of the CLEAR prototype
const { useState, useEffect, useRef } = React;

// ============ BOOT SCREEN ============
function BootScreen({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2400);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="screen screen-boot">
      <window.ClearLogo size="xl" boot />
      <p className="boot-sub">STRENGTH TRAINING, SIMPLIFIED.</p>
    </div>
  );
}

// ============ HOME SCREEN ============
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
function HomeScreen({ onGenerate, onResume, hasActive }) {
  const done = [true, true, false, true, false, false, false]; // 3/7 so far
  return (
    <div className="screen">
      <window.PageHeader center="logo" right="menu" />
      {/* clr-boot: the cards arrive 40ms apart. */}
      <main className="content clr-boot">
        <window.Card>
          <div className="card-stack">
          <div className="label-row">
            <span className="sublabel">CURRENT STREAK</span>
            <span className="sublabel muted">WEEK 4</span>
          </div>
          <div className="streak-week">
            {WEEKDAYS.map((d, i) => (
              <div key={i} className={`clr-chamfer clr-chamfer--sm streak-day ${done[i] ? 'is-done' : ''} ${i === 2 ? 'is-today' : ''}`}>
                <span>{d}</span>
                {done[i] && <div className="streak-day-check"><window.Icon_Check size={12} /></div>}
              </div>
            ))}
          </div>
          <div className="label-row">
            <span className="sublabel muted">3 / 7 COMPLETE</span>
            <span className="sublabel accent">ON PACE</span>
          </div>
          </div>
        </window.Card>

        <h1 className="screen-title">TODAY</h1>

        {hasActive && (
          <window.Card>
            <div className="card-label">In progress</div>
            <h3 className="card-title">Upper · Push</h3>
            <p className="card-desc">Paused 12 minutes ago. 2 of 4 movements complete.</p>
          </window.Card>
        )}

        {!hasActive && (
          <window.Card>
            <div className="card-label">Rest day</div>
            <h3 className="card-title">No workout scheduled</h3>
            <p className="card-desc">Generate one based on how you feel today.</p>
          </window.Card>
        )}

        <window.Card>
          <div className="label-row" style={{ alignItems: 'center', margin: '-8px 0' }}>
            <div className="card-label">Favorites</div>
            {(window.CLEARDesignSystem_4ee044 || {}).TextAction && React.createElement((window.CLEARDesignSystem_4ee044 || {}).TextAction, null, 'View all')}
          </div>
          <div className="clr-list fav-list">
            <FavItem title="Lower · Posterior" meta="45 MIN · INT. 7" />
            <FavItem title="Push · Horizontal" meta="35 MIN · INT. 6" />
            <FavItem title="Full body · Conditioning" meta="50 MIN · INT. 8" />
          </div>
        </window.Card>

        <window.Footer>
          {hasActive
            ? <window.CTAButton onClick={onResume} iconRight={<window.Icon_ArrowRight size={16} />}>Resume</window.CTAButton>
            : <window.CTAButton onClick={onGenerate} iconRight={<window.Icon_ArrowRight size={16} />}>Generate workout</window.CTAButton>}
        </window.Footer>
      </main>
    </div>
  );
}

function FavItem({ title, meta }) {
  return (
    <div className="clr-list__row">
      <button type="button" className="fav-row">
        <span className="star"><window.Icon_Star size={16} /></span>
        <span><div className="t">{title}</div><div className="m">{meta}</div></span>
        <span className="go"><window.Icon_ChevronRight size={16} /></span>
      </button>
    </div>
  );
}

// ============ GENERATE SCREEN ============
const MUSCLE_GROUPS = ['CHEST', 'BACK', 'SHOULDERS', 'ARMS', 'LEGS', 'CORE', 'GLUTES', 'FULL BODY'];
const GOALS = ['STRENGTH', 'HYPERTROPHY', 'ENDURANCE', 'CONDITIONING'];
const MOODS = [
  { key: 'bad',  Icon: () => <window.Icon_Frown size={24} />,     label: 'WORN' },
  { key: 'meh',  Icon: () => <window.Icon_Meh size={24} />,       label: 'FLAT' },
  { key: 'ok',   Icon: () => <window.Icon_Smile size={24} />,     label: 'READY' },
  { key: 'peak', Icon: () => <window.Icon_SmilePlus size={24} />, label: 'PEAK' },
];

function GenerateScreen({ onBack, onGenerate }) {
  const [selected, setSelected] = useState(new Set(['SHOULDERS', 'CHEST']));
  const [goal, setGoal] = useState('STRENGTH');
  const [intensity, setIntensity] = useState(7);
  const [mood, setMood] = useState('ok');
  const [notes, setNotes] = useState('');

  const toggle = (g) => {
    const n = new Set(selected);
    n.has(g) ? n.delete(g) : n.add(g);
    setSelected(n);
  };

  // A primary form: one accent card, title above it, fields inside. The action
  // is in the pinned footer, so it stays in the same place on every screen.
  return (
    <div className="screen">
      <window.PageHeader left="back" center="logo" onBack={onBack} />
      <main className="content">
        <h1 className="screen-title">Generate workout</h1>

        <window.Card padding="lg">
          <div className="form-stack">
            <section className="section">
              <h3 className="sublabel">Muscle groups</h3>
              <div className="chip-grid">
                {MUSCLE_GROUPS.map(g => (
                  <window.Chip key={g} selected={selected.has(g)} onClick={() => toggle(g)}>{g}</window.Chip>
                ))}
              </div>
            </section>

            <section className="section">
              <h3 className="sublabel">Goal</h3>
              <div className="chip-grid">
                {GOALS.map(g => (
                  <window.Chip key={g} selected={goal === g} onClick={() => setGoal(g)}>{g}</window.Chip>
                ))}
              </div>
            </section>

            <section className="section">
              <div className="label-row">
                <h3 className="sublabel">Intensity</h3>
                <span className="sublabel accent">Int. {intensity}</span>
              </div>
              <window.Slider value={intensity} onChange={setIntensity} />
              <div className="slider-ticks">
                <span>1</span><span>3</span><span>5</span><span>7</span><span>9</span>
              </div>
            </section>

            <section className="section">
              <h3 className="sublabel">How do you feel?</h3>
              <div className="mood-row">
                {MOODS.map(m => (
                  <window.Chip key={m.key} selected={mood === m.key} tick={false} onClick={() => setMood(m.key)}>
                    <m.Icon />
                    <span>{m.label}</span>
                  </window.Chip>
                ))}
              </div>
            </section>

            <window.TextInput
              label="Notes · optional"
              value={notes}
              onChange={setNotes}
              placeholder="Bad left shoulder from years ago. Overhead press feels sketchy sometimes."
              multi
            />

          </div>
        </window.Card>

        <window.Footer>
          <window.CTAButton onClick={onGenerate} iconRight={<window.Icon_Zap size={16} />}>Generate workout</window.CTAButton>
        </window.Footer>
      </main>
    </div>
  );
}

// ============ WORKOUT READY ============
const SAMPLE_WORKOUT = {
  title: 'UPPER · PUSH',
  desc: 'Shoulder-dominant push day. Warm up thoroughly — overhead work first while you\'re fresh.',
  duration: '45 MIN',
  intensity: 'INT. 7',
  goal: 'STRENGTH',
  anchor: 'OVERHEAD PRESS',
  sections: [
    { name: 'WARMUP', items: [{ name: 'Band pull-apart', sets: '2×15' }, { name: 'Scap push-up', sets: '2×10' }] },
    { name: 'ANCHOR', items: [{ name: 'Overhead press', sets: '4×5 @ RPE 8' }] },
    { name: 'ACCESSORY', items: [
      { name: 'DB bench press', sets: '3×8' },
      { name: 'Lateral raise', sets: '3×12' },
      { name: 'Tricep pushdown', sets: '3×10' },
    ]},
  ],
};

function WorkoutReadyScreen({ onBack, onStart, onRegenerate }) {
  const w = SAMPLE_WORKOUT;
  return (
    <div className="screen">
      <window.PageHeader left="back" center="WORKOUT" onBack={onBack} />
      <main className="content">
        <h1 className="screen-title">{w.title}</h1>
        <window.Card>
          <div className="card-stack">
            <div className="card-label">Overview</div>
            <p className="card-desc">{w.desc}</p>
            <div className="meta-tags">
              <MetaChip icon={<window.Icon_Crosshair size={16} />} label={w.goal} />
              <MetaChip icon={<window.Icon_Clock size={16} />} label={w.duration} />
              <MetaChip icon={<window.Icon_Gauge size={16} />} label={w.intensity} />
              <MetaChip icon={<window.Icon_Target size={16} />} label={w.anchor} />
            </div>
          </div>
        </window.Card>

        {w.sections.map((sec, i) => (
          <window.Card key={i}>
            <div className="section-head">
              <span className="card-label">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="card-title">{sec.name}</h3>
            </div>
            {sec.items.map((x, j) => (
              <div key={j} className="ex-row"><span>{x.name}</span><span>{x.sets}</span></div>
            ))}
          </window.Card>
        ))}

        <window.Footer>
          <window.CTAButton onClick={onStart} iconRight={<window.Icon_ArrowRight size={16} />}>Initiate workout</window.CTAButton>
          <window.CTAButton variant="secondary" onClick={onRegenerate} iconLeft={<window.Icon_Refresh size={16} />}>Regenerate</window.CTAButton>
        </window.Footer>
      </main>
    </div>
  );
}

function MetaChip({ icon, label }) {
  return (
    <window.ChamferedFrame cornerSize="sm" className="meta-tag">{icon}<span>{label}</span></window.ChamferedFrame>
  );
}

// ============ ACTIVE WORKOUT ============
function ActiveWorkoutScreen({ onBack, onFinish }) {
  const [askLeave, setAskLeave] = useState(false);
  const DS = (window.CLEARDesignSystem_4ee044 || {});
  const [setNum, setSetNum] = useState(1);
  const [resting, setResting] = useState(false);
  const [seconds, setSeconds] = useState(90);
  const [exIdx, setExIdx] = useState(1); // overhead press (anchor)

  useEffect(() => {
    if (!resting) return;
    if (seconds <= 0) { setResting(false); setSeconds(90); return; }
    const id = setInterval(() => setSeconds(s => s - 1), 1000);
    return () => clearInterval(id);
  }, [resting, seconds]);

  const w = SAMPLE_WORKOUT;
  const flatEx = w.sections.flatMap(s => s.items.map(i => ({ ...i, section: s.name })));
  const cur = flatEx[exIdx];
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  const lowTimer = seconds <= 10 && resting;

  const logSet = () => {
    if (setNum < 4) {
      setSetNum(setNum + 1);
      setResting(true);
      setSeconds(90);
    } else {
      if (exIdx < flatEx.length - 1) {
        setExIdx(exIdx + 1);
        setSetNum(1);
      } else {
        onFinish();
      }
    }
  };

  const progress = ((exIdx + setNum / 4) / flatEx.length) * 100;

  return (
    <div className="screen">
      <window.PageHeader
        left="back"
        center={<window.Segments value={progress} />}
        right="menu"
        onBack={() => setAskLeave(true)}
      />
      {/* Dialog: the backdrop fades in four steps; the panel glows in and out. */}
      {DS.Dialog && React.createElement(DS.Dialog, {
        open: askLeave, onClose: () => setAskLeave(false), title: 'Abandon session?',
        actions: [
          React.createElement(DS.Button, { key: 'k', onClick: () => setAskLeave(false) }, 'Keep going'),
          React.createElement(DS.Button, { key: 'a', variant: 'critical', onClick: () => { setAskLeave(false); onBack(); } }, 'Abandon'),
        ],
      }, 'Logged sets are kept. The rest of the plan is cleared.')}
      <main className="content content-active">
        <window.Card>
          <div className="card-stack">
            <div className="card-label">{cur.section} · Exercise {exIdx + 1} / {flatEx.length}</div>
            <h1 className="active-exercise">{cur.name.toUpperCase()}</h1>
            <p className="sublabel muted">Set {setNum} of 4 · {cur.sets}</p>
          </div>
        </window.Card>

        {resting ? (
          <>
            {/* A card: heading + content, so it carries the accent bar, which
                follows the timer's colour and its low state. The pulse runs on
                the whole card so bar and body dim together. */}
            <div className={lowTimer ? 'clr-pulse-micro' : ''}>
              <window.Card cornerSize="lg" padding="lg" role={lowTimer ? 'timer-low' : 'timer'} className="rest-timer">
                <div className="sublabel">Rest</div>
                <div className="rest-time">{mm}:{ss}</div>
                <p className="card-desc rest-cue">Breathe. Shake out the shoulders. Stay loose.</p>
              </window.Card>
            </div>
            <window.Footer>
              <window.CTAButton onClick={() => { setResting(false); setSeconds(90); }} iconRight={<window.Icon_ArrowRight size={16} />}>Skip rest</window.CTAButton>
            </window.Footer>
          </>
        ) : (
          <>
            <window.Card role="info">
              <div className="card-label">Coaching cue</div>
              <p className="card-desc">Brace the core before the press. Elbows under the bar at lockout. Don't let the hips shift.</p>
            </window.Card>
            <window.Footer>
              <window.CTAButton onClick={logSet} iconRight={<window.Icon_Check size={16} />}>Log set</window.CTAButton>
              <window.CTAButton variant="secondary">Form issue</window.CTAButton>
            </window.Footer>
          </>
        )}
      </main>
    </div>
  );
}

// ============ DEBRIEF ============
function DebriefScreen({ onHome }) {
  const [saved, setSaved] = useState(false);
  const DS = (window.CLEARDesignSystem_4ee044 || {});
  const save = () => { setSaved(true); setTimeout(onHome, 1600); };
  const [mood, setMood] = useState(null);
  const [notes, setNotes] = useState('');
  return (
    <div className="screen">
      <window.PageHeader center="DEBRIEF" />
      <main className="content">
        <h1 className="screen-title">Nice work</h1>

        <div className="stat-grid">
          <Stat label="Duration" value="45:12" />
          <Stat label="Sets" value="16 / 16" />
          <Stat label="Anchor" value="RPE 8" />
          <Stat label="Streak" value="4 / 7" />
        </div>

        {/* A form: its fields sit inside one framed card, the action in the footer. */}
        <section className="section">
          <window.Card padding="lg">
            <div className="form-stack">
              <div className="card-label">Log how it went</div>
              <section className="section">
                <h3 className="sublabel">How do you feel?</h3>
                <div className="mood-row">
                  {MOODS.map(m => (
                    <window.Chip key={m.key} selected={mood === m.key} tick={false} onClick={() => setMood(m.key)}>
                      <m.Icon />
                      <span>{m.label}</span>
                    </window.Chip>
                  ))}
                </div>
              </section>
              <window.TextInput
                label="Notes · optional"
                value={notes}
                onChange={setNotes}
                placeholder="Overhead felt heavy today. Lateral raises easy."
                multi
              />
            </div>
          </window.Card>
        </section>

        <window.Footer>
          {/* Toast: phosphors in; dismissing decays out. */}
          {saved && DS.Toast && React.createElement(DS.Toast, { variant: 'positive', onDismiss: () => setSaved(false) }, 'Session saved. Streak 4 of 7.')}
          <window.CTAButton onClick={save} iconRight={<window.Icon_Check size={16} />}>Save and close</window.CTAButton>
        </window.Footer>
      </main>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <window.Card padding="sm">
      <div className="stat">
        <div className="card-label">{label}</div>
        <div className="stat-value">{value}</div>
      </div>
    </window.Card>
  );
}

Object.assign(window, {
  BootScreen, HomeScreen, GenerateScreen, WorkoutReadyScreen, ActiveWorkoutScreen, DebriefScreen,
});
