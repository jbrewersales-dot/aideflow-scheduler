import { useState } from 'react';
import { formatClockRange, isTeacher, locationName, sortBlocks, studentLocationId } from '../domain';
import { solveSchedule } from '../scheduler/solver';
import { Banner } from '../ui';
import { useStore } from '../state';
import type { BackupPlan } from '../types';

/**
 * "What do we do if someone is out?" — builds a full alternative schedule for
 * each staff member's absence and shows exactly what changes.
 */
export function CoverageView() {
  const { data, dispatch } = useStore();
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);

  const staff = data.aides.filter((a) => a.countsAsCoverage);
  const blocks = sortBlocks(data.blocks);

  const buildAll = (): void => {
    setBusy(true);
    window.setTimeout(() => {
      const plans: BackupPlan[] = staff.map((person) => {
        const result = solveSchedule(data, { absentStaffIds: [person.id] });
        return {
          id: `bp_${person.id}`,
          absentStaffIds: [person.id],
          schedule: result.ok ? result.schedule : null,
          reasons: result.ok ? [] : result.reasons,
          generatedAt: new Date().toISOString(),
        };
      });
      dispatch({ type: 'setBackupPlans', plans });
      setBusy(false);
    }, 30);
  };

  const buildSelected = (): void => {
    if (selection.length === 0) return;
    setBusy(true);
    window.setTimeout(() => {
      const result = solveSchedule(data, { absentStaffIds: selection });
      const plan: BackupPlan = {
        id: `bp_${selection.slice().sort().join('_')}`,
        absentStaffIds: selection,
        schedule: result.ok ? result.schedule : null,
        reasons: result.ok ? [] : result.reasons,
        generatedAt: new Date().toISOString(),
      };
      dispatch({ type: 'setBackupPlans', plans: [plan, ...data.backupPlans.filter((p) => p.id !== plan.id)] });
      setBusy(false);
    }, 30);
  };

  const nameOf = (id: string): string => data.aides.find((a) => a.id === id)?.name ?? id;

  return (
    <section>
      <div className="page-head">
        <div>
          <h2>If someone is out</h2>
          <p className="lede">
            Build a complete backup day for each person’s absence, before you need it. Every backup follows the same
            hard rules as the main schedule — if there is no safe way to cover the day without someone, it says so
            instead of guessing.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={buildAll} disabled={busy}>
          {busy ? 'Working…' : 'Build a plan for each person'}
        </button>
      </div>

      <div className="card">
        <h3>Someone specific is out</h3>
        <p className="meta">Tick everyone who is away today, then build one combined plan.</p>
        <div className="chips" style={{ marginTop: 8 }}>
          {staff.map((a) => {
            const on = selection.includes(a.id);
            return (
              <button
                type="button"
                key={a.id}
                className={`chip${on ? ' on' : ''}`}
                aria-pressed={on}
                onClick={() => setSelection(on ? selection.filter((id) => id !== a.id) : [...selection, a.id])}
              >
                {a.name}
                {isTeacher(a) ? ' (teacher)' : ''}
              </button>
            );
          })}
        </div>
        <div className="row-actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-primary" onClick={buildSelected} disabled={busy || selection.length === 0}>
            Build plan without {selection.length ? selection.map(nameOf).join(' + ') : '…'}
          </button>
          <button type="button" className="btn" onClick={() => setSelection([])} disabled={selection.length === 0}>
            Clear
          </button>
        </div>
      </div>

      {data.backupPlans.length === 0 ? (
        <Banner kind="warn" title="No backup plans yet">
          Press <strong>Build a plan for each person</strong>. Plans are cleared whenever you change students, staff or
          rules, so they never go stale.
        </Banner>
      ) : null}

      {data.backupPlans.map((plan) => (
        <article className="card" key={plan.id}>
          <h3>
            If {plan.absentStaffIds.map(nameOf).join(' and ')} {plan.absentStaffIds.length > 1 ? 'are' : 'is'} out
          </h3>
          {plan.schedule ? (
            <>
              <p className="meta">
                A full, legal day is possible. {plan.schedule.assignments.length} student placements.
              </p>
              <div className="schedule-wrap" style={{ marginTop: 10 }}>
                <table className="schedule-table">
                  <thead>
                    <tr>
                      <th className="sticky">Time</th>
                      {data.aides
                        .filter((a) => !plan.absentStaffIds.includes(a.id))
                        .map((a) => (
                          <th key={a.id}>{a.name}</th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {blocks.map((block) => {
                      const rows = plan.schedule!.assignments.filter((a) => a.blockId === block.id);
                      if (rows.length === 0) return null;
                      return (
                        <tr key={block.id}>
                          <td className="sticky">
                            <strong>{block.name}</strong>
                            <span className="time-cell">{formatClockRange(block)}</span>
                          </td>
                          {data.aides
                            .filter((a) => !plan.absentStaffIds.includes(a.id))
                            .map((aide) => {
                              const mine = rows.filter((r) => r.aideId === aide.id);
                              const students = mine
                                .map((r) => data.students.find((s) => s.id === r.studentId))
                                .filter((s): s is NonNullable<typeof s> => Boolean(s));
                              const room = students[0]
                                ? studentLocationId(students[0], block.id, data.locations)
                                : '';
                              const changed = data.schedule
                                ? mine.some(
                                    (r) =>
                                      data.schedule!.assignments.find(
                                        (o) => o.studentId === r.studentId && o.blockId === r.blockId,
                                      )?.aideId !== r.aideId,
                                  )
                                : false;
                              return (
                                <td key={aide.id} className={changed ? 'cell-changed' : undefined}>
                                  {students.map((s) => s.name).join(', ') || '—'}
                                  {room && room !== data.locations[0]?.id ? (
                                    <span className="time-cell">{locationName(data.locations, room)}</span>
                                  ) : null}
                                </td>
                              );
                            })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="meta" style={{ marginTop: 8 }}>
                Shaded cells are the students who move compared with today’s schedule.
              </p>
            </>
          ) : (
            <>
              <Banner kind="bad" title="No safe schedule without them">
                You would need a substitute, or a rule change, on this day.
              </Banner>
              <ul className="help-list">
                {plan.reasons.slice(0, 6).map((r, i) => (
                  <li key={`${r.kind}-${i}`}>{r.message}</li>
                ))}
              </ul>
            </>
          )}
        </article>
      ))}
    </section>
  );
}
