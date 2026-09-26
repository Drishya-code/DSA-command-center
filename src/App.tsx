import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProgress } from '@/context/ProgressContext';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Pill, TopicStatusBadge } from '@/components/ui/Badge';
import { computeAllTopicStats, computeOverallStats, computeWeakTopics } from '@/utils/analytics';
import { generateDayPlan } from '@/utils/scheduler';
import { formatFriendlyDate, minutesToLabel, todayISO, addDaysISO } from '@/utils/date';
import { sanitizeUrl } from '@/utils/sanitize';
import { topics, A2Z_SOURCE_URL, CODOLIO_TRACKER_URL, YOUTUBE_PLAYLIST_URL } from '@/data/dsaRoadmap';
import { problems } from '@/data/problems';
import type { MistakeType, OutcomeType, Problem } from '@/types';

const NAV = [
  ['dashboard', '⌂', 'Dashboard'],
  ['roadmap', '▦', 'Roadmap'],
  ['problems', '◇', 'Problems'],
  ['revision', '↻', 'Revision'],
  ['analytics', '◒', 'Analytics'],
  ['settings', '⚙', 'Settings'],
] as const;

type Page = (typeof NAV)[number][0];

/* ── Focus trap for modals ─────────────────────────────────────── */
function useFocusTrap(active: boolean, containerRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusableEls = () => Array.from(container.querySelectorAll<HTMLElement>(focusableSelector));

    // Move focus into the container on open
    const first = focusableEls()[0];
    if (first) first.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const els = focusableEls();
      if (!els.length) return;
      const firstEl = els[0];
      const lastEl = els[els.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    container.addEventListener('keydown', onKeyDown);
    return () => container.removeEventListener('keydown', onKeyDown);
  }, [active, containerRef]);
}

export default function App() {
  const { state, updatePreferences, resetProgress, exportData, importData, setCurrentTopic } = useProgress();
  const [page, setPage] = useState<Page>('dashboard');
  const [query, setQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<string>('all');
  const [selectedProblem, setSelectedProblem] = useState<Problem | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const background = [document.querySelector<HTMLElement>('.sidebar'), mainRef.current];
    background.forEach((element) => element?.toggleAttribute('inert', Boolean(selectedProblem)));
  }, [selectedProblem]);

  const today = todayISO();
  const topicStats = useMemo(() => computeAllTopicStats(state), [state]);
  const overall = useMemo(() => computeOverallStats(state, topicStats), [state, topicStats]);
  const weakTopics = useMemo(() => computeWeakTopics(state, 4), [state]);
  const plan = useMemo(() => generateDayPlan(today, state), [today, state]);
  const filteredProblems = useMemo(() => problems.filter((p) => {
    const q = query.toLowerCase().trim();
    return (!q || `${p.title} ${p.subtopic} ${p.platform}`.toLowerCase().includes(q)) &&
      (selectedTopic === 'all' || p.topicId === selectedTopic);
  }), [query, selectedTopic]);

  const weekPct = overall.weeklyTargetMinutes ? Math.min(100, Math.round((overall.weekMinutes / overall.weeklyTargetMinutes) * 100)) : 0;

  // Skip-to-content: move focus to main
  const skipToMain = useCallback(() => {
    mainRef.current?.focus();
  }, []);

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link" onClick={(e) => { e.preventDefault(); skipToMain(); }}>
        Skip to content
      </a>
      <aside className="sidebar" role="complementary" aria-label="Navigation sidebar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">DS</div>
          <div><strong>DSA Command Center</strong><span>Independent DSA Learning Tracker</span></div>
        </div>
        <div className="nav-label" id="workspace-nav-label">WORKSPACE</div>
        <nav aria-labelledby="workspace-nav-label">
          {NAV.map(([id, icon, label]) => (
            <button
              key={id}
              className={page === id ? 'nav-item active' : 'nav-item'}
              aria-current={page === id ? 'page' : undefined}
              onClick={() => setPage(id)}
            >
              <span aria-hidden="true">{icon}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-source">
          <span className="eyebrow">SOURCE</span>
          <strong>Striver A2Z</strong>
          <p>Keep the tracker synced to the roadmap you actually follow.</p>
          <a href={YOUTUBE_PLAYLIST_URL} target="_blank" rel="noreferrer">YouTube Playlist ↗<span className="sr-only"> (opens in new tab)</span></a>
          <a href={CODOLIO_TRACKER_URL} target="_blank" rel="noreferrer">Open Codolio ↗<span className="sr-only"> (opens in new tab)</span></a>
          <a href={A2Z_SOURCE_URL} target="_blank" rel="noreferrer">Open TUF A2Z ↗<span className="sr-only"> (opens in new tab)</span></a>
        </div>
        <div className="sidebar-foot">Local-first · Your data stays in this browser</div>
      </aside>

      <main className="main" id="main-content" ref={mainRef} tabIndex={-1}>
        <header className="topbar">
          <div><div className="eyebrow">{formatFriendlyDate(today)}</div><h1>{page === 'dashboard' ? dashboardGreeting(state.preferences.name) : pageTitle(page)}</h1></div>
          <div className="top-actions">
            <span className="streak-chip" aria-label={`Current streak: ${state.streak.current} days`}>✦ {state.streak.current} day streak</span>
            <span className="avatar" aria-hidden="true">{(state.preferences.name || 'D')[0].toUpperCase()}</span>
          </div>
        </header>

        {page === 'dashboard' && <Dashboard {...{state, overall, topicStats, weakTopics, plan, weekPct, setPage, setSelectedProblem}} />}
        {page === 'roadmap' && <Roadmap {...{topicStats, setSelectedTopic, setPage, state, setCurrentTopic}} />}
        {page === 'problems' && <Problems {...{filteredProblems, query, setQuery, selectedTopic, setSelectedTopic, setSelectedProblem, state}} />}
        {page === 'revision' && <Revision {...{state, setSelectedProblem}} />}
        {page === 'analytics' && <Analytics {...{state, overall, topicStats, weakTopics}} />}
        {page === 'settings' && <Settings {...{state, updatePreferences, resetProgress, exportData, importData}} />}
      </main>
        <footer className="app-footer">
          <p>This is an independent learning tracker. External resources are linked to their respective original platforms. This project is not affiliated with or endorsed by TakeUForward, Striver, GeeksforGeeks, or LeetCode.</p>
        </footer>
      {selectedProblem && <ProblemModal problem={selectedProblem} state={state} onClose={() => setSelectedProblem(null)} />}
    </div>
  );
}

function pageTitle(page: Page) { return NAV.find(n => n[0] === page)?.[2] ?? 'Dashboard'; }
function dashboardGreeting(name: string) {
  const hour = new Date().getHours();
  const salutation = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return `${salutation}${name ? `, ${name}` : ''}.`;
}

function Dashboard({ state, overall, topicStats, weakTopics, plan, weekPct, setPage, setSelectedProblem }: any) {
  const { completeTaskToday, isTaskCompletedToday } = useProgress();
  const [showAllTasks, setShowAllTasks] = useState(false);
  const visibleTasks = showAllTasks ? plan.tasks : plan.tasks.slice(0, 5);
  return <>
    <section className="hero-grid">
      <Card className="hero-card">
        <div className="dashboard-greeting"><div><div className="hero-kicker">A focused session is enough to move forward.</div></div><div className="plan-total"><strong>{minutesToLabel(plan.totalEstimatedMin)}</strong><span>{plan.tasks.length} planned tasks · {minutesToLabel(plan.dailyBudgetMin)} daily budget</span></div></div>
        <div className="plan-section-head"><h3>Today’s plan</h3><span>{plan.tasks.filter((task: any) => isTaskCompletedToday(task.id)).length} of {plan.tasks.length} complete</span></div>
        <div className="plan-list" role="list" aria-label="Today's tasks">{visibleTasks.map((task: any) => {
          const done = isTaskCompletedToday(task.id);
          return <div className={'plan-row ' + (done ? 'done' : '')} key={task.id} role="listitem">
            <button
              className="check"
              aria-pressed={done}
              title={task.kind === 'problem' ? 'Tracks plan completion only. Open the problem to record its outcome.' : 'Mark task as done for today'}
              aria-label={`Mark "${task.title}" as ${done ? 'not done' : 'done'}`}
              onClick={() => completeTaskToday(task.id)}
            >{done ? '✓' : ''}</button>
            <div className="task-copy"><strong>{task.title}</strong><span>{task.priorityLabel} · {task.subtitle || task.topicTitle} · {minutesToLabel(task.estimatedMin)}</span></div>
            {task.kind === 'problem' && <button className="ghost-btn" aria-label={`Work on ${task.title}`} onClick={() => { const p = problems.find((x: Problem) => x.id === task.refId); if (p) setSelectedProblem(p); }}>Work on it</button>}
            {task.url && task.kind !== 'problem' && <a className="ghost-btn" href={sanitizeUrl(task.url)} target="_blank" rel="noreferrer">Open ↗<span className="sr-only"> (opens in new tab)</span></a>}
          </div>;
        })}</div>
        {plan.tasks.length > 5 && <button className="text-btn show-tasks" onClick={() => setShowAllTasks((shown) => !shown)} aria-expanded={showAllTasks}>{showAllTasks ? 'Show less' : `Show all ${plan.tasks.length} tasks`}</button>}
        <p className="muted plan-hint">✓ tracks that you finished the task in your plan. To mark a problem solved, open it via “Work on it” and record the outcome.</p>
      </Card>
      <Card className="focus-card">
        <CardHeader><CardTitle>Weekly momentum</CardTitle><Pill>{weekPct}%</Pill></CardHeader>
        <CardBody>
          <div className="ring-wrap">
            <div className="progress-ring" role="img" aria-label={`Weekly progress: ${weekPct}%`} style={{'--pct': `${weekPct * 3.6}deg`} as any}><div aria-hidden="true">{weekPct}%</div></div>
            <div><strong>{minutesToLabel(overall.weekMinutes)}</strong><span>of {minutesToLabel(overall.weeklyTargetMinutes)} target</span></div>
          </div>
          <div className="mini-bars" role="img" aria-label="Last 7 days activity">{lastSeven(state, plan.dailyBudgetMin).map((x: any) => <div key={x.date}><div className="bar-track"><div className="bar-fill" style={{height:`${Math.min(100, x.min / Math.max(1, x.max) * 100)}%`}} /></div><small>{x.label}</small></div>)}</div>
        </CardBody>
      </Card>
    </section>

    <section className="stat-grid" aria-label="Key statistics">
      <Metric label="Solved" value={`${overall.solvedProblems}/${overall.totalProblems}`} detail="problems in current catalog" />
      <Metric label="Revision due" value={stateDue(state)} detail="items waiting for recall" accent="amber" />
      <Metric label="Streak" value={`${state.streak.current}d`} detail={state.streak.current === 0 ? `${state.preferences.minMinutesForStreak} min/day to start a streak` : `best ${state.streak.longest} days`} accent="mint" />
      <Metric label="Topics" value={`${overall.topicsCompleted}/${overall.totalTopics}`} detail="roadmap modules completed" />
    </section>

    <section className="section-head"><div><div className="eyebrow">ROADMAP PULSE</div><h2>Where you stand</h2></div><button className="text-btn" onClick={() => setPage('roadmap')}>View full roadmap →</button></section>
    <div className="topic-grid" role="list" aria-label="Topic progress">{topicStats.slice(0, 6).map((t: any) => <div key={t.topic.id} role="listitem"><TopicCard t={t} /></div>)}</div>

    <section className="split-grid lower-grid">
      <Card><CardHeader><div><CardTitle>Weak spots</CardTitle><p className="muted">Driven by failed attempts and forgotten revisions.</p></div></CardHeader><CardBody>{weakTopics.length ? <ul className="signal-list">{weakTopics.map((w: any) => <li className="weak-row" key={w.topicId}><div className="weak-dot" aria-hidden="true"/><div><strong>{w.topicTitle}</strong><span>{w.reasons.join(' · ')}</span></div><span className="score">{w.score}</span></li>)}</ul> : <Empty text="No weak-topic signal yet. Log a few attempts first." />}</CardBody></Card>
      <Card><CardHeader><div><CardTitle>Quick actions</CardTitle><p className="muted">Keep friction low.</p></div></CardHeader><CardBody><div className="quick-grid"><button onClick={() => setPage('problems')} aria-label="Go to Problems page">◇ <span>Solve a problem</span></button><button onClick={() => setPage('revision')} aria-label="Go to Revision page">↻ <span>Review due</span></button><button onClick={() => setPage('analytics')} aria-label="Go to Analytics page">◒ <span>Inspect progress</span></button><button onClick={() => setPage('settings')} aria-label="Go to Settings page">⚙ <span>Adjust plan</span></button></div></CardBody></Card>
    </section>
  </>;
}

function Roadmap({ topicStats, setSelectedTopic, setPage, state, setCurrentTopic }: any) { return <>
  <Card className="source-banner"><div><span className="eyebrow">ROADMAP SOURCE</span><h2>Striver A2Z, organized around execution</h2><p>Use the attached Striver A2Z repository as the problem/link source. This app adds scheduling, outcomes, revisions and analytics on top.</p></div><div className="source-links"><a href={YOUTUBE_PLAYLIST_URL} target="_blank" rel="noreferrer">YouTube ↗<span className="sr-only"> (opens in new tab)</span></a><a href={CODOLIO_TRACKER_URL} target="_blank" rel="noreferrer">Codolio ↗<span className="sr-only"> (opens in new tab)</span></a><a href={A2Z_SOURCE_URL} target="_blank" rel="noreferrer">TakeUforward ↗<span className="sr-only"> (opens in new tab)</span></a></div></Card>
  <div className="roadmap-list" role="list" aria-label="Roadmap topics">{topicStats.map((t:any, i:number) => <div className="roadmap-item" key={t.topic.id} role="listitem"><button className="roadmap-row" aria-label={`${t.topic.title}, ${t.progressPct}% complete, ${t.solvedProblems} of ${t.totalProblems} solved`} onClick={() => {setSelectedTopic(t.topic.id);setPage('problems')}}><span className="roadmap-num" aria-hidden="true">{String(i+1).padStart(2,'0')}</span><div className="roadmap-main"><div className="row-title"><strong>{t.topic.title}</strong>{state.currentTopicId === t.topic.id && <span className="current-topic-chip">Studying</span>}<TopicStatusBadge status={t.status}/></div><p>{t.topic.description}</p><div className="roadmap-links">{t.topic.youtubeUrl && <a href={sanitizeUrl(t.topic.youtubeUrl)} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}>YouTube ↗<span className="sr-only"> (opens in new tab)</span></a>}{t.topic.tufUrl && <a href={sanitizeUrl(t.topic.tufUrl)} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}>TUF ↗<span className="sr-only"> (opens in new tab)</span></a>}</div><div className="progress-line" role="progressbar" aria-valuenow={t.progressPct} aria-valuemin={0} aria-valuemax={100} aria-label={`${t.topic.title} progress`}><span style={{width:`${t.progressPct}%`}}/></div></div><div className="roadmap-meta"><strong>{t.progressPct}%</strong><span>{t.solvedProblems}/{t.totalProblems} solved</span></div><span className="arrow" aria-hidden="true">→</span></button>{state.currentTopicId !== t.topic.id && <button className="ghost-btn pin-topic-btn" onClick={()=>setCurrentTopic(t.topic.id)}>Study this topic</button>}</div>)}</div>
</>; }

function Problems({ filteredProblems, query, setQuery, selectedTopic, setSelectedTopic, setSelectedProblem, state }: any) { return <>
  <Card className="toolbar">
    <div className="searchbox">
      <span aria-hidden="true">⌕</span>
      <input
        id="problem-search"
        value={query}
        onChange={e=>setQuery(e.target.value)}
        placeholder="Search problems, patterns, platform..."
        aria-label="Search problems"
      />
    </div>
    <label htmlFor="topic-filter" className="sr-only">Filter by topic</label>
    <select id="topic-filter" value={selectedTopic} onChange={e=>setSelectedTopic(e.target.value)}>
      <option value="all">All topics</option>
      {topics.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}
    </select>
  </Card>
  <div className="table-card"><div className="table-head"><span>{filteredProblems.length} problems</span><span className="muted">402 questions · links sourced from the attached Striver A2Z repo</span></div><div className="problem-table" role="list" aria-label="Problem list">{filteredProblems.length === 0 && <div className="empty" role="status">No problems match your search or filter. Try clearing the search box or picking another topic.</div>}{filteredProblems.map((p:Problem)=><button key={p.id} className="problem-row" role="listitem" aria-label={`${p.title}, ${p.difficulty}, ${state.problemProgress[p.id]?.status || 'Not Started'}`} onClick={()=>setSelectedProblem(p)}><div className="problem-name"><strong>{p.title}</strong><span>{p.subtopic}</span></div><span className={'difficulty '+p.difficulty.toLowerCase()}>{p.difficulty}</span><span className="platform">{p.platform}</span><span className="status-text">{state.problemProgress[p.id]?.status || 'Not Started'}</span><span aria-hidden="true">→</span></button>)}</div></div>
</>; }

function Revision({ state, setSelectedProblem }: any) {
  const due = problems.filter(p => (state.problemProgress[p.id]?.revisionSchedule || []).some((r: {done: boolean; date: string}) => !r.done && r.date <= todayISO()));
  // Upcoming: scheduled but not yet due
  const upcoming = problems.map(p => {
    const pending = (state.problemProgress[p.id]?.revisionSchedule || []).filter((r: {done: boolean; date: string}) => !r.done && r.date > todayISO());
    return pending.length ? { problem: p, nextDate: pending[0].date, count: pending.length } : null;
  }).filter(Boolean).sort((a: any, b: any) => a.nextDate < b.nextDate ? -1 : 1).slice(0, 8);
  return <>
  <Card className="revision-hero"><span className="eyebrow">ACTIVE RECALL</span><h2>{due.length ? `${due.length} revision${due.length===1?'':'s'} due` : 'Nothing due right now'}</h2><p>Revisions are generated after a solve using {state.preferences.revisionIntervals.join(' / ')} day spacing.</p></Card>
  <div className="revision-grid" role="list" aria-label="Due revisions">{due.map(p=><button className="revision-card" key={p.id} role="listitem" aria-label={`Review ${p.title}, ${p.difficulty}`} onClick={()=>setSelectedProblem(p)}><div><span className="eyebrow">{p.difficulty}</span><h3>{p.title}</h3><p>{p.subtopic}</p></div><span className="review-arrow">Review →</span></button>)}</div>
  {due.length === 0 && upcoming.length > 0 && <Card className="upcoming-card"><CardHeader><div><CardTitle>Scheduled revisions</CardTitle><p className="muted">Coming up. They appear here the day they're due.</p></div></CardHeader><CardBody><div className="upcoming-list">{upcoming.map((u: any) => <div className="upcoming-row" key={u.problem.id}><div><strong>{u.problem.title}</strong><span>{u.problem.subtopic}</span></div><span className="upcoming-date">{u.nextDate === addDaysISO(todayISO(), 1) ? 'Tomorrow' : u.nextDate}{u.count > 1 ? ` (+${u.count - 1} more)` : ''}</span></div>)}</div></CardBody></Card>}
  {due.length === 0 && upcoming.length === 0 && <Empty text="Solve a problem to schedule its first revision." />}
</>; }

function Analytics({ state, overall, topicStats, weakTopics }: any) { return <>
  <div className="stat-grid" aria-label="Analytics summary"><Metric label="Weekly hours" value={`${Math.round(overall.weekMinutes/60*10)/10}h`} detail={`target ${state.preferences.weeklyHoursTarget}h`} /><Metric label="Solve rate" value={`${overall.totalProblems ? Math.round(overall.solvedProblems/overall.totalProblems*100):0}%`} detail="of current catalog" /><Metric label="Revisions" value={stateDue(state)} detail="currently due" accent="amber" /><Metric label="Longest streak" value={`${state.streak.longest}d`} detail="all time" accent="mint" /></div>
  <Card className="chart-card"><CardHeader><div><CardTitle>Topic progress</CardTitle><p className="muted">Progress is problem + video completion.</p></div></CardHeader><CardBody><div className="analytics-bars">{topicStats.map((t:any)=><div className="a-row" key={t.topic.id}><span>{t.topic.title}</span><div><div className="progress-line" role="progressbar" aria-valuenow={t.progressPct} aria-valuemin={0} aria-valuemax={100} aria-label={`${t.topic.title} progress`}><span style={{width:`${t.progressPct}%`}}/></div></div><strong>{t.progressPct}%</strong></div>)}</div></CardBody></Card>
  <Card><CardHeader><div><CardTitle>Learning signals</CardTitle><p className="muted">The tracker should tell you what to do next, not just what you did.</p></div></CardHeader><CardBody>{weakTopics.length ? <ul className="signal-list">{weakTopics.map((w:any)=><li className="signal-row" key={w.topicId}><strong>{w.topicTitle}</strong><span>{w.reasons.join(' · ')}</span></li>)}</ul> : <Empty text="Not enough attempt data yet."/>}</CardBody></Card>
  <Card><CardHeader><div><CardTitle>Mistake log</CardTitle><p className="muted">Every logged mistake, most recent first.</p></div></CardHeader><CardBody>{(state.mistakes ?? []).length ? <ul className="signal-list">{(state.mistakes ?? []).slice(0, 12).map((m:any)=><li className="signal-row" key={m.id}><strong>{m.type}</strong><span>{problems.find((p:Problem)=>p.id===m.problemId)?.title ?? m.problemId} · {m.date}</span></li>)}</ul> : <Empty text="No mistakes logged. When you log one from a problem, it appears here."/>}</CardBody></Card>
</>; }

function Settings({ state, updatePreferences, resetProgress, exportData, importData }: any) {
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const doExport = () => {
    const blob = new Blob([exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dsa-progress-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const doImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = importData(String(reader.result));
      setImportMsg(result.ok ? { ok: true, text: 'Progress imported successfully.' } : { ok: false, text: result.error || 'Import failed.' });
    };
    reader.readAsText(file);
  };
  return <div className="settings-grid"><Card><CardHeader><div><CardTitle>Study plan</CardTitle><p className="muted">The scheduler uses these values every day.</p></div></CardHeader><CardBody>
  <label htmlFor="pref-name">Name<input id="pref-name" className="field" value={state.preferences.name} onChange={e=>updatePreferences({name:e.target.value})}/></label>
  <label htmlFor="pref-hours">Weekly hours<input id="pref-hours" className="field" type="number" min="1" max="40" value={state.preferences.weeklyHoursTarget} onChange={e=>updatePreferences({weeklyHoursTarget:Number(e.target.value)})}/></label>
  <label htmlFor="pref-days">Study days<input id="pref-days" className="field" type="number" min="1" max="7" value={state.preferences.studyDaysPerWeek} onChange={e=>updatePreferences({studyDaysPerWeek:Number(e.target.value)})}/></label>
  <label htmlFor="pref-streak">Minimum minutes for streak<input id="pref-streak" className="field" type="number" min="5" max="180" value={state.preferences.minMinutesForStreak} onChange={e=>updatePreferences({minMinutesForStreak:Number(e.target.value)})}/></label>
</CardBody></Card><Card><CardHeader><div><CardTitle>Data</CardTitle><p className="muted">Progress is stored locally in your browser. Export to back it up.</p></div></CardHeader><CardBody><div className="data-box"><strong>Current catalog</strong><span>{problems.length} seeded problems · 19 roadmap topics</span></div><div className="data-box"><strong>Revision cadence</strong><span>{state.preferences.revisionIntervals.join(' → ')} days</span></div>
  <div className="data-actions">
    <button className="secondary-btn" onClick={doExport}>Export progress (JSON)</button>
    <label className="secondary-btn import-label">Import backup<input type="file" accept="application/json,.json" className="sr-only" onChange={e=>{const f=e.target.files?.[0]; if(f) doImport(f); e.currentTarget.value='';}}/></label>
  </div>
  {importMsg && <p className={'import-msg ' + (importMsg.ok ? 'ok' : 'err')} role="status">{importMsg.text}</p>}
  <button className="danger-btn" aria-label="Reset all progress" onClick={()=>{if(confirm('Reset all progress?')) resetProgress()}}>Reset all progress</button></CardBody></Card></div>; }

function TopicCard({t}:any){return <Card className="topic-card"><div className="topic-top"><span className="topic-index" aria-hidden="true">{String(t.topic.order).padStart(2,'0')}</span><TopicStatusBadge status={t.status}/></div><h3>{t.topic.title}</h3><p>{t.topic.description}</p><div className="topic-bottom"><span>{t.solvedProblems}/{t.totalProblems} solved</span><strong>{t.progressPct}%</strong></div><div className="progress-line" role="progressbar" aria-valuenow={t.progressPct} aria-valuemin={0} aria-valuemax={100} aria-label={`${t.topic.title} progress`}><span style={{width:`${t.progressPct}%`}}/></div></Card>}
function Metric({label,value,detail,accent}:any){return <Card className="metric"><span>{label}</span><strong className={accent||''} aria-label={`${label}: ${value}`}>{value}</strong><small>{detail}</small></Card>}
function Empty({text}:{text:string}){return <div className="empty" role="status">{text}</div>}
function stateDue(state:any){return problems.reduce((n,p)=>n+(state.problemProgress[p.id]?.revisionSchedule||[]).filter((r:{done:boolean;date:string})=>!r.done&&r.date<=todayISO()).length,0)}
function lastSeven(state:any, dailyBudgetMin:number){const out=[];for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;out.push({date:iso,label:d.toLocaleDateString(undefined,{weekday:'narrow'}),min:state.dailyActivity[iso]?.studyMin||0,max:dailyBudgetMin});}return out}

function ProblemModal({problem,state,onClose}:{problem:Problem;state:any;onClose:()=>void}){
  const {recordAttempt,solveProblem,setProblemNotes,logMistake,logStudyMinutes}=useProgress();
  const [notes,setNotes]=useState(state.problemProgress[problem.id]?.notes||'');
  const [outcome,setOutcome]=useState<OutcomeType>('Solved independently');
  const [mistake,setMistake]=useState('');
  const progress=state.problemProgress[problem.id];
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap
  useFocusTrap(true, modalRef);

  // Escape key handler
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const submitSolve=()=>{solveProblem(problem.id,outcome,notes);logStudyMinutes(problem.estimatedTime,{topicId:problem.topicId,problemIds:[problem.id]});onClose()};
  const isSolved = outcome !== 'Could not solve';
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" ref={modalRef} role="dialog" aria-modal="true" aria-label={`${problem.title}: problem details`} onMouseDown={e=>e.stopPropagation()}><button className="close" aria-label="Close dialog" onClick={onClose}>×</button><span className={'difficulty '+problem.difficulty.toLowerCase()}>{problem.difficulty}</span><h2>{problem.title}</h2><p className="muted">{problem.subtopic} · {problem.platform} · ~{problem.estimatedTime} min</p><div className="modal-actions">
    {problem.url && <a className="primary-btn" href={sanitizeUrl(problem.url)} target="_blank" rel="noreferrer">Open problem ↗<span className="sr-only"> (opens in new tab)</span></a>}
    {problem.gfgUrl && <a className="secondary-btn" href={sanitizeUrl(problem.gfgUrl)} target="_blank" rel="noreferrer">GFG ↗<span className="sr-only"> (opens in new tab)</span></a>}
    {problem.leetcodeUrl && <a className="secondary-btn" href={sanitizeUrl(problem.leetcodeUrl)} target="_blank" rel="noreferrer">LeetCode ↗<span className="sr-only"> (opens in new tab)</span></a>}
    {problem.videoUrl && <a className="secondary-btn" href={sanitizeUrl(problem.videoUrl)} target="_blank" rel="noreferrer">YouTube ↗<span className="sr-only"> (opens in new tab)</span></a>}
    {problem.tufUrl && <a className="secondary-btn" href={sanitizeUrl(problem.tufUrl)} target="_blank" rel="noreferrer">TUF ↗<span className="sr-only"> (opens in new tab)</span></a>}
    <button className="secondary-btn" onClick={()=>recordAttempt(problem.id)}>Log attempt ({progress?.attemptCount||0})</button>
  </div>
  <label htmlFor="outcome-select">Outcome<select id="outcome-select" className="field" value={outcome} onChange={e=>setOutcome(e.target.value as OutcomeType)}><option>Solved independently</option><option>Needed solution</option><option>Could not solve</option></select></label>
  {isSolved && <p className="muted modal-hint">This marks the problem solved and schedules revision in {state.preferences.revisionIntervals.join(', ')} days.</p>}
  {!isSolved && <p className="muted modal-hint">This records the attempt. The problem stays "Attempted". Solve it later to schedule revisions.</p>}
  <label htmlFor="problem-notes">Notes<textarea id="problem-notes" className="field textarea" value={notes} onChange={e=>{setNotes(e.target.value);setProblemNotes(problem.id,e.target.value)}} placeholder="Approach, insight, edge case..."/></label>
  <div className="mistake-line"><label htmlFor="mistake-select" className="sr-only">Log a mistake type</label><select id="mistake-select" className="field" value={mistake} onChange={e=>setMistake(e.target.value)}><option value="">Log a mistake...</option><option>Logic error</option><option>Edge case</option><option>Complexity</option><option>Concept</option><option>Syntax</option></select><button className="secondary-btn" disabled={!mistake} onClick={()=>{logMistake(problem.id,mistake as MistakeType,notes);setMistake('')}}>Add</button></div><button className="solve-btn" onClick={submitSolve}>{isSolved ? 'Mark solved & schedule revision' : 'Record outcome'}</button></div></div>
}
