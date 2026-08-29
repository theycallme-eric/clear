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
      <main className="content">
        <section className="streak-section">
          <div className="label-row">
            <span className="sublabel">CURRENT STREAK</span>
            <span className="sublabel muted">WEEK 4</span>
          </div>
          <div className="streak-week">
            {WEEKDAYS.map((d, i) => (
              <div key={i} className={`streak-day ${done[i] ? 'is-done' : ''} ${i === 2 ? 'is-today' : ''}`}>
                <span className="streak-day-letter">{d}</span>
                {done[i] && <div className="streak-day-check"><window.Icon_Check size={12} /></div>}
              </div>
            ))}
          </div>
          <div className="label-row">
            <span className="sublabel muted">3 / 7 COMPLETE</span>
            <span className="sublabel accent">ON PACE</span>
          </div>
        </section>

        <h1 className="screen-title">TODAY</h1>

        {hasActive && (
          <window.Card cornerSize="lg" padding="lg">
            <div className="today-label">IN PROGRESS</div>
            <h3 className="today-title">UPPER · PUSH</h3>
            <p className="today-desc">Paused 12 minutes ago. 2 of 4 movements complete.</p>
            <div style={{ marginTop: 14 }}>
              <window.CTAButton size="lg" onClick={onResume} iconRight={<window.Icon_ArrowRight size={20} />}>
                RESUME
              </window.CTAButton>
            </div>
          </window.Card>
        )}

        {!hasActive && (
          <window.Card cornerSize="lg" padding="lg">
            <div className="today-label">REST DAY</div>
            <h3 className="today-title">NO WORKOUT SCHEDULED</h3>
            <p className="today-desc">Generate one based on how you feel today, or mark this as an intentional rest.</p>
            <div className="btn-stack">
              <window.CTAButton size="lg" onClick={onGenerate} iconRight={<window.Icon_ArrowRight size={20} />}>
                GENERATE WORKOUT
              </window.CTAButton>
              <window.CTAButton size="md" variant="secondary">
                MARK REST DAY
              </window.CTAButton>
            </div>
          </window.Card>
        )}

        <section className="favorites">
          <h2 className="section-heading">FAVORITES</h2>
          <div className="fav-list">
            <FavItem title="Lower · Posterior" meta="45 MIN · INT. 7" />
            <FavItem title="Push · Horizontal" meta="35 MIN · INT. 6" />
            <FavItem title="Full body · Conditioning" meta="50 MIN · INT. 8" />
          </div>
        </section>
      </main>
    </div>
  );
}

function FavItem({ title, meta }) {
  return (
    <button className="fav-item">
      <div className="fav-item-left"><window.Icon_Star size={16} /></div>
      <div className="fav-item-body">
        <div className="fav-item-title">{title.toUpperCase()}</div>
        <div className="fav-item-meta">{meta}</div>
      </div>
      <div className="fav-item-right"><window.Icon_ChevronRight size={18} /></div>
    </button>
  );
}

// ============ GENERATE SCREEN ============
const MUSCLE_GROUPS = ['CHEST', 'BACK', 'SHOULDERS', 'ARMS', 'LEGS', 'CORE', 'GLUTES', 'FULL BODY'];
const GOALS = ['STRENGTH', 'HYPERTROPHY', 'ENDURANCE', 'CONDITIONING'];
const MOODS = [
  { key: 'bad',  Icon: () => <window.Icon_Frown size={28} />,     label: 'WORN' },
  { key: 'meh',  Icon: () => <window.Icon_Meh size={28} />,       label: 'FLAT' },
  { key: 'ok',   Icon: () => <window.Icon_Smile size={28} />,     label: 'READY' },
  { key: 'peak', Icon: () => <window.Icon_SmilePlus size={28} />, label: 'PEAK' },
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

  return (
    <div className="screen">
      <window.PageHeader left="back" center="NEW WORKOUT" onBack={onBack} />
      <main className="content">
        <section className="gen-section">
          <h3 className="sublabel">MUSCLE GROUPS</h3>
          <div className="chip-grid">
            {MUSCLE_GROUPS.map(g => (
              <window.Chip key={g} selected={selected.has(g)} onClick={() => toggle(g)}>{g}</window.Chip>
            ))}
          </div>
        </section>

        <section className="gen-section">
          <h3 className="sublabel">GOAL</h3>
          <div className="chip-grid">
            {GOALS.map(g => (
              <window.Chip key={g} selected={goal === g} onClick={() => setGoal(g)}>{g}</window.Chip>
            ))}
          </div>
        </section>

        <section className="gen-section">
          <div className="label-row">
            <h3 className="sublabel">INTENSITY</h3>
            <span className="sublabel accent">INT. {intensity}</span>
          </div>
          <window.Slider value={intensity} onChange={setIntensity} />
          <div className="slider-ticks">
            <span>1</span><span>3</span><span>5</span><span>7</span><span>9</span>
          </div>
        </section>

        <section className="gen-section">
          <h3 className="sublabel">HOW DO YOU FEEL?</h3>
          <div className="mood-row">
            {MOODS.map(m => (
              <button
                key={m.key}
                className={`mood-btn ${mood === m.key ? 'is-selected' : ''}`}
                onClick={() => setMood(m.key)}
              >
                <m.Icon />
                <span className="mood-label">{m.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="gen-section">
          <window.TextInput
            label="NOTES · OPTIONAL"
            value={notes}
            onChange={setNotes}
            placeholder="Bad left shoulder from years ago. Overhead press feels sketchy sometimes."
            multi
          />
        </section>

        <div className="btn-stack" style={{ marginTop: 8 }}>
          <window.CTAButton size="lg" onClick={onGenerate} iconRight={<window.Icon_Zap size={20} />}>
            GENERATE
          </window.CTAButton>
        </div>
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
        <p className="body-md">{w.desc}</p>

        <div className="meta-chips">
          <MetaChip icon={<window.Icon_Crosshair size={14} />} label={w.goal} />
          <MetaChip icon={<window.Icon_Clock size={14} />} label={w.duration} />
          <MetaChip icon={<window.Icon_Gauge size={14} />} label={w.intensity} />
          <MetaChip icon={<window.Icon_Target size={14} />} label={w.anchor} />
        </div>

        <div className="sections">
          {w.sections.map((sec, i) => (
            <window.Card key={i} cornerSize="md" padding="md">
              <div className="section-header">
                <span className="section-number">{String(i + 1).padStart(2, '0')}</span>
                <span className="section-name">{sec.name}</span>
              </div>
              <ul className="exercise-list">
                {sec.items.map((x, j) => (
                  <li key={j} className="exercise-row">
                    <span className="exercise-name">{x.name.toUpperCase()}</span>
                    <span className="exercise-sets">{x.sets}</span>
                  </li>
                ))}
              </ul>
            </window.Card>
          ))}
        </div>

        <div className="btn-stack">
          <window.CTAButton size="lg" onClick={onStart} iconRight={<window.Icon_ArrowRight size={20} />}>
            INITIATE WORKOUT
          </window.CTAButton>
          <window.CTAButton size="md" variant="secondary" onClick={onRegenerate} iconLeft={<window.Icon_Refresh size={16} />}>
            REGENERATE
          </window.CTAButton>
        </div>
      </main>
    </div>
  );
}

function MetaChip({ icon, label }) {
  return (
    <div className="meta-chip">
      <span className="meta-chip-icon">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

// ============ ACTIVE WORKOUT ============
function ActiveWorkoutScreen({ onBack, onFinish }) {
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
        center={<div className="active-progress"><div className="active-progress-fill" style={{ width: `${progress}%` }} /></div>}
        right="menu"
        onBack={onBack}
      />
      <main className="content content-active">
        <div className="active-section-label">{cur.section} · EXERCISE {exIdx + 1} / {flatEx.length}</div>
        <h1 className="active-exercise">{cur.name.toUpperCase()}</h1>
        <p className="active-sets">SET {setNum} OF 4 · {cur.sets}</p>

        {resting ? (
          <>
            <div className={`rest-timer ${lowTimer ? 'is-low' : ''}`}>
              <div className="rest-timer-inner">
                <div className="rest-label">REST</div>
                <div className="rest-time">{mm}:{ss}</div>
              </div>
            </div>
            <p className="active-cue"><em>Breathe. Shake out the shoulders. Stay loose.</em></p>
            <div className="btn-stack">
              <window.CTAButton size="lg" onClick={() => { setResting(false); setSeconds(90); }} iconRight={<window.Icon_ArrowRight size={20} />}>
                SKIP REST
              </window.CTAButton>
            </div>
          </>
        ) : (
          <>
            <div className="cue-card">
              <div className="cue-card-inner">
                <div className="cue-label">COACHING CUE</div>
                <p className="cue-body"><em>Brace the core before the press. Elbows under the bar at lockout. Don't let the hips shift.</em></p>
              </div>
            </div>
            <div className="btn-stack">
              <window.CTAButton size="lg" onClick={logSet} iconRight={<window.Icon_Check size={20} />}>
                LOG SET
              </window.CTAButton>
              <window.CTAButton size="md" variant="secondary">
                FORM ISSUE
              </window.CTAButton>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ============ DEBRIEF ============
function DebriefScreen({ onHome }) {
  const [mood, setMood] = useState(null);
  const [notes, setNotes] = useState('');
  return (
    <div className="screen">
      <window.PageHeader center="DEBRIEF" />
      <main className="content">
        <div className="debrief-hero">
          <h1 className="screen-title" style={{ fontSize: 40 }}>NICE WORK!</h1>
          <p className="body-md">45 minutes. 16 sets logged. Anchor hit at prescribed RPE.</p>
        </div>

        <window.Card cornerSize="md" padding="md">
          <div className="stat-grid">
            <Stat label="DURATION" value="45:12" />
            <Stat label="SETS" value="16 / 16" />
            <Stat label="ANCHOR" value="RPE 8" />
            <Stat label="STREAK" value="4 / 7" />
          </div>
        </window.Card>

        <section className="gen-section">
          <h3 className="sublabel">HOW DO YOU FEEL?</h3>
          <div className="mood-row">
            {MOODS.map(m => (
              <button
                key={m.key}
                className={`mood-btn ${mood === m.key ? 'is-selected' : ''}`}
                onClick={() => setMood(m.key)}
              >
                <m.Icon />
                <span className="mood-label">{m.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="gen-section">
          <window.TextInput
            label="NOTES · OPTIONAL"
            value={notes}
            onChange={setNotes}
            placeholder="Overhead felt heavy today. Lateral raises easy."
            multi
          />
        </section>

        <div className="btn-stack">
          <window.CTAButton size="lg" onClick={onHome} iconRight={<window.Icon_Check size={20} />}>
            SAVE & CLOSE
          </window.CTAButton>
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

Object.assign(window, {
  BootScreen, HomeScreen, GenerateScreen, WorkoutReadyScreen, ActiveWorkoutScreen, DebriefScreen,
});
