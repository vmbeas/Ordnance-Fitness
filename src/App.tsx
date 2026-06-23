import { useState, useEffect } from "react";

const ACCENT = "#C8A96E";
const BG = "#0F1114";
const SURFACE = "#181C21";
const SURFACE2 = "#1F242B";
const BORDER = "#2A3040";
const TEXT = "#E8EAF0";
const MUTED = "#7A8494";
const GREEN = "#52B788";
const BLUE = "#5B8DEF";
const RED = "#E05252";

const LIFTS = ["OHP", "Deadlift", "Bench", "Squat"];
const LIFT_ORDER = ["OHP", "Deadlift", "Bench", "Squat"];
const TM_INCREMENT = { OHP: 5, Bench: 5, Deadlift: 10, Squat: 10 };

const WEEK_SCHEMES = [
  { label: "Week 1 — 5s",     sets: [{ pct: 0.65, reps: 5 }, { pct: 0.75, reps: 5 }, { pct: 0.85, reps: "5+" }] },
  { label: "Week 2 — 3s",     sets: [{ pct: 0.70, reps: 3 }, { pct: 0.80, reps: 3 }, { pct: 0.90, reps: "3+" }] },
  { label: "Week 3 — 5/3/1",  sets: [{ pct: 0.75, reps: 5 }, { pct: 0.85, reps: 3 }, { pct: 0.95, reps: "1+" }] },
  { label: "Week 4 — Deload", sets: [{ pct: 0.40, reps: 5 }, { pct: 0.50, reps: 5 }, { pct: 0.60, reps: 5 }] },
];

const DEFAULT_MODS = {
  "Chin-ups": {
    current: "Banded or jumping negatives — log actual reps achieved",
    target: "3×8 unassisted by Cycle 4",
    progression: "Add 1 unassisted rep per cycle. If 0 unassisted: jumping negatives 3×8. 1–3: mixed sets. 4+: full sets."
  },
};

const LIFT_DETAILS = {
  OHP:      { tag: "Push",  mcgill: true,  accessory: [{ name: "Chin-ups", prescribed: "3×8–10", mod: true }, { name: "DB Lateral Raise", prescribed: "3×15", mod: false }, { name: "Tricep Pushdown", prescribed: "3×12", mod: false }] },
  Deadlift: { tag: "Hinge", mcgill: true,  accessory: [{ name: "Romanian Deadlift", prescribed: "3×10 @40% TM", mod: false }, { name: "Plank", prescribed: "3×60s", mod: false }, { name: "Face Pull", prescribed: "3×20", mod: false }] },
  Bench:    { tag: "Press", mcgill: true,  accessory: [{ name: "Barbell Row", prescribed: "3×10", mod: false }, { name: "DB Curl", prescribed: "3×12", mod: false }, { name: "Ab Wheel / Hollow Body", prescribed: "3×10 / 3×30s", mod: false }] },
  Squat:    { tag: "Legs",  mcgill: false, accessory: [{ name: "Hip Thrust", prescribed: "3×12", mod: false }, { name: "Nordic Curl / Leg Curl", prescribed: "3×8", mod: false }, { name: "Calf Raise", prescribed: "3×15", mod: false }] },
};

// ── Date helpers ──────────────────────────────────────────────────────────────
// Lift days are Mon=1, Wed=3, Fri=5
const LIFT_WEEKDAYS = [1, 3, 5]; // JS getDay(): 0=Sun,1=Mon,...,6=Sat
const RUN_WEEKDAYS  = [2, 4, 6]; // Tue, Thu, Sat

function toDateStr(d) { return d.toISOString().split("T")[0]; }
function today() { return toDateStr(new Date()); }

// Count how many lift days have elapsed since startDate (inclusive of startDate)
// Each lift day advances the sessionIndex by 1
function liftDaysBetween(startStr, endStr) {
  if (!startStr) return 0;
  const start = new Date(startStr + "T12:00:00");
  const end   = new Date(endStr   + "T12:00:00");
  if (end < start) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    if (LIFT_WEEKDAYS.includes(cur.getDay())) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// What lift + week scheme is active for a given date given a start date and initial sessionIndex/weekIndex
function resolveSession(startStr, baseSessionIdx, baseWeekIdx, targetStr) {
  if (!startStr) return null;
  const start  = new Date(startStr + "T12:00:00");
  const target = new Date(targetStr + "T12:00:00");
  if (target < start) return null;

  // Walk day by day counting lift days
  let liftCount = 0;
  const cur = new Date(start);
  while (cur <= target) {
    if (LIFT_WEEKDAYS.includes(cur.getDay())) {
      if (toDateStr(cur) === targetStr) {
        // This is a lift day — figure out which session
        const sessionIdx = (baseSessionIdx + liftCount) % 4;
        // Week scheme: each 3 lift days = 1 week in the schedule
        // But week advances explicitly by user, so we track by liftCount blocks of 3
        const weekIdx = (baseWeekIdx + Math.floor(liftCount / 3)) % 4;
        return { isLiftDay: true, sessionIdx, weekIdx, liftCount };
      }
      liftCount++;
    }
    cur.setDate(cur.getDate() + 1);
  }

  // Not a lift day — find the most recent lift day before target
  const prev = new Date(target);
  prev.setDate(prev.getDate() - 1);
  while (prev >= start) {
    if (LIFT_WEEKDAYS.includes(prev.getDay())) {
      const prevStr = toDateStr(prev);
      const res = resolveSession(startStr, baseSessionIdx, baseWeekIdx, prevStr);
      if (res) return { ...res, isLiftDay: false, actualDate: prevStr, todayIsRunDay: RUN_WEEKDAYS.includes(new Date(targetStr + "T12:00:00").getDay()), todayIsRest: !RUN_WEEKDAYS.includes(new Date(targetStr + "T12:00:00").getDay()) };
      break;
    }
    prev.setDate(prev.getDate() - 1);
  }
  return { isLiftDay: false, sessionIdx: baseSessionIdx, weekIdx: baseWeekIdx, liftCount: 0 };
}

// Next lift day from today
function nextLiftDay(fromStr) {
  const d = new Date(fromStr + "T12:00:00");
  d.setDate(d.getDate() + 1);
  for (let i = 0; i < 7; i++) {
    if (LIFT_WEEKDAYS.includes(d.getDay())) return toDateStr(d);
    d.setDate(d.getDate() + 1);
  }
  return null;
}

function dayName(dateStr) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

// ── Storage ───────────────────────────────────────────────────────────────────
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {} 
}
function round5(n) { return Math.round(n / 5) * 5; }
function calcPrescribed(tm, scheme) {
  return scheme.sets.map(s => ({ ...s, weight: round5(tm * s.pct) }));
}

// ── UI Primitives ─────────────────────────────────────────────────────────────
function Tag({ children, color = ACCENT }) {
  return <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color, border: `1px solid ${color}`, borderRadius: 3, padding: "2px 6px", marginLeft: 8 }}>{children}</span>;
}
function Card({ children, style = {} }) {
  return <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "20px 24px", marginBottom: 16, ...style }}>{children}</div>;
}
function SectionHeader({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: ACCENT, marginBottom: 16, paddingBottom: 8, borderBottom: `1px solid ${BORDER}` }}>{children}</div>;
}
function Input({ value, onChange, placeholder, type = "number", style = {} }) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 5, padding: "6px 10px", color: TEXT, fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box", ...style }} />;
}

// ── Set Logger ────────────────────────────────────────────────────────────────
function SetLogger({ exerciseName, prescribed, sessionKey, logs, setLogs, isTime = false }) {
  const key = `${sessionKey}__${exerciseName}`;
  const sets = logs[key] || [];
  function addSet() { setLogs({ ...logs, [key]: [...sets, { weight: "", reps: "", note: "" }] }); }
  function removeSet(i) { setLogs({ ...logs, [key]: sets.filter((_, si) => si !== i) }); }
  function updateSet(i, field, val) { setLogs({ ...logs, [key]: sets.map((s, si) => si === i ? { ...s, [field]: val } : s) }); }
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>{exerciseName}</span>
        <span style={{ fontSize: 11, color: MUTED }}>{prescribed}</span>
      </div>
      {sets.map((s, i) => (
        <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: MUTED, minWidth: 20 }}>S{i+1}</span>
          {!isTime && <Input value={s.weight} onChange={v => updateSet(i,"weight",v)} placeholder="lbs" style={{ width: 70 }} />}
          <Input value={s.reps} onChange={v => updateSet(i,"reps",v)} placeholder={isTime?"secs":"reps"} style={{ width: 60 }} />
          <Input value={s.note} onChange={v => updateSet(i,"note",v)} placeholder="note" type="text" style={{ flex: 1 }} />
          <button onClick={() => removeSet(i)} style={{ background: "none", border: "none", color: RED, cursor: "pointer", fontSize: 14, padding: "0 4px" }}>×</button>
        </div>
      ))}
      <button onClick={addSet} style={{ fontSize: 11, color: BLUE, background: "none", border: `1px dashed ${BORDER}`, borderRadius: 4, padding: "4px 10px", cursor: "pointer", marginTop: 2 }}>+ Add Set</button>
    </div>
  );
}

// ── Mod Card ──────────────────────────────────────────────────────────────────
function ModCard({ name, mod }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: `${ACCENT}10`, border: `1px solid ${ACCENT}40`, borderRadius: 6, marginBottom: 8 }}>
      <div onClick={() => setOpen(o=>!o)} style={{ padding: "8px 12px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: ACCENT, fontWeight: 700 }}>⚡ {name} — Modified</span>
        <span style={{ fontSize: 11, color: MUTED }}>{open?"▲":"▼"}</span>
      </div>
      {open && (
        <div style={{ padding: "0 12px 12px", fontSize: 12, lineHeight: 1.7 }}>
          <div style={{ color: MUTED }}><span style={{ color: TEXT, fontWeight: 700 }}>Now: </span>{mod.current}</div>
          <div style={{ color: MUTED }}><span style={{ color: GREEN, fontWeight: 700 }}>Target: </span>{mod.target}</div>
          <div style={{ color: MUTED }}><span style={{ color: BLUE, fontWeight: 700 }}>Progression: </span>{mod.progression}</div>
        </div>
      )}
    </div>
  );
}

// ── Session Logger ────────────────────────────────────────────────────────────
function SessionLogger({ tms, startDate, baseSessionIdx, baseWeekIdx, logs, setLogs, sessionHistory, setSessionHistory, mods, onGoToSetup, sheetsUrl, cycle }) {
  const [sessionNote, setSessionNote] = useState("");
  const [saveBounce, setSaveBounce] = useState(false);
  const [showOverride, setShowOverride] = useState(false);
  const [overrideLift, setOverrideLift] = useState("");
  const [overrideWeek, setOverrideWeek] = useState("");
  const [syncStatus, setSyncStatus] = useState(""); // "", "syncing", "ok", "error"

  const todayStr = today();
  const resolved = startDate ? resolveSession(startDate, baseSessionIdx, baseWeekIdx, todayStr) : null;

  const isLiftDay  = resolved?.isLiftDay;
  const showDate   = isLiftDay ? todayStr : (resolved?.actualDate || null);
  const sessionIdx = resolved?.sessionIdx ?? baseSessionIdx;
  const weekIdx    = resolved?.weekIdx    ?? baseWeekIdx;

  // Override takes priority over calculated values
  const lift      = overrideLift || LIFT_ORDER[sessionIdx % 4];
  const activeWeekIdx = overrideWeek !== "" ? parseInt(overrideWeek) : weekIdx;
  const details   = LIFT_DETAILS[lift];
  const scheme    = WEEK_SCHEMES[activeWeekIdx];
  const isDeload  = activeWeekIdx === 3;
  const tm        = tms[lift];
  const prescribed  = tm ? calcPrescribed(tm, scheme) : null;
  const fslWeight   = tm ? round5(tm * scheme.sets[0].pct) : null;
  const sessionKey  = `${showDate || todayStr}__${lift}`;

  const todayDow = new Date(todayStr + "T12:00:00").getDay();
  const isRunDay = RUN_WEEKDAYS.includes(todayDow);
  const isRestDay = !LIFT_WEEKDAYS.includes(todayDow) && !RUN_WEEKDAYS.includes(todayDow);
  const nextLift = startDate ? nextLiftDay(todayStr) : null;

  function buildSheetsPayload(entry) {
    // Flatten all sets into detail rows
    const sets = [];
    const summaryMap = {};
    Object.entries(entry.logs).forEach(([key, setArr]) => {
      const exercise = key.split("__").slice(2).join("__");
      if (!setArr || setArr.length === 0) return;
      setArr.forEach((s, i) => {
        sets.push({
          exercise,
          setNumber: i + 1,
          weight: s.weight ? parseFloat(s.weight) : "",
          reps:   s.reps   ? parseInt(s.reps)     : "",
          note:   s.note   || "",
        });
        // Build summary per exercise
        if (!summaryMap[exercise]) summaryMap[exercise] = { totalSets:0, totalReps:0, totalVolume:0, bestWeight:0, bestReps:0 };
        const sm = summaryMap[exercise];
        sm.totalSets++;
        const r = parseInt(s.reps)   || 0;
        const w = parseFloat(s.weight) || 0;
        sm.totalReps   += r;
        sm.totalVolume += r * w;
        if (w > sm.bestWeight) { sm.bestWeight = w; sm.bestReps = r; }
      });
    });
    const summary = Object.entries(summaryMap).map(([exercise, sm]) => ({ exercise, ...sm }));
    return { date: entry.date, lift: entry.lift, week: entry.week, cycle, note: entry.note, sets, summary };
  }

  async function syncToSheets(entry) {
    if (!sheetsUrl) return;
    setSyncStatus("syncing");
    try {
      const payload = buildSheetsPayload(entry);
      await fetch(sheetsUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSyncStatus("ok");
      setTimeout(() => setSyncStatus(""), 3000);
    } catch (err) {
      setSyncStatus("error");
      setTimeout(() => setSyncStatus(""), 4000);
    }
  }

  function saveSession() {
    const entry = {
      date: showDate || today(), lift, week: scheme.label,
      logs: Object.fromEntries(Object.entries(logs).filter(([k]) => k.startsWith(sessionKey))),
      note: sessionNote,
    };
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 28);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    const trimmed = sessionHistory.filter(s => s.date >= cutoffStr);
    const idx = trimmed.findIndex(s => s.date === (showDate || today()) && s.lift === lift);
    const next = idx >= 0 ? trimmed.map((s,i) => i===idx ? entry : s) : [...trimmed, entry];
    setSessionHistory(next);
    setSaveBounce(true);
    setTimeout(() => setSaveBounce(false), 2500);
    // Auto-sync to Sheets
    syncToSheets(entry);
  }

  async function manualSync() {
    const entry = {
      date: showDate || today(), lift, week: scheme.label,
      logs: Object.fromEntries(Object.entries(logs).filter(([k]) => k.startsWith(sessionKey))),
      note: sessionNote,
    };
    await syncToSheets(entry);
  }

  if (!startDate) {
    return (
      <Card>
        <SectionHeader>Today's Session</SectionHeader>
        <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
          Set a program start date so the app knows which lift to show each day.
        </p>
        <button onClick={onGoToSetup} style={{ background: ACCENT, color: "#0F1114", border: "none", borderRadius: 6, padding: "10px 22px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          Go to TM Setup →
        </button>
      </Card>
    );
  }

  return (
    <Card>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: TEXT }}>{lift}</span>
          <Tag color={MUTED}>{details.tag}</Tag>
          <Tag>{scheme.label}</Tag>
          {!isLiftDay && <Tag color={BLUE}>Last Lift</Tag>}
        </div>
        <div style={{ fontSize: 12, color: MUTED }}>
          {isLiftDay
            ? `Today — ${dayName(todayStr)}`
            : `Last lift: ${dayName(showDate)} · Today is a ${isRunDay ? "run day 🏃" : "rest day"}`}
          {nextLift && !isLiftDay && (
            <span style={{ color: ACCENT, marginLeft: 10 }}>Next lift: {dayName(nextLift)} — {LIFT_ORDER[(sessionIdx + 1) % 4]}</span>
          )}
        </div>
      </div>

      {/* Override panel */}
      <div style={{ marginBottom: 12 }}>
        <button onClick={() => setShowOverride(o => !o)} style={{
          background: "none", border: `1px solid ${showOverride ? ACCENT : BORDER}`,
          borderRadius: 6, padding: "5px 14px", fontSize: 11, fontWeight: 700,
          color: showOverride ? ACCENT : MUTED, cursor: "pointer",
          letterSpacing: "0.08em", textTransform: "uppercase"
        }}>
          {showOverride ? "▲ Hide Override" : "⚙ Override Workout"}
        </button>
        {showOverride && (
          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={{ display: "block", fontSize: 10, color: MUTED, fontWeight: 700,
                letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
                Lift
              </label>
              <select value={overrideLift} onChange={e => setOverrideLift(e.target.value)}
                style={{ width: "100%", background: SURFACE2, border: `1px solid ${BORDER}`,
                  borderRadius: 6, padding: "8px 10px", color: TEXT, fontSize: 13,
                  fontFamily: "inherit", outline: "none" }}>
                <option value="">Auto ({LIFT_ORDER[sessionIdx % 4]})</option>
                {LIFT_ORDER.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={{ display: "block", fontSize: 10, color: MUTED, fontWeight: 700,
                letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
                Week Scheme
              </label>
              <select value={overrideWeek} onChange={e => setOverrideWeek(e.target.value)}
                style={{ width: "100%", background: SURFACE2, border: `1px solid ${BORDER}`,
                  borderRadius: 6, padding: "8px 10px", color: TEXT, fontSize: 13,
                  fontFamily: "inherit", outline: "none" }}>
                <option value="">Auto ({WEEK_SCHEMES[weekIdx]?.label})</option>
                {WEEK_SCHEMES.map((w, i) => <option key={i} value={i}>{w.label}</option>)}
              </select>
            </div>
            {(overrideLift || overrideWeek !== "") && (
              <button onClick={() => { setOverrideLift(""); setOverrideWeek(""); }}
                style={{ alignSelf: "flex-end", background: "none", border: `1px solid ${RED}40`,
                  borderRadius: 6, padding: "8px 12px", color: RED, fontSize: 11,
                  fontWeight: 700, cursor: "pointer" }}>
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Run / rest banner */}
      {!isLiftDay && (
        <div style={{ background: isRunDay ? `${BLUE}15` : SURFACE2, border: `1px solid ${isRunDay ? BLUE : BORDER}`, borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13 }}>
          {isRunDay
            ? <span style={{ color: BLUE }}>🏃 <strong>Run day</strong> — Coach Greg 10K Plan. Showing last lift session below for reference.</span>
            : <span style={{ color: MUTED }}>😴 <strong>Rest day</strong> — Showing last lift session below for reference.</span>}
        </div>
      )}

      {/* Mods */}
      {details.accessory.filter(a => a.mod && mods[a.name]).map(a => (
        <ModCard key={a.name} name={a.name} mod={mods[a.name]} />
      ))}

      {details.mcgill && (
        <div style={{ fontSize: 11, color: ACCENT, background: `${ACCENT}15`, borderRadius: 4, padding: "6px 10px", marginBottom: 16 }}>
          McGill Big 3 — complete before lifting
        </div>
      )}

      {/* Main sets */}
      <div style={{ fontSize: 10, color: MUTED, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 10 }}>MAIN SETS — 5/3/1</div>
      {scheme.sets.map((s, si) => {
        const label = prescribed
          ? `${prescribed[si].weight} lbs × ${typeof s.reps==="string" ? s.reps : s.reps}${si===2&&!isDeload?" (AMRAP)":""}`
          : `${Math.round(s.pct*100)}% TM × ${s.reps}`;
        return <SetLogger key={`main-${si}`} exerciseName={`Main Set ${si+1}`} prescribed={label} sessionKey={sessionKey} logs={logs} setLogs={setLogs} />;
      })}

      {/* FSL */}
      {!isDeload && (
        <>
          <div style={{ fontSize: 10, color: MUTED, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 10, marginTop: 4 }}>FSL — 3×5</div>
          {[0,1,2].map(i => (
            <SetLogger key={`fsl-${i}`} exerciseName={`FSL Set ${i+1}`}
              prescribed={fslWeight ? `${fslWeight} lbs × 5` : `${Math.round(scheme.sets[0].pct*100)}% TM × 5`}
              sessionKey={sessionKey} logs={logs} setLogs={setLogs} />
          ))}
        </>
      )}

      {/* Accessories */}
      <div style={{ fontSize: 10, color: MUTED, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 10, marginTop: 8 }}>ACCESSORY</div>
      {details.accessory.map(a => (
        <SetLogger key={a.name} exerciseName={a.name} prescribed={a.prescribed}
          sessionKey={sessionKey} logs={logs} setLogs={setLogs} isTime={a.name==="Plank"} />
      ))}

      {/* Note */}
      <div style={{ marginTop: 16 }}>
        <label style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Session Note</label>
        <textarea value={sessionNote} onChange={e => setSessionNote(e.target.value)}
          placeholder="How did it feel? Any misses? Lower back okay?"
          style={{ width: "100%", background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "10px 14px", color: TEXT, fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", minHeight: 80, boxSizing: "border-box" }} />
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={saveSession} style={{ background: saveBounce ? GREEN : ACCENT, color: "#0F1114", border: "none", borderRadius: 6, padding: "12px 28px", fontWeight: 700, fontSize: 14, cursor: "pointer", transition: "background 0.2s" }}>
          {saveBounce ? "✓ Session Saved" : "Save Session"}
        </button>
        {sheetsUrl && (
          <button onClick={manualSync} style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "12px 20px", fontWeight: 700, fontSize: 13, color: MUTED, cursor: "pointer" }}>
            {syncStatus === "syncing" ? "⟳ Syncing..." : syncStatus === "ok" ? "✓ Synced to Sheets" : syncStatus === "error" ? "✗ Sync Failed" : "↑ Sync to Sheets"}
          </button>
        )}
        {syncStatus === "ok"    && <span style={{ fontSize: 11, color: GREEN }}>Google Sheets updated</span>}
        {syncStatus === "error" && <span style={{ fontSize: 11, color: RED }}>Check your Apps Script URL in Setup</span>}
      </div>
    </Card>
  );
}

// ── TM Setup (now includes start date) ───────────────────────────────────────
function TMSetup({ tms, setTms, startDate, setStartDate, baseSessionIdx, setBaseSessionIdx, baseWeekIdx, setBaseWeekIdx, sheetsUrl, setSheetsUrl }) {
  const [inputs, setInputs] = useState(Object.fromEntries(LIFTS.map(l => [l, tms[l] ? Math.round(tms[l]/0.9) : ""])));
  const [dateInput, setDateInput] = useState(startDate || "");
  const [sessionInput, setSessionInput] = useState(String(baseSessionIdx));
  const [weekInput, setWeekInput] = useState(String(baseWeekIdx));
  const [sheetsUrlInput, setSheetsUrlInput] = useState(sheetsUrl || "");
  const allFilled = LIFTS.every(l => inputs[l] && !isNaN(parseFloat(inputs[l])));

  function handleApply() {
    const next = {};
    LIFTS.forEach(l => { const r = parseFloat(inputs[l]); if (!isNaN(r) && r > 0) next[l] = round5(r*0.9); });
    if (Object.keys(next).length === LIFTS.length) setTms(next);
    if (dateInput) setStartDate(dateInput);
    if (sheetsUrlInput.trim()) setSheetsUrl(sheetsUrlInput.trim());
    const si = parseInt(sessionInput);
    const wi = parseInt(weekInput);
    if (!isNaN(si) && si >= 0 && si < 4) setBaseSessionIdx(si);
    if (!isNaN(wi) && wi >= 0 && wi < 4) setBaseWeekIdx(wi);
  }

  return (
    <Card>
      <SectionHeader>Program Setup</SectionHeader>
      <p style={{ color: MUTED, fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
        Set your 1RMs, program start date, and where you are in the cycle.
        The app uses the start date to automatically show the right lift each day.
      </p>

      {/* Start date */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: "block", fontSize: 11, color: MUTED, marginBottom: 6, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Program Start Date
        </label>
        <input type="date" value={dateInput} onChange={e => setDateInput(e.target.value)}
          style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "10px 14px", color: TEXT, fontSize: 14, fontFamily: "inherit", outline: "none" }} />
        <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>
          Set this to the Monday you begin Week 1. The app counts lift days from here.
        </div>
      </div>

      {/* Lift rotation & week — for restoring from Notion export */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        <div>
          <label style={{ display: "block", fontSize: 11, color: MUTED, marginBottom: 6, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Rotation Position (0–3)
          </label>
          <select value={sessionInput} onChange={e => setSessionInput(e.target.value)}
            style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "10px 14px", color: TEXT, fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%" }}>
            {LIFT_ORDER.map((l, i) => <option key={i} value={i}>{i} — starts on {l}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: MUTED, marginBottom: 6, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Current Week
          </label>
          <select value={weekInput} onChange={e => setWeekInput(e.target.value)}
            style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "10px 14px", color: TEXT, fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%" }}>
            {WEEK_SCHEMES.map((w, i) => <option key={i} value={i}>{w.label}</option>)}
          </select>
        </div>
      </div>

      {/* 1RMs */}
      <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
        1RM Estimates (lbs)
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        {LIFTS.map(lift => (
          <div key={lift}>
            <label style={{ display: "block", fontSize: 11, color: MUTED, marginBottom: 6, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>{lift}</label>
            <Input value={inputs[lift]} onChange={v => setInputs(p => ({ ...p, [lift]: v }))} placeholder="e.g. 185" />
            {inputs[lift] && !isNaN(parseFloat(inputs[lift])) && (
              <div style={{ fontSize: 11, color: ACCENT, marginTop: 4 }}>TM = {round5(parseFloat(inputs[lift])*0.9)} lbs</div>
            )}
          </div>
        ))}
      </div>

      {/* Google Sheets URL */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: "block", fontSize: 11, color: MUTED, marginBottom: 6,
          fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Google Sheets Web App URL
        </label>
        <Input value={sheetsUrlInput} onChange={setSheetsUrlInput} type="text"
          placeholder="https://script.google.com/macros/s/..." style={{ fontSize: 12 }} />
        <div style={{ fontSize: 11, color: MUTED, marginTop: 6, lineHeight: 1.5 }}>
          Paste your Apps Script deployment URL here. Sessions auto-sync to Google Sheets on save.
          Leave blank to skip Sheets sync.
        </div>
      </div>

      <button onClick={handleApply} disabled={!allFilled || !dateInput} style={{
        background: (allFilled && dateInput) ? ACCENT : BORDER,
        color: (allFilled && dateInput) ? "#0F1114" : MUTED,
        border: "none", borderRadius: 6, padding: "12px 28px", fontWeight: 700, fontSize: 14,
        cursor: (allFilled && dateInput) ? "pointer" : "default" }}>
        Save Setup →
      </button>
    </Card>
  );
}

// ── Week Overview ─────────────────────────────────────────────────────────────
function WeekOverview({ startDate, baseSessionIdx, baseWeekIdx }) {
  const todayStr = today();
  const resolved = startDate ? resolveSession(startDate, baseSessionIdx, baseWeekIdx, todayStr) : null;
  const sessionIdx = resolved?.sessionIdx ?? baseSessionIdx;
  const weekIdx    = resolved?.weekIdx    ?? baseWeekIdx;

  function getLift(offset) { return LIFT_ORDER[(sessionIdx + offset) % 4]; }
  const liftDays = [{ day: "Monday", lift: getLift(0) }, { day: "Wednesday", lift: getLift(1) }, { day: "Friday", lift: getLift(2) }];

  return (
    <Card>
      <SectionHeader>This Week's Schedule</SectionHeader>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 16 }}>
        Auto-calculated from start date · {WEEK_SCHEMES[weekIdx].label}
      </div>

      {/* 7-day strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 20 }}>
        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d, i) => {
          const dow = [1,2,3,4,5,6,0][i];
          const isLift = LIFT_WEEKDAYS.includes(dow);
          const isRun  = RUN_WEEKDAYS.includes(dow);
          const liftSlot = liftDays.find(ld => ld.day === ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][i]);
          const isToday = new Date(todayStr+"T12:00:00").getDay() === dow;
          return (
            <div key={d} style={{ background: isToday ? `${ACCENT}20` : SURFACE2,
              border: `1px solid ${isToday ? ACCENT : isRun ? `${BLUE}40` : BORDER}`,
              borderRadius: 6, padding: "8px 4px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: isToday ? ACCENT : MUTED, fontWeight: 700, marginBottom: 4 }}>{d}</div>
              {liftSlot && <div style={{ fontSize: 10, color: ACCENT, fontWeight: 700 }}>{liftSlot.lift}</div>}
              {isRun && <div style={{ fontSize: 10, color: BLUE }}>Run</div>}
              {!isLift && !isRun && <div style={{ fontSize: 10, color: MUTED }}>Rest</div>}
            </div>
          );
        })}
      </div>

      {/* 4-week rotation preview */}
      <div style={{ fontSize: 10, color: MUTED, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 8 }}>LIFT ROTATION — NEXT 4 WEEKS</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
        {[0,1,2,3].map(wo => {
          const mon = LIFT_ORDER[(sessionIdx + wo*3) % 4];
          const wed = LIFT_ORDER[(sessionIdx + wo*3+1) % 4];
          const fri = LIFT_ORDER[(sessionIdx + wo*3+2) % 4];
          return (
            <div key={wo} style={{ background: wo===0?`${ACCENT}15`:SURFACE2, border:`1px solid ${wo===0?ACCENT:BORDER}`, borderRadius: 7, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: wo===0?ACCENT:MUTED, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 6 }}>{wo===0?"THIS WEEK":`WEEK +${wo}`}</div>
              {[["Mon",mon],["Wed",wed],["Fri",fri]].map(([d,l]) => (
                <div key={d} style={{ fontSize: 12, display: "flex", justifyContent: "space-between", padding: "2px 0", color: l==="Squat"?GREEN:TEXT }}>
                  <span style={{ color: MUTED }}>{d}</span><span style={{ fontWeight: l==="Squat"?700:400 }}>{l}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 12, color: MUTED, background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 14px" }}>
        <span style={{ color: ACCENT, fontWeight: 700 }}>⚠ Watch: </span>Wed Deadlift → Thu Run. Monitor for 2 weeks before adjusting.
      </div>
    </Card>
  );
}

// ── Cycle Tracker ─────────────────────────────────────────────────────────────
function CycleTracker({ tms, setTms, cycle, setCycle }) {
  const hasTMs = LIFTS.every(l => tms[l]);
  const [editingTMs, setEditingTMs] = useState(false);
  const [tmInputs, setTmInputs] = useState(Object.fromEntries(LIFTS.map(l => [l, tms[l] || ""])));
  const [tmSaved, setTmSaved] = useState(false);

  function advance() {
    const next = {}; LIFTS.forEach(l => { next[l] = tms[l] + TM_INCREMENT[l]; });
    setTms(next); setCycle(c => c+1);
  }

  function saveTMs() {
    const next = {};
    LIFTS.forEach(l => {
      const v = parseFloat(tmInputs[l]);
      if (!isNaN(v) && v > 0) next[l] = round5(v);
    });
    if (Object.keys(next).length === LIFTS.length) {
      setTms(next);
      setEditingTMs(false);
      setTmSaved(true);
      setTimeout(() => setTmSaved(false), 2000);
    }
  }

  return (
    <Card>
      <SectionHeader>Cycle Tracker — Cycle {cycle}</SectionHeader>
      <p style={{ color: MUTED, fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
        Only advance after the deload week. Hold TM flat on a cut if AMRAP felt like a grind.
        Use <strong style={{ color: ACCENT }}>Edit TMs</strong> anytime to manually adjust — mid-cycle resets, failed reps, or corrections.
      </p>

      {/* TM cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: 10, marginBottom: 16 }}>
        {LIFTS.map(l => (
          <div key={l} style={{ background: SURFACE2, border: `1px solid ${editingTMs ? ACCENT : BORDER}`, borderRadius: 8, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 6 }}>{l}</div>
            {editingTMs ? (
              <>
                <input type="number" value={tmInputs[l]}
                  onChange={e => setTmInputs(p => ({ ...p, [l]: e.target.value }))}
                  placeholder="lbs TM"
                  style={{ width: "100%", background: SURFACE, border: `1px solid ${ACCENT}`,
                    borderRadius: 5, padding: "6px 8px", color: TEXT, fontSize: 15,
                    fontWeight: 700, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                <div style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>
                  ≈ {tmInputs[l] && !isNaN(parseFloat(tmInputs[l])) ? Math.round(parseFloat(tmInputs[l]) / 0.9) : "—"} lbs 1RM
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 22, fontWeight: 700, color: TEXT }}>
                  {hasTMs ? tms[l] : "—"}
                  <span style={{ fontSize: 11, color: MUTED, fontWeight: 400 }}> lbs TM</span>
                </div>
                <div style={{ fontSize: 11, color: GREEN, marginTop: 2 }}>+{TM_INCREMENT[l]} lbs next cycle</div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Edit / Save TM buttons */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        {editingTMs ? (
          <>
            <button onClick={saveTMs} style={{ background: GREEN, color: "#0F1114", border: "none",
              borderRadius: 6, padding: "10px 22px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              Save TMs
            </button>
            <button onClick={() => { setEditingTMs(false); setTmInputs(Object.fromEntries(LIFTS.map(l => [l, tms[l] || ""]))); }}
              style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 6,
                padding: "10px 18px", color: MUTED, fontSize: 13, cursor: "pointer" }}>
              Cancel
            </button>
          </>
        ) : (
          <button onClick={() => { setEditingTMs(true); setTmInputs(Object.fromEntries(LIFTS.map(l => [l, tms[l] || ""]))); }}
            style={{ background: SURFACE2, border: `1px solid ${ACCENT}`, borderRadius: 6,
              padding: "10px 22px", color: ACCENT, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            ✏ Edit TMs
          </button>
        )}
        {tmSaved && <span style={{ alignSelf: "center", fontSize: 12, color: GREEN, fontWeight: 700 }}>✓ TMs updated</span>}
      </div>

      {/* Advance cycle */}
      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 20 }}>
        <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: "0.1em",
          textTransform: "uppercase", marginBottom: 10 }}>END OF CYCLE — ADVANCE</div>
        <button onClick={advance} disabled={!hasTMs} style={{
          background: hasTMs ? GREEN : BORDER, color: hasTMs ? "#0F1114" : MUTED,
          border: "none", borderRadius: 6, padding: "12px 28px", fontWeight: 700,
          fontSize: 14, cursor: hasTMs ? "pointer" : "default" }}>
          Complete Deload → Advance to Cycle {cycle+1}
        </button>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>
          Advances all TMs by standard increments: OHP +5, Bench +5, Deadlift +10, Squat +10
        </div>
      </div>
    </Card>
  );
}

// ── Mods Manager ──────────────────────────────────────────────────────────────
function ModsManager({ mods, setMods }) {
  const [editing, setEditing] = useState(null);
  const [newName, setNewName] = useState("");
  const [form, setForm] = useState({ current:"", target:"", progression:"" });

  function startEdit(name) { setEditing(name); setForm(mods[name]||{current:"",target:"",progression:""}); }
  function saveEdit() { setMods({...mods,[editing]:form}); setEditing(null); }
  function addNew() { if(!newName.trim())return; setMods({...mods,[newName.trim()]:{current:"",target:"",progression:""}}); setNewName(""); }
  function deleteMod(name) { const n={...mods}; delete n[name]; setMods(n); }

  return (
    <Card>
      <SectionHeader>Modifications & Progressions</SectionHeader>
      <p style={{ color: MUTED, fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>Track scaled exercises and progression targets. These appear as expandable cards in Today's session.</p>
      {Object.entries(mods).map(([name, mod]) => (
        <div key={name} style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 16, marginBottom: 12 }}>
          {editing===name ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: ACCENT, marginBottom: 12 }}>{name}</div>
              {["current","target","progression"].map(field => (
                <div key={field} style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>{field}</label>
                  <textarea value={form[field]} onChange={e => setForm(p=>({...p,[field]:e.target.value}))}
                    style={{ width:"100%", background:SURFACE, border:`1px solid ${BORDER}`, borderRadius:5, padding:"8px 10px", color:TEXT, fontSize:13, fontFamily:"inherit", outline:"none", resize:"vertical", minHeight:60, boxSizing:"border-box" }} />
                </div>
              ))}
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={saveEdit} style={{ background:GREEN, color:"#0F1114", border:"none", borderRadius:5, padding:"8px 16px", fontWeight:700, fontSize:12, cursor:"pointer" }}>Save</button>
                <button onClick={()=>setEditing(null)} style={{ background:SURFACE, border:`1px solid ${BORDER}`, borderRadius:5, padding:"8px 16px", color:MUTED, fontSize:12, cursor:"pointer" }}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                <span style={{ fontSize:13, fontWeight:700, color:ACCENT }}>⚡ {name}</span>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={()=>startEdit(name)} style={{ background:"none", border:`1px solid ${BORDER}`, borderRadius:4, padding:"3px 10px", color:MUTED, fontSize:11, cursor:"pointer" }}>Edit</button>
                  <button onClick={()=>deleteMod(name)} style={{ background:"none", border:`1px solid ${RED}40`, borderRadius:4, padding:"3px 10px", color:RED, fontSize:11, cursor:"pointer" }}>Remove</button>
                </div>
              </div>
              <div style={{ fontSize:12, color:MUTED, lineHeight:1.7 }}>
                <div><span style={{ color:TEXT, fontWeight:700 }}>Now: </span>{mod.current}</div>
                <div><span style={{ color:GREEN, fontWeight:700 }}>Target: </span>{mod.target}</div>
                <div><span style={{ color:BLUE, fontWeight:700 }}>Progression: </span>{mod.progression}</div>
              </div>
            </>
          )}
        </div>
      ))}
      <div style={{ display:"flex", gap:8, marginTop:8 }}>
        <Input value={newName} onChange={setNewName} placeholder="Exercise name" type="text" style={{ flex:1 }} />
        <button onClick={addNew} style={{ background:ACCENT, color:"#0F1114", border:"none", borderRadius:6, padding:"8px 16px", fontWeight:700, fontSize:12, cursor:"pointer", whiteSpace:"nowrap" }}>+ Add Mod</button>
      </div>
    </Card>
  );
}

// ── History ───────────────────────────────────────────────────────────────────
function History({ sessionHistory }) {
  if (sessionHistory.length===0) return (
    <Card><SectionHeader>Session History — Last 4 Weeks</SectionHeader>
      <p style={{ color:MUTED, fontSize:13 }}>No sessions logged yet.</p></Card>
  );
  const sorted = [...sessionHistory].sort((a,b)=>b.date.localeCompare(a.date));
  return (
    <Card>
      <SectionHeader>Session History — Last 4 Weeks</SectionHeader>
      {sorted.map((session,i) => (
        <div key={i} style={{ marginBottom:20, paddingBottom:20, borderBottom:i<sorted.length-1?`1px solid ${BORDER}`:"none" }}>
          <div style={{ display:"flex", alignItems:"center", marginBottom:10, flexWrap:"wrap", gap:8 }}>
            <span style={{ fontSize:14, fontWeight:700, color:TEXT }}>{session.lift}</span>
            <Tag color={MUTED}>{session.week}</Tag>
            <span style={{ fontSize:12, color:MUTED, marginLeft:"auto" }}>{session.date}</span>
          </div>
          {Object.entries(session.logs).map(([key,sets]) => {
            const exName = key.split("__").slice(2).join("__");
            if (!sets||sets.length===0) return null;
            return (
              <div key={key} style={{ marginBottom:8 }}>
                <div style={{ fontSize:11, color:MUTED, fontWeight:700, marginBottom:4 }}>{exName}</div>
                {sets.map((s,si) => (
                  <div key={si} style={{ fontSize:12, color:TEXT, padding:"2px 0", display:"flex", gap:12 }}>
                    <span style={{ color:MUTED }}>S{si+1}</span>
                    {s.weight&&<span>{s.weight} lbs</span>}
                    {s.reps&&<span>× {s.reps}</span>}
                    {s.note&&<span style={{ color:MUTED }}>— {s.note}</span>}
                  </div>
                ))}
              </div>
            );
          })}
          {session.note&&<div style={{ fontSize:12, color:MUTED, fontStyle:"italic", marginTop:8, borderLeft:`2px solid ${BORDER}`, paddingLeft:10 }}>{session.note}</div>}
        </div>
      ))}
    </Card>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────
function ExportSnapshot({ tms, startDate, baseSessionIdx, baseWeekIdx, cycle, sessionHistory, mods }) {
  const [copied, setCopied] = useState(false);
  const hasTMs = LIFTS.every(l=>tms[l]);
  const todayStr = today();
  const resolved = startDate ? resolveSession(startDate, baseSessionIdx, baseWeekIdx, todayStr) : null;
  const sessionIdx = resolved?.sessionIdx ?? baseSessionIdx;
  const weekIdx    = resolved?.weekIdx    ?? baseWeekIdx;
  const dateLabel  = new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"});

  const recent = [...sessionHistory].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10);
  function formatSession(s) {
    let out = `### ${s.date} — ${s.lift} (${s.week})\n`;
    Object.entries(s.logs).forEach(([key,sets]) => {
      if(!sets||sets.length===0)return;
      const name=key.split("__").slice(2).join("__");
      out+=`**${name}**\n`;
      sets.forEach((st,i)=>{
        const parts=[`S${i+1}`];
        if(st.weight)parts.push(`${st.weight} lbs`);
        if(st.reps)parts.push(`× ${st.reps}`);
        if(st.note)parts.push(`(${st.note})`);
        out+=`- ${parts.join(" ")}\n`;
      });
    });
    if(s.note)out+=`*Note: ${s.note}*\n`;
    return out;
  }

  const snapshot = `## Ordnance Fitness Export — ${dateLabel}

**Program:** 5/3/1 FSL · 3-Day Lift · Coach Greg 10K
**Cycle:** ${cycle} | **Week:** ${WEEK_SCHEMES[weekIdx]?.label} | **Start Date:** ${startDate||"not set"}
**Rotation Position:** ${sessionIdx} (next lift: ${LIFT_ORDER[sessionIdx%4]})

## Training Maxes
${hasTMs?LIFTS.map(l=>`- ${l}: ${tms[l]} lbs TM (≈${Math.round(tms[l]/0.9)} lbs 1RM)`).join("\n"):"Not set"}

## Active Modifications
${Object.entries(mods).map(([name,m])=>`### ${name}\n- Now: ${m.current}\n- Target: ${m.target}\n- Progression: ${m.progression}`).join("\n\n")||"None"}

## Session Log — Last 4 Weeks
${recent.length>0?recent.map(formatSession).join("\n"):"No sessions logged yet."}

## Restore Instructions
1. Open TM Setup → set start date to ${startDate||"your start date"}
2. Set rotation position to ${sessionIdx} and week to "${WEEK_SCHEMES[weekIdx]?.label}"
3. Enter TMs above
`;

  function handleCopy() {
    navigator.clipboard.writeText(snapshot).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),2500); });
  }

  return (
    <Card>
      <SectionHeader>Export → Notion</SectionHeader>
      <p style={{ color:MUTED, fontSize:13, marginBottom:16, lineHeight:1.6 }}>Full snapshot including TMs, modifications, session logs, and restore instructions. Paste into Notion after every deload.</p>
      <pre style={{ background:SURFACE2, border:`1px solid ${BORDER}`, borderRadius:8, padding:"16px 18px", fontSize:11, color:TEXT, lineHeight:1.8, whiteSpace:"pre-wrap", wordBreak:"break-word", marginBottom:16, fontFamily:"'SF Mono',monospace", maxHeight:400, overflowY:"auto" }}>
        {snapshot}
      </pre>
      <button onClick={handleCopy} style={{ background:copied?`${GREEN}20`:ACCENT, border:`1px solid ${copied?GREEN:ACCENT}`, borderRadius:6, padding:"12px 28px", fontWeight:700, fontSize:14, color:copied?GREEN:"#0F1114", cursor:"pointer" }}>
        {copied?"✓ Copied to Clipboard":"Copy Snapshot"}
      </button>
    </Card>
  );
}

// ── Notes ─────────────────────────────────────────────────────────────────────
function ProgramNotes() {
  const notes = [
    { title:"Why FSL instead of BBB", color:ACCENT, body:"BBB's 5×10 is contraindicated on a caloric deficit. FSL (3×5 at your lightest working weight) maintains volume without wrecking recovery. Switch to BBB when you hit maintenance near 160 lbs." },
    { title:"3-day rotation", color:BLUE, body:"OHP → Deadlift → Bench → Squat rotates across Mon/Wed/Fri continuously. Each lift hits every ~8 days. A full 5/3/1 cycle takes ~5 weeks on this split — normal and Wendler-endorsed." },
    { title:"Cut-phase expectations", color:BLUE, body:"Strength will feel flat. Don't chase PRs — chase quality reps. Hold TM flat an extra cycle if AMRAP sets felt like a true grind." },
    { title:"AFT maintenance", color:GREEN, body:"OHP + chin-ups → HRP. Deadlift + plank → Deadlift + Plank events. Coach Greg 10K builds more aerobic base than a straight 2-mile plan — your 17:13 is protected and should improve." },
    { title:"McGill Big 3", color:MUTED, body:"Bird-dog, curl-up, side plank — pre-lift on OHP/Deadlift/Bench days. Non-negotiable." },
    { title:"Wed → Thu flag", color:ACCENT, body:"Deadlift day followed by a run day. Monitor the first 2 weeks. Swap if consistently problematic." },
  ];
  return (
    <Card>
      <SectionHeader>Program Notes</SectionHeader>
      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
        {notes.map((n,i)=>(
          <div key={i} style={{ borderLeft:`3px solid ${n.color}`, paddingLeft:16 }}>
            <div style={{ fontSize:13, fontWeight:700, color:TEXT, marginBottom:4 }}>{n.title}</div>
            <div style={{ fontSize:13, color:MUTED, lineHeight:1.65 }}>{n.body}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [tms,              setTmsRaw]            = useState(()=>load("of_tms",{}));
  const [startDate,        setStartDateRaw]       = useState(()=>load("of_startdate",""));
  const [baseSessionIdx,   setBaseSessionIdxRaw]  = useState(()=>load("of_session",0));
  const [baseWeekIdx,      setBaseWeekIdxRaw]     = useState(()=>load("of_week",0));
  const [cycle,            setCycleRaw]           = useState(()=>load("of_cycle",1));
  const [logs,             setLogsRaw]            = useState(()=>load("of_logs",{}));
  const [sessionHistory,   setSessionHistoryRaw]  = useState(()=>load("of_history",[]));
  const [mods,             setModsRaw]            = useState(()=>load("of_mods",DEFAULT_MODS));
  const [sheetsUrl,        setSheetsUrlRaw]       = useState(() => load("of_sheetsurl", ""));
  const [tab,              setTab]                = useState("session");
  const [restored,         setRestored]           = useState(false);
  const [urlCopied,        setUrlCopied]          = useState(false);

  function setTms(v)            { const val=typeof v==="function"?v(tms):v;           save("of_tms",val);       setTmsRaw(val); }
  function setStartDate(v)      { save("of_startdate",v);                                                        setStartDateRaw(v); }
  function setBaseSessionIdx(v) { const val=typeof v==="function"?v(baseSessionIdx):v; save("of_session",val);  setBaseSessionIdxRaw(val); }
  function setBaseWeekIdx(v)    { const val=typeof v==="function"?v(baseWeekIdx):v;   save("of_week",val);      setBaseWeekIdxRaw(val); }
  function setCycle(v)          { const val=typeof v==="function"?v(cycle):v;         save("of_cycle",val);     setCycleRaw(val); }
  function setLogs(v)           { const val=typeof v==="function"?v(logs):v;          save("of_logs",val);      setLogsRaw(val); }
  function setSessionHistory(v) { const val=typeof v==="function"?v(sessionHistory):v; save("of_history",val); setSessionHistoryRaw(val); }
  function setMods(v)           { const val=typeof v==="function"?v(mods):v;          save("of_mods",val);      setModsRaw(val); }
  function setSheetsUrl(v)      { save("of_sheetsurl", v);                                                                 setSheetsUrlRaw(v); }

  useEffect(()=>{
    if(Object.keys(tms).length>0&&startDate){ setRestored(true); setTimeout(()=>setRestored(false),2500); }
  },[]);

  function copyUrl() { navigator.clipboard.writeText(window.location.href).then(()=>{ setUrlCopied(true); setTimeout(()=>setUrlCopied(false),2500); }); }

  const hasTMs = LIFTS.every(l=>tms[l]);
  const isSetup = !hasTMs || !startDate;

  // Compute today's context for header
  const todayStr = today();
  const resolved = startDate ? resolveSession(startDate, baseSessionIdx, baseWeekIdx, todayStr) : null;
  const todayLift = resolved ? LIFT_ORDER[(resolved.sessionIdx)%4] : null;
  const todayDow  = new Date(todayStr+"T12:00:00").getDay();
  const todayType = LIFT_WEEKDAYS.includes(todayDow) ? "Lift" : RUN_WEEKDAYS.includes(todayDow) ? "Run" : "Rest";

  const tabs = [
    { id:"session",  label:"Today" },
    { id:"overview", label:"Schedule" },
    { id:"cycle",    label:"Cycle" },
    { id:"mods",     label:"Mods" },
    { id:"history",  label:"History" },
    { id:"notes",    label:"Notes" },
    { id:"setup",    label:"Setup" },
    { id:"export",   label:"Export" },
  ];

  return (
    <div style={{ background:BG, minHeight:"100vh", fontFamily:"'Inter','SF Pro Display',system-ui,sans-serif", color:TEXT, paddingBottom:60 }}>
      <div style={{ background:SURFACE, borderBottom:`1px solid ${BORDER}`, padding:"18px 24px 0" }}>
        <div style={{ maxWidth:960, margin:"0 auto" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4, flexWrap:"wrap", gap:8 }}>
            <div style={{ display:"flex", alignItems:"baseline", gap:12 }}>
              <h1 style={{ margin:0, fontSize:20, fontWeight:800, letterSpacing:"-0.02em" }}>ORDNANCE FITNESS</h1>
              <span style={{ fontSize:10, color:ACCENT, fontWeight:700, letterSpacing:"0.15em" }}>5/3/1 FSL · COACH GREG 10K</span>
            </div>
            <button onClick={copyUrl} style={{ background:urlCopied?`${GREEN}20`:SURFACE2, border:`1px solid ${urlCopied?GREEN:BORDER}`, borderRadius:5, padding:"4px 12px", fontSize:11, fontWeight:700, color:urlCopied?GREEN:MUTED, cursor:"pointer", textTransform:"uppercase", letterSpacing:"0.08em" }}>
              {urlCopied?"✓ Copied":"Copy URL"}
            </button>
          </div>
          <p style={{ margin:"2px 0 14px", fontSize:12, color:MUTED }}>
            {isSetup
              ? <span style={{ color:ACCENT }}>→ Complete Setup to begin</span>
              : <span>
                  {todayType === "Lift" && <span style={{ color:ACCENT, fontWeight:700 }}>Today: {todayLift} · </span>}
                  {todayType === "Run"  && <span style={{ color:BLUE,  fontWeight:700 }}>Today: Run Day · </span>}
                  {todayType === "Rest" && <span style={{ color:MUTED, fontWeight:700 }}>Today: Rest · </span>}
                  Cycle {cycle} · {WEEK_SCHEMES[baseWeekIdx].label}
                  {restored && <span style={{ color:GREEN, marginLeft:10, fontWeight:700 }}>✓ Restored</span>}
                </span>
            }
          </p>
          <div style={{ display:"flex", gap:0, overflowX:"auto" }}>
            {tabs.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{ background:"none", border:"none", cursor:"pointer", padding:"8px 14px", fontSize:12, fontWeight:600, whiteSpace:"nowrap", color:tab===t.id?ACCENT:MUTED, borderBottom:`2px solid ${tab===t.id?ACCENT:"transparent"}` }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth:960, margin:"0 auto", padding:"24px 16px 0" }}>
        {isSetup && tab!=="setup" && (
          <div style={{ background:`${ACCENT}15`, border:`1px solid ${ACCENT}`, borderRadius:8, padding:"10px 16px", marginBottom:16, fontSize:13, color:ACCENT }}>
            → Complete Setup first — set your 1RMs and start date.
            <button onClick={()=>setTab("setup")} style={{ background:"none", border:"none", color:ACCENT, fontWeight:700, cursor:"pointer", textDecoration:"underline", marginLeft:8 }}>Go to Setup</button>
          </div>
        )}

        {tab==="session"  && <SessionLogger tms={tms} startDate={startDate} baseSessionIdx={baseSessionIdx} baseWeekIdx={baseWeekIdx} logs={logs} setLogs={setLogs} sessionHistory={sessionHistory} setSessionHistory={setSessionHistory} mods={mods} onGoToSetup={()=>setTab("setup")} sheetsUrl={sheetsUrl} cycle={cycle} />}
        {tab==="overview" && <WeekOverview startDate={startDate} baseSessionIdx={baseSessionIdx} baseWeekIdx={baseWeekIdx} />}
        {tab==="cycle"    && <CycleTracker tms={tms} setTms={setTms} cycle={cycle} setCycle={setCycle} />}
        {tab==="mods"     && <ModsManager mods={mods} setMods={setMods} />}
        {tab==="history"  && <History sessionHistory={sessionHistory} />}
        {tab==="notes"    && <ProgramNotes />}
        {tab==="setup"    && <TMSetup tms={tms} setTms={setTms} startDate={startDate} setStartDate={setStartDate} baseSessionIdx={baseSessionIdx} setBaseSessionIdx={setBaseSessionIdx} baseWeekIdx={baseWeekIdx} setBaseWeekIdx={setBaseWeekIdx} sheetsUrl={sheetsUrl} setSheetsUrl={setSheetsUrl} />}
        {tab==="export"   && <ExportSnapshot tms={tms} startDate={startDate} baseSessionIdx={baseSessionIdx} baseWeekIdx={baseWeekIdx} cycle={cycle} sessionHistory={sessionHistory} mods={mods} />}
      </div>
    </div>
  );
}
