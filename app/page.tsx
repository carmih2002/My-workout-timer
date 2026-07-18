"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type TimerItem = { id: string; name: string; seconds: number };
type Phase = "ready" | "running" | "paused" | "finished";
type SavedSession = { index: number; remaining: number; phase: Phase };

const DEFAULT_TIMERS: TimerItem[] = [
  { id: "warmup", name: "תרגיל ראשון", seconds: 30 },
  { id: "main", name: "תרגיל שני", seconds: 60 },
  { id: "finish", name: "תרגיל שלישי", seconds: 20 },
];

const formatTime = (seconds: number) => {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
};

const makeId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export default function Home() {
  const [timers, setTimers] = useState<TimerItem[]>(DEFAULT_TIMERS);
  const [screen, setScreen] = useState<"setup" | "workout">("setup");
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState(DEFAULT_TIMERS[0].seconds);
  const [phase, setPhase] = useState<Phase>("ready");
  const [hydrated, setHydrated] = useState(false);
  const endAt = useRef<number | null>(null);

  useEffect(() => {
    /* Reading device-local preferences requires one hydration update. */
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const storedTimers = localStorage.getItem("workout-timers");
      if (storedTimers) {
        const parsed = JSON.parse(storedTimers) as TimerItem[];
        if (Array.isArray(parsed) && parsed.length) setTimers(parsed);
      }
    } catch {}
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("workout-timers", JSON.stringify(timers));
  }, [timers, hydrated]);

  useEffect(() => {
    if (!hydrated || screen !== "workout") return;
    const saved: SavedSession = { index, remaining, phase: phase === "running" ? "paused" : phase };
    localStorage.setItem("workout-session", JSON.stringify(saved));
  }, [index, remaining, phase, screen, hydrated]);

  const soundAlarm = useCallback(() => {
    try {
      const AudioContextClass = window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      [0, 0.22, 0.44].forEach((delay) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.28, ctx.currentTime + delay + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.16);
        oscillator.connect(gain).connect(ctx.destination);
        oscillator.start(ctx.currentTime + delay);
        oscillator.stop(ctx.currentTime + delay + 0.18);
      });
      window.setTimeout(() => void ctx.close(), 900);
      navigator.vibrate?.([180, 80, 180]);
    } catch {}
  }, []);

  const finishTimer = useCallback(() => {
    soundAlarm();
    endAt.current = null;
    if (index >= timers.length - 1) {
      setRemaining(0);
      setPhase("finished");
      localStorage.removeItem("workout-session");
      return;
    }
    const next = index + 1;
    setIndex(next);
    setRemaining(timers[next].seconds);
    setPhase("ready");
  }, [index, timers, soundAlarm]);

  useEffect(() => {
    if (phase !== "running") return;
    const tick = () => {
      const left = Math.max(0, Math.ceil(((endAt.current ?? Date.now()) - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) finishTimer();
    };
    tick();
    const interval = window.setInterval(tick, 200);
    return () => window.clearInterval(interval);
  }, [phase, finishTimer]);

  const totalSeconds = useMemo(() => timers.reduce((sum, timer) => sum + timer.seconds, 0), [timers]);
  const current = timers[index];
  const progress = current ? Math.max(0, Math.min(100, ((current.seconds - remaining) / current.seconds) * 100)) : 0;

  const updateTimer = (id: string, patch: Partial<TimerItem>) => {
    setTimers((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const setDurationPart = (item: TimerItem, part: "minutes" | "seconds", value: number) => {
    const minutes = part === "minutes" ? value : Math.floor(item.seconds / 60);
    const seconds = part === "seconds" ? value : item.seconds % 60;
    updateTimer(item.id, { seconds: Math.max(1, minutes * 60 + seconds) });
  };

  const moveTimer = (position: number, direction: -1 | 1) => {
    const target = position + direction;
    if (target < 0 || target >= timers.length) return;
    setTimers((items) => {
      const next = [...items];
      [next[position], next[target]] = [next[target], next[position]];
      return next;
    });
  };

  const beginWorkout = () => {
    setIndex(0);
    setRemaining(timers[0].seconds);
    setPhase("ready");
    setScreen("workout");
  };

  const resumeSaved = () => {
    try {
      const saved = JSON.parse(localStorage.getItem("workout-session") ?? "null") as SavedSession | null;
      if (saved && timers[saved.index]) {
        setIndex(saved.index);
        setRemaining(Math.min(saved.remaining, timers[saved.index].seconds));
        setPhase(saved.phase === "finished" ? "finished" : "paused");
        setScreen("workout");
        return;
      }
    } catch {}
    beginWorkout();
  };

  const startOrResume = () => {
    if (!current) return;
    endAt.current = Date.now() + remaining * 1000;
    setPhase("running");
  };

  const pause = () => {
    if (endAt.current) setRemaining(Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000)));
    endAt.current = null;
    setPhase("paused");
  };

  const restartAll = () => {
    endAt.current = null;
    setIndex(0);
    setRemaining(timers[0].seconds);
    setPhase("ready");
  };

  const skip = () => {
    endAt.current = null;
    if (index >= timers.length - 1) {
      setRemaining(0);
      setPhase("finished");
    } else {
      const next = index + 1;
      setIndex(next);
      setRemaining(timers[next].seconds);
      setPhase("ready");
    }
  };

  const hasSavedSession = hydrated && Boolean(localStorage.getItem("workout-session"));

  if (screen === "workout" && current) {
    return (
      <main className="app workout-screen" dir="rtl">
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />
        <section className="workout-shell">
          <header className="workout-header">
            <button className="icon-button" onClick={() => { if (phase === "running") pause(); setScreen("setup"); }} aria-label="חזרה לעריכת האימון">→</button>
            <div className="step-copy">תרגיל {index + 1} מתוך {timers.length}</div>
            <button className="text-button" onClick={restartAll}>התחלה מחדש</button>
          </header>

          {phase === "finished" ? (
            <div className="completion-card">
              <div className="finish-icon">✓</div>
              <p className="eyebrow">כל הכבוד</p>
              <h1>האימון הושלם!</h1>
              <p>סיימת {timers.length} תרגילים בזמן כולל של {formatTime(totalSeconds)}.</p>
              <button className="primary-button" onClick={restartAll}>לעשות שוב</button>
              <button className="secondary-button" onClick={() => setScreen("setup")}>עריכת האימון</button>
            </div>
          ) : (
            <>
              <div className="timer-stage">
                <p className="eyebrow">{phase === "ready" ? "מוכן לתרגיל הבא" : phase === "paused" ? "האימון מושהה" : "קדימה!"}</p>
                <h1>{current.name}</h1>
                <div className="timer-ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}>
                  <div className="timer-inner">
                    <span className="time">{formatTime(remaining)}</span>
                    <span className="time-label">דקות : שניות</span>
                  </div>
                </div>
              </div>

              <div className="workout-actions">
                {phase === "running" ? (
                  <button className="primary-button action-main" onClick={pause}><span>Ⅱ</span> עצירה</button>
                ) : (
                  <button className="primary-button action-main" onClick={startOrResume}><span>▶</span> {phase === "ready" ? (index === 0 ? "התחל" : "המשך") : "המשך מהנקודה האחרונה"}</button>
                )}
                <button className="secondary-button" onClick={skip}>דלג לתרגיל הבא</button>
              </div>

              <div className="up-next">
                <span>הבא בתור</span>
                <strong>{timers[index + 1]?.name ?? "סיום האימון"}</strong>
                <b>{timers[index + 1] ? formatTime(timers[index + 1].seconds) : "✓"}</b>
              </div>
            </>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="app setup-screen" dir="rtl">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <section className="setup-shell">
        <header className="hero">
          <div className="brand-mark"><span>▶</span></div>
          <div>
            <p className="eyebrow">האימון שלך, בקצב שלך</p>
            <h1>טיימר אימונים</h1>
            <p>מסדרים פעם אחת את הזמנים—ומתאמנים בלי לגעת בשעון.</p>
          </div>
        </header>

        <div className="summary-row">
          <div><span>תרגילים</span><strong>{timers.length}</strong></div>
          <div><span>זמן עבודה</span><strong>{formatTime(totalSeconds)}</strong></div>
        </div>

        <section className="builder-card">
          <div className="section-title">
            <div><p className="eyebrow">בניית האימון</p><h2>רצף הזמנים שלי</h2></div>
            <span className="saved-pill">נשמר אוטומטית</span>
          </div>

          <div className="timer-list">
            {timers.map((item, position) => (
              <article className="timer-row" key={item.id}>
                <div className="order-number">{position + 1}</div>
                <div className="timer-fields">
                  <input className="name-input" value={item.name} onChange={(event) => updateTimer(item.id, { name: event.target.value })} aria-label={`שם תרגיל ${position + 1}`} />
                  <div className="duration-fields">
                    <label><input type="number" min="0" max="99" value={Math.floor(item.seconds / 60)} onChange={(event) => setDurationPart(item, "minutes", Math.max(0, Number(event.target.value)))} /><span>דקות</span></label>
                    <i>:</i>
                    <label><input type="number" min="0" max="59" value={item.seconds % 60} onChange={(event) => setDurationPart(item, "seconds", Math.max(0, Math.min(59, Number(event.target.value))))} /><span>שניות</span></label>
                  </div>
                </div>
                <div className="row-actions">
                  <button onClick={() => moveTimer(position, -1)} disabled={position === 0} aria-label="הזז למעלה">↑</button>
                  <button onClick={() => moveTimer(position, 1)} disabled={position === timers.length - 1} aria-label="הזז למטה">↓</button>
                  <button className="delete" onClick={() => setTimers((items) => items.filter((timer) => timer.id !== item.id))} disabled={timers.length === 1} aria-label="מחיקת תרגיל">×</button>
                </div>
              </article>
            ))}
          </div>

          <button className="add-button" onClick={() => setTimers((items) => [...items, { id: makeId(), name: `תרגיל ${items.length + 1}`, seconds: 30 }])}>＋ הוספת זמן נוסף</button>
        </section>

        <div className="start-panel">
          {hasSavedSession && <button className="secondary-button resume-button" onClick={resumeSaved}>המשך מהנקודה האחרונה</button>}
          <button className="primary-button start-button" onClick={beginWorkout}><span>▶</span> התחלת האימון מההתחלה</button>
          <p>יישמע צליל קצר בסיום כל זמן</p>
        </div>
      </section>
    </main>
  );
}
