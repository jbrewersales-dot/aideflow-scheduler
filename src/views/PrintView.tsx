import { useState } from 'react';
import {
  formatClock,
  formatClockRange,
  locationName,
  sortBlocks,
  studentActivity,
  studentAttendsBlock,
  studentLocationId,
  studentNeedsCoverage,
  studentNeedsEscort,
} from '../domain';
import { scheduleToCsv, staffToCsv } from '../csv';
import { downloadText } from '../storage';
import { Banner } from '../ui';
import { useStore } from '../state';

type Sheet = 'day' | 'students' | 'staff';

export function PrintView() {
  const { data, scheduleLegal } = useStore();
  const [sheet, setSheet] = useState<Sheet>('day');
  const blocks = sortBlocks(data.blocks);
  const assignments = data.schedule?.assignments ?? [];
  const defaultRoom = data.locations[0]?.id ?? '';

  if (!data.schedule) {
    return <Banner kind="warn" title="Nothing to print">Run Auto-Schedule first.</Banner>;
  }
  if (!scheduleLegal) {
    return (
      <Banner kind="bad" title="Printing is locked">
        Fix hard conflicts or run Auto-Schedule again. AideFlow will not print an unsafe roster.
      </Banner>
    );
  }

  return (
    <section>
      <div className="page-head no-print">
        <div>
          <h2>Print</h2>
          <p className="lede">Pick a sheet, then use your browser’s Print dialog and choose “Save as PDF” for a file.</p>
        </div>
        <div className="row-actions">
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            Print / Save PDF
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => downloadText('aideflow-schedule.csv', scheduleToCsv(data), 'text/csv')}
          >
            Student CSV
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => downloadText('aideflow-staff-sheets.csv', staffToCsv(data), 'text/csv')}
          >
            Staff CSV
          </button>
        </div>
      </div>

      <div className="subnav no-print">
        <button type="button" className={sheet === 'day' ? 'active' : undefined} onClick={() => setSheet('day')}>
          Day grid
        </button>
        <button type="button" className={sheet === 'students' ? 'active' : undefined} onClick={() => setSheet('students')}>
          One sheet per student
        </button>
        <button type="button" className={sheet === 'staff' ? 'active' : undefined} onClick={() => setSheet('staff')}>
          One sheet per adult
        </button>
      </div>

      <div className="print-only">
        <h1>AideFlow · {data.teacherName}</h1>
        <p>
          {data.schoolName ? `${data.schoolName} · ` : ''}generated{' '}
          {new Date(data.schedule.generatedAt).toLocaleString()}
          {data.schedule.absentStaffIds.length > 0
            ? ` · without ${data.schedule.absentStaffIds
                .map((id) => data.aides.find((a) => a.id === id)?.name ?? id)
                .join(', ')}`
            : ''}
        </p>
      </div>

      {sheet === 'day' ? (
        <div className="card">
          <table className="schedule-table">
            <thead>
              <tr>
                <th className="sticky">Time</th>
                <th>Who is in the room</th>
                {data.aides.map((a) => (
                  <th key={a.id}>{a.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {blocks.map((block) => {
                const present = data.students.filter((s) => studentAttendsBlock(s, block, data.blocks));
                if (present.length === 0) return null;
                return (
                  <tr key={block.id}>
                    <td className="sticky">
                      <strong>{block.name}</strong>
                      <span className="time-cell">{formatClockRange(block)}</span>
                    </td>
                    <td>
                      <span className="time-cell">{present.length} student(s)</span>
                      {present
                        .filter((s) => studentLocationId(s, block.id, data.locations) !== defaultRoom)
                        .map((s) => (
                          <div className="meta" key={s.id}>
                            {s.name} → {locationName(data.locations, studentLocationId(s, block.id, data.locations))}
                          </div>
                        ))}
                    </td>
                    {data.aides.map((aide) => {
                      const mine = assignments.filter((a) => a.blockId === block.id && a.aideId === aide.id);
                      const names = mine.map((a) => {
                        const s = data.students.find((x) => x.id === a.studentId);
                        if (!s) return a.studentId;
                        return studentNeedsEscort(s, block.id) ? `${s.name} ↗` : s.name;
                      });
                      return <td key={aide.id}>{names.join(', ') || '—'}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="meta" style={{ marginTop: 8 }}>↗ means that adult leaves the classroom with the student.</p>
        </div>
      ) : null}

      {sheet === 'students' ? (
        <div>
          {data.students
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((student) => {
              const theirs = blocks.filter((b) => studentAttendsBlock(student, b, data.blocks));
              return (
                <div className="card print-sheet" key={student.id}>
                  <h3>{student.name}</h3>
                  <p className="meta">
                    {student.arrivalTime ? `Arrives ${formatClock(student.arrivalTime)}` : 'Arrives with the AM bus'}
                    {student.departureTime ? ` · leaves ${formatClock(student.departureTime)}` : ''}
                    {student.requiresOneToOne ? ' · 1:1 required' : ''}
                    {student.traits.length ? ` · ${student.traits.join(', ')}` : ''}
                  </p>
                  {student.needsNotes ? <p>{student.needsNotes}</p> : null}
                  <table className="schedule-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Class / activity</th>
                        <th>Room</th>
                        <th>Adult</th>
                      </tr>
                    </thead>
                    <tbody>
                      {theirs.map((block) => {
                        const row = assignments.find((a) => a.studentId === student.id && a.blockId === block.id);
                        const aide = data.aides.find((x) => x.id === row?.aideId);
                        const needs = studentNeedsCoverage(student, block, data.blocks);
                        return (
                          <tr key={block.id}>
                            <td>{formatClockRange(block)}</td>
                            <td>{studentActivity(student, block)}</td>
                            <td>{locationName(data.locations, studentLocationId(student, block.id, data.locations))}</td>
                            <td>
                              {aide?.name ?? (needs ? '—' : 'no adult needed')}
                              {aide && studentNeedsEscort(student, block.id) ? ' (goes with them)' : ''}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
        </div>
      ) : null}

      {sheet === 'staff' ? (
        <div>
          {data.aides.map((aide) => {
            const rows = blocks
              .map((block) => ({
                block,
                students: assignments
                  .filter((a) => a.blockId === block.id && a.aideId === aide.id)
                  .map((a) => data.students.find((s) => s.id === a.studentId))
                  .filter((s): s is NonNullable<typeof s> => Boolean(s)),
              }))
              .filter((r) => r.students.length > 0);
            return (
              <div className="card print-sheet" key={aide.id}>
                <h3>
                  {aide.name} {aide.absent ? <span className="pill">out today</span> : null}
                </h3>
                {rows.length === 0 ? (
                  <p className="meta">No students assigned.</p>
                ) : (
                  <table className="schedule-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Block</th>
                        <th>Room</th>
                        <th>Students</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ block, students }) => (
                        <tr key={block.id}>
                          <td>{formatClockRange(block)}</td>
                          <td>{block.name}</td>
                          <td>
                            {locationName(data.locations, studentLocationId(students[0], block.id, data.locations))}
                          </td>
                          <td>{students.map((s) => s.name).join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
