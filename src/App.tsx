import { APP_NAME } from './types';
import { useStore, type AppView } from './state';
import { AidesView } from './views/AidesView';
import { BlocksView } from './views/BlocksView';
import { ConflictsView } from './views/ConflictsView';
import { CoverageView } from './views/CoverageView';
import { RoomsView } from './views/RoomsView';
import { DataView } from './views/DataView';
import { ParamsView } from './views/ParamsView';
import { PrintView } from './views/PrintView';
import { RulesView } from './views/RulesView';
import { ScheduleView } from './views/ScheduleView';
import { StripsView } from './views/StripsView';
import { StudentsView } from './views/StudentsView';

const NAV: { id: AppView; label: string }[] = [
  { id: 'students', label: 'Students' },
  { id: 'schedule', label: 'Day grid' },
  { id: 'strips', label: 'Student days' },
  { id: 'coverage', label: 'If someone is out' },
  { id: 'conflicts', label: 'Conflicts' },
  { id: 'aides', label: 'Staff' },
  { id: 'rooms', label: 'Rooms' },
  { id: 'blocks', label: 'Timeline' },
  { id: 'rules', label: 'Rules' },
  { id: 'params', label: 'Parameters' },
  { id: 'data', label: 'Data' },
  { id: 'print', label: 'Print' },
];

export function App() {
  const { view, setView, data, solve, solving, hard, scheduleLegal } = useStore();
  const absent = data.aides.filter((a) => a.absent);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <img className="logo" src="./icon.png" alt="" aria-hidden />
          <div>
            <h1>{APP_NAME}</h1>
            <p>
              {data.teacherName}
              {data.schoolName ? ` · ${data.schoolName}` : ''}
            </p>
          </div>
        </div>
        <div className="top-actions">
          {absent.length > 0 ? (
            <span className="pill pill-warn">Out today: {absent.map((a) => a.name).join(', ')}</span>
          ) : null}
          {data.schedule && !scheduleLegal ? (
            <span className="meta">Hard conflicts: {hard.length}</span>
          ) : null}
          <button type="button" className="btn btn-primary" onClick={solve} disabled={solving}>
            {solving ? 'Searching…' : 'Auto-Schedule'}
          </button>
        </div>
      </header>
      <nav className="nav" aria-label="AideFlow sections">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={view === item.id ? 'active' : undefined}
            aria-current={view === item.id ? 'page' : undefined}
            onClick={() => setView(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <main className="page">
        {view === 'schedule' ? <ScheduleView /> : null}
        {view === 'strips' ? <StripsView /> : null}
        {view === 'conflicts' ? <ConflictsView /> : null}
        {view === 'coverage' ? <CoverageView /> : null}
        {view === 'rooms' ? <RoomsView /> : null}
        {view === 'students' ? <StudentsView /> : null}
        {view === 'aides' ? <AidesView /> : null}
        {view === 'blocks' ? <BlocksView /> : null}
        {view === 'rules' ? <RulesView /> : null}
        {view === 'params' ? <ParamsView /> : null}
        {view === 'data' ? <DataView /> : null}
        {view === 'print' ? <PrintView /> : null}
      </main>
      {solving ? (
        <div className="busy-overlay" role="alertdialog" aria-live="polite">
          <div className="card busy-card">
            <div className="spinner" />
            <h2>Looking for a fully valid schedule</h2>
            <p className="muted">If none exists, AideFlow will say so — it will not keep a partial roster.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
