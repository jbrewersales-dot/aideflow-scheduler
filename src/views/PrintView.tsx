import { formatTimeRange, sortBlocks, studentAttendsBlock } from '../domain';
import { scheduleToCsv } from '../csv';
import { downloadText } from '../storage';
import { Banner } from '../ui';
import { useStore } from '../state';

export function PrintView() {
  const { data, scheduleLegal } = useStore();
  const blocks = sortBlocks(data.blocks);
  const assignments = data.schedule?.assignments ?? [];

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
          <h2>Printable schedule</h2>
          <p className="lede">Use your browser’s Print dialog and choose “Save as PDF” if you need a file.</p>
        </div>
        <div className="row-actions">
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            Print / Save PDF
          </button>
          <button type="button" className="btn" onClick={() => downloadText('aideflow-schedule.csv', scheduleToCsv(data), 'text/csv')}>
            Download CSV
          </button>
        </div>
      </div>

      <div className="print-only">
        <h1>AideFlow schedule</h1>
        <p>
          {data.teacherName}
          {data.schoolName ? ` · ${data.schoolName}` : ''} · generated {new Date(data.schedule.generatedAt).toLocaleString()}
        </p>
      </div>

      <div className="card">
        <table className="schedule-table">
          <thead>
            <tr>
              <th className="sticky">Block</th>
              {data.aides.map((a) => (
                <th key={a.id}>{a.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {blocks.map((block) => (
              <tr key={block.id}>
                <td className="sticky">
                  <strong>{block.name}</strong>
                  <span className="time-cell">{formatTimeRange(block)}</span>
                </td>
                {data.aides.map((aide) => {
                  const names = assignments
                    .filter((a) => a.blockId === block.id && a.aideId === aide.id)
                    .map((a) => data.students.find((s) => s.id === a.studentId)?.name ?? a.studentId);
                  return <td key={aide.id}>{names.join(', ') || '—'}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ marginTop: 24 }}>By student</h3>
      <div className="card">
        {data.students
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((student) => {
            const line = blocks
              .filter((b) => studentAttendsBlock(student, b, data.blocks))
              .map((block) => {
                const row = assignments.find((a) => a.studentId === student.id && a.blockId === block.id);
                const aide = data.aides.find((x) => x.id === row?.aideId)?.name ?? '—';
                return `${block.name} (${aide})`;
              })
              .join(' · ');
            return (
              <div className="list-row" key={student.id}>
                <div>
                  <strong>{student.name}</strong>
                  <div className="meta">{line}</div>
                </div>
              </div>
            );
          })}
      </div>
    </section>
  );
}
