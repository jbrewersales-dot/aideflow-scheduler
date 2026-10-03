import { useMemo, useRef, useState } from 'react';
import {
  parseBellSchedule,
  parseRoster,
  parseStaffList,
  toScheduleBlocks,
  toStaff,
  toStudents,
  type ParsedBlock,
  type ParsedStudent,
} from '../import';
import { defaultLocations } from '../data/defaults';
import { createId } from '../ids';
import { formatClock } from '../domain';
import { BUILT_IN_TRAITS } from '../types';
import { Banner, ChipSelect } from '../ui';
import { useStore } from '../state';

type Step = 1 | 2 | 3 | 4 | 5;

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'School day' },
  { n: 2, label: 'Students' },
  { n: 3, label: 'Staff' },
  { n: 4, label: 'Conflicts' },
  { n: 5, label: 'Build it' },
];

const SAMPLE_BELL = `Advisory 7:45 - 8:00
1st Hour 8:03 - 8:51
2nd Hour 8:55 - 9:43
3rd Hour 9:47 - 10:35
4th Hour 10:39 - 11:27
Lunch 11:30 - 12:00
5th Hour 12:04 - 12:52
6th Hour 12:56 - 1:44
7th Hour 1:48 - 2:36
Dismissal 2:40 - 2:50`;

const SAMPLE_ROSTER = `Name,Day Type,Arrival,Departure,Traits,1:1,Notes
Marcus Hale,Full,,,aggressive;needs-1to1,yes,Behavior plan on file
Lily Chen,Full,,,wheelchair,no,Manual wheelchair
Jordan Blake,Shortened,,12:15 PM,elopes;flight-risk,yes,1:1 bus to bus
Dylan Reyes,Full,11:30 AM,,,no,Afternoon placement`;

/** Paste box with a live preview of what was understood. */
function PasteBox({
  value,
  onChange,
  placeholder,
  rows = 12,
  onSample,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rows?: number;
  onSample?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <textarea
        className="paste-box"
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="row-actions" style={{ marginTop: 8 }}>
        <button type="button" className="btn btn-small" onClick={() => fileRef.current?.click()}>
          Or choose a file
        </button>
        {onSample ? (
          <button type="button" className="btn btn-small" onClick={onSample}>
            Show me an example
          </button>
        ) : null}
        {value ? (
          <button type="button" className="btn btn-small btn-ghost" onClick={() => onChange('')}>
            Clear
          </button>
        ) : null}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt,.tsv,text/plain,text/csv"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          onChange(await file.text());
        }}
      />
    </div>
  );
}

export function SetupView() {
  const { data, setView, solve } = useStore();
  const [step, setStep] = useState<Step>(1);

  return (
    <section>
      <div className="page-head">
        <div>
          <h2>Set up your classroom</h2>
          <p className="lede">
            Five steps. Copy from whatever you already have — a bell schedule, a roster, an email — and paste it in.
            You will see exactly what was understood before anything is saved.
          </p>
        </div>
      </div>

      <ol className="stepper">
        {STEPS.map((s) => (
          <li key={s.n}>
            <button
              type="button"
              className={`step-pill${step === s.n ? ' active' : ''}${step > s.n ? ' done' : ''}`}
              onClick={() => setStep(s.n)}
            >
              <span className="step-num">{step > s.n ? '✓' : s.n}</span>
              {s.label}
            </button>
          </li>
        ))}
      </ol>

      {step === 1 ? <BellStep onNext={() => setStep(2)} /> : null}
      {step === 2 ? <RosterStep onNext={() => setStep(3)} /> : null}
      {step === 3 ? <StaffStep onNext={() => setStep(4)} /> : null}
      {step === 4 ? <ConflictStep onNext={() => setStep(5)} /> : null}
      {step === 5 ? (
        <FinishStep
          onBuild={() => {
            solve();
          }}
          onOpen={(v) => setView(v)}
        />
      ) : null}

      <p className="meta" style={{ marginTop: 20 }}>
        Currently loaded: {data.blocks.length} time blocks, {data.students.length} students, {data.aides.length} staff,{' '}
        {data.keepApart.length} keep-apart pair{data.keepApart.length === 1 ? '' : 's'}.
      </p>
    </section>
  );
}

// --------------------------------------------------------------------- step 1

function BellStep({ onNext }: { onNext: () => void }) {
  const { data, dispatch } = useStore();
  const [text, setText] = useState('');
  const result = useMemo(() => (text.trim() ? parseBellSchedule(text) : null), [text]);

  const apply = (blocks: ParsedBlock[]): void => {
    if (blocks.length === 0) return;
    const next = toScheduleBlocks(blocks);
    dispatch({
      type: 'patch',
      data: {
        blocks: next,
        locations: data.locations.length > 0 ? data.locations : defaultLocations(),
        // Student plans and block lists point at the old blocks, so clear them.
        students: data.students.map((s) => ({ ...s, plan: [], blockIds: [], coverageBlockIds: [] })),
        aides: data.aides.map((a) => ({ ...a, availableBlockIds: [] })),
        schedule: null,
        backupPlans: [],
      },
    });
    onNext();
  };

  return (
    <div className="grid grid-2">
      <div className="card">
        <h3>1. Paste your school's bell schedule</h3>
        <p className="lede">
          Copy the period times straight from the school's schedule — a PDF, an email, a spreadsheet, anything. One
          period per line. Headings and page titles are ignored.
        </p>
        <PasteBox
          value={text}
          onChange={setText}
          onSample={() => setText(SAMPLE_BELL)}
          placeholder={'1st Hour 8:03 - 8:51\n2nd Hour 8:55 - 9:43\nLunch 11:30 - 12:00\n5th Hour 12:04 - 12:52'}
        />
        <p className="meta" style={{ marginTop: 10 }}>
          Afternoon times written without "pm" are handled: a 12:56 after a 12:04 is read as the afternoon.
        </p>
      </div>

      <div className="card">
        <h3>What I understood</h3>
        {!result ? (
          <p className="muted">Paste a schedule on the left and it will appear here.</p>
        ) : result.blocks.length === 0 ? (
          <Banner kind="bad" title="Could not read that">
            {result.warnings.join(' ')}
          </Banner>
        ) : (
          <>
            <table className="schedule-table preview-table">
              <thead>
                <tr>
                  <th>Block</th>
                  <th>Starts</th>
                  <th>Ends</th>
                  <th>Kind</th>
                </tr>
              </thead>
              <tbody>
                {result.blocks.map((b, i) => (
                  <tr key={`${b.name}-${i}`}>
                    <td>{b.name}</td>
                    <td>{formatClock(b.startTime)}</td>
                    <td>{formatClock(b.endTime)}</td>
                    <td className="meta">{b.kind}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.skipped.length > 0 ? (
              <p className="meta" style={{ marginTop: 10 }}>
                Ignored (no times on these lines): {result.skipped.join(' · ')}
              </p>
            ) : null}
            {result.warnings.map((w, i) => (
              <p className="meta warn-text" key={i}>
                {w}
              </p>
            ))}
            <div className="row-actions" style={{ marginTop: 14 }}>
              <button type="button" className="btn btn-primary" onClick={() => apply(result.blocks)}>
                Use these {result.blocks.length} blocks
              </button>
            </div>
            <p className="meta" style={{ marginTop: 8 }}>
              This replaces the current timeline. You can fine-tune any block afterwards on the Timeline tab.
            </p>
          </>
        )}
        <div className="row-actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn" onClick={onNext}>
            Keep the current timeline and continue
          </button>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------- step 2

function RosterStep({ onNext }: { onNext: () => void }) {
  const { data, dispatch } = useStore();
  const [text, setText] = useState('');
  const [flip, setFlip] = useState(false);
  const [mode, setMode] = useState<'replace' | 'add'>('replace');
  const result = useMemo(() => (text.trim() ? parseRoster(text, { flipNames: flip }) : null), [text, flip]);

  const apply = (students: ParsedStudent[]): void => {
    if (students.length === 0) return;
    const incoming = toStudents(students);
    dispatch({
      type: 'patch',
      data: {
        students: mode === 'replace' ? incoming : [...data.students, ...incoming],
        keepApart: mode === 'replace' ? [] : data.keepApart,
        schedule: null,
        backupPlans: [],
      },
    });
    onNext();
  };

  return (
    <div className="grid grid-2">
      <div className="card">
        <h3>2. Paste your students</h3>
        <p className="lede">
          A plain list of names is enough. If you have a spreadsheet with more detail, paste the whole thing — columns
          like arrival, departure, traits and notes are picked up automatically.
        </p>
        <PasteBox
          value={text}
          onChange={setText}
          onSample={() => setText(SAMPLE_ROSTER)}
          placeholder={'Marcus Hale\nLily Chen\nJordan Blake\n\n…or paste a spreadsheet with headings.'}
        />
        <div className="form-grid" style={{ marginTop: 12 }}>
          <label className="checkbox">
            <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} />
            Replace the current student list
          </label>
          <label className="checkbox">
            <input type="radio" checked={mode === 'add'} onChange={() => setMode('add')} />
            Add to the {data.students.length} student{data.students.length === 1 ? '' : 's'} already here
          </label>
        </div>
      </div>

      <div className="card">
        <h3>What I understood</h3>
        {!result ? (
          <p className="muted">Paste a list on the left and it will appear here.</p>
        ) : result.students.length === 0 ? (
          <Banner kind="bad" title="Could not read that">
            {result.warnings.join(' ')}
          </Banner>
        ) : (
          <>
            {result.surnameFirst ? (
              <Banner kind="warn" title="These look like “Last, First”">
                <label className="checkbox" style={{ marginTop: 6 }}>
                  <input type="checkbox" checked={flip} onChange={(e) => setFlip(e.target.checked)} />
                  Flip them to “First Last”
                </label>
              </Banner>
            ) : null}
            <table className="schedule-table preview-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Day</th>
                  <th>Traits</th>
                  <th>1:1</th>
                </tr>
              </thead>
              <tbody>
                {result.students.map((s, i) => (
                  <tr key={`${s.name}-${i}`}>
                    <td>{s.name}</td>
                    <td className="meta">
                      {s.arrivalTime ? `in ${formatClock(s.arrivalTime)}` : s.dayType === 'full' ? 'full' : 'shortened'}
                      {s.departureTime ? ` · out ${formatClock(s.departureTime)}` : ''}
                    </td>
                    <td className="meta">{s.traits.join(', ') || '—'}</td>
                    <td className="meta">{s.requiresOneToOne ? 'yes' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.warnings.map((w, i) => (
              <p className="meta warn-text" key={i}>
                {w}
              </p>
            ))}
            <div className="row-actions" style={{ marginTop: 14 }}>
              <button type="button" className="btn btn-primary" onClick={() => apply(result.students)}>
                {mode === 'replace' ? 'Use these' : 'Add these'} {result.students.length} student
                {result.students.length === 1 ? '' : 's'}
              </button>
            </div>
          </>
        )}
        <div className="row-actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn" onClick={onNext}>
            Keep the current students and continue
          </button>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------- step 3

function StaffStep({ onNext }: { onNext: () => void }) {
  const { data, dispatch } = useStore();
  const [text, setText] = useState('');
  const result = useMemo(() => (text.trim() ? parseStaffList(text) : null), [text]);
  const resourceRoomId = data.locations[0]?.id ?? defaultLocations()[0].id;

  return (
    <div className="grid grid-2">
      <div className="card">
        <h3>3. Who works in the room?</h3>
        <p className="lede">
          One adult per line, including the teacher. Write “- teacher” after a name to mark the lead teacher; everyone
          else is treated as an aide who can leave the room with a student.
        </p>
        <PasteBox
          value={text}
          onChange={setText}
          rows={8}
          onSample={() => setText('Ashley Brewer - teacher\nDenise Morales\nKeisha Ward\nTom Alvarez\nPriya Shah')}
          placeholder={'Ashley Brewer - teacher\nDenise Morales\nKeisha Ward'}
        />
      </div>

      <div className="card">
        <h3>What I understood</h3>
        {!result ? (
          <>
            <p className="muted">Current staff:</p>
            <ul className="help-list">
              {data.aides.map((a) => (
                <li key={a.id}>
                  {a.name} <span className="meta">{a.role === 'teacher' ? 'teacher' : 'aide'}</span>
                </li>
              ))}
            </ul>
          </>
        ) : result.staff.length === 0 ? (
          <Banner kind="bad" title="Could not read that">
            {result.warnings.join(' ')}
          </Banner>
        ) : (
          <>
            <ul className="help-list">
              {result.staff.map((s, i) => (
                <li key={`${s.name}-${i}`}>
                  <strong>{s.name}</strong>{' '}
                  <span className="meta">{s.role === 'teacher' ? 'teacher — stays in the room' : 'aide'}</span>
                </li>
              ))}
            </ul>
            {!result.staff.some((s) => s.role === 'teacher') ? (
              <p className="meta warn-text">
                No teacher was marked. Add “- teacher” after one name so the classroom teacher is on the schedule.
              </p>
            ) : null}
            <div className="row-actions" style={{ marginTop: 14 }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  dispatch({
                    type: 'patch',
                    data: {
                      aides: toStaff(result.staff, resourceRoomId),
                      students: data.students.map((s) => ({ ...s, preferredAideIds: [] })),
                      schedule: null,
                      backupPlans: [],
                    },
                  });
                  onNext();
                }}
              >
                Use these {result.staff.length} adults
              </button>
            </div>
          </>
        )}
        <div className="row-actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn" onClick={onNext}>
            Keep the current staff and continue
          </button>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------- step 4

function ConflictStep({ onNext }: { onNext: () => void }) {
  const { data, dispatch } = useStore();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [reason, setReason] = useState('');

  const sorted = [...data.students].sort((x, y) => x.name.localeCompare(y.name));
  const nameOf = (id: string): string => data.students.find((s) => s.id === id)?.name ?? id;

  const alreadyPaired = (x: string, y: string): boolean =>
    data.keepApart.some(
      (p) => (p.studentAId === x && p.studentBId === y) || (p.studentAId === y && p.studentBId === x),
    );

  const add = (): void => {
    if (!a || !b || a === b || alreadyPaired(a, b)) return;
    dispatch({ type: 'upsertKeepApart', pair: { id: createId('ka'), studentAId: a, studentBId: b, reason } });
    setA('');
    setB('');
    setReason('');
  };

  return (
    <div className="grid grid-2">
      <div className="card">
        <h3>4a. Who must stay apart?</h3>
        <p className="lede">
          Pick two students who cannot share an adult. AideFlow will never put them with the same person, and will tell
          you plainly if that makes the day impossible.
        </p>
        <div className="form-grid">
          <select value={a} onChange={(e) => setA(e.target.value)} aria-label="First student">
            <option value="">Choose a student…</option>
            {sorted.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select value={b} onChange={(e) => setB(e.target.value)} aria-label="Second student">
            <option value="">…and the student to keep them away from</option>
            {sorted
              .filter((s) => s.id !== a)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
          <input
            type="text"
            placeholder="Why? (optional, prints on the conflict report)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={add}
            disabled={!a || !b || a === b || alreadyPaired(a, b)}
          >
            {a && b && alreadyPaired(a, b) ? 'Already added' : 'Add this pair'}
          </button>
        </div>

        <h4 style={{ marginTop: 18 }}>Pairs so far</h4>
        {data.keepApart.length === 0 ? (
          <p className="muted">None yet.</p>
        ) : (
          data.keepApart.map((p) => (
            <div className="list-row" key={p.id}>
              <div>
                <strong>
                  {nameOf(p.studentAId)} &amp; {nameOf(p.studentBId)}
                </strong>
                {p.reason ? <div className="meta">{p.reason}</div> : null}
              </div>
              <button
                type="button"
                className="btn btn-small btn-danger"
                onClick={() => dispatch({ type: 'deleteKeepApart', id: p.id })}
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <h3>4b. Traits</h3>
        <p className="lede">
          Tick what applies to each student. Trait rules on the Rules tab turn these into hard limits — by default two
          students tagged <strong>aggressive</strong> never share an adult, and anyone tagged{' '}
          <strong>elopes</strong> gets 1:1.
        </p>
        <div className="trait-grid">
          {sorted.map((s) => (
            <div className="trait-row" key={s.id}>
              <div className="trait-name">
                <strong>{s.name}</strong>
                {s.requiresOneToOne ? <span className="pill">1:1</span> : null}
              </div>
              <ChipSelect
                options={[...BUILT_IN_TRAITS]}
                value={s.traits}
                onToggle={(traits) => dispatch({ type: 'upsertStudent', student: { ...s, traits } })}
                danger
              />
            </div>
          ))}
          {sorted.length === 0 ? <p className="muted">Add students first.</p> : null}
        </div>
        <div className="row-actions" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-primary" onClick={onNext}>
            Done with conflicts
          </button>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------- step 5

function FinishStep({
  onBuild,
  onOpen,
}: {
  onBuild: () => void;
  onOpen: (v: 'students' | 'blocks' | 'aides' | 'rules' | 'schedule') => void;
}) {
  const { data } = useStore();
  const problems: string[] = [];
  if (data.blocks.length === 0) problems.push('There are no time blocks. Go back to step 1.');
  if (data.students.length === 0) problems.push('There are no students. Go back to step 2.');
  if (!data.aides.some((a) => a.countsAsCoverage && !a.absent)) {
    problems.push('There are no staff available. Go back to step 3.');
  }

  return (
    <div className="card">
      <h3>5. Build the schedule</h3>
      {problems.length > 0 ? (
        <Banner kind="bad" title="Something is missing">
          <ul className="help-list">
            {problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </Banner>
      ) : (
        <Banner kind="ok" title="Ready">
          {data.students.length} students, {data.aides.length} adults and {data.blocks.length} blocks are loaded.
        </Banner>
      )}

      <p className="lede" style={{ marginTop: 12 }}>
        Auto-Schedule only keeps a result when every hard rule is satisfied. If no safe arrangement exists it will say
        so and name the reason instead of guessing.
      </p>

      <div className="row-actions" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-primary" onClick={onBuild} disabled={problems.length > 0}>
          Build the schedule
        </button>
        <button type="button" className="btn" onClick={() => onOpen('students')}>
          Fine-tune each student's day
        </button>
        <button type="button" className="btn" onClick={() => onOpen('rules')}>
          More rules
        </button>
      </div>

      <h4 style={{ marginTop: 20 }}>What you can still change</h4>
      <ul className="help-list">
        <li>
          <strong>Students</strong> — each child's day block by block: what class, which room, whether an adult goes
          with them.
        </li>
        <li>
          <strong>Timeline</strong> — adjust a block, or pick exactly which students are in it.
        </li>
        <li>
          <strong>Staff</strong> — who is out today, and who can leave the room.
        </li>
        <li>
          <strong>Rules</strong> — trait-versus-trait conflicts and how strict they are.
        </li>
      </ul>
    </div>
  );
}
