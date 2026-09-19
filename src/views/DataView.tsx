import { useRef, useState } from 'react';
import { parseStudentCsv, scheduleToCsv, studentsToCsv, STUDENT_CSV_TEMPLATE } from '../csv';
import { resetDemo, resetEmpty, downloadText, exportJson, importJson } from '../storage';
import { Banner } from '../ui';
import { useStore } from '../state';

export function DataView() {
  const { data, dispatch, scheduleLegal } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="grid grid-2">
      <div className="card">
        <h2>Student list (CSV)</h2>
        <p className="lede">
          Download the template, fill it in Excel or Google Sheets, then upload. You can still add students by hand. Nothing is sent to a server.
        </p>
        <div className="row-actions">
          <button
            type="button"
            className="btn"
            onClick={() => downloadText('aideflow-students-template.csv', STUDENT_CSV_TEMPLATE, 'text/csv')}
          >
            Download template CSV
          </button>
          <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()}>
            Upload student CSV
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => downloadText('aideflow-students.csv', studentsToCsv(data.students, data), 'text/csv')}
          >
            Export current students
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            const text = await file.text();
            const { students, errors } = parseStudentCsv(text, data);
            if (students.length === 0) {
              setError(errors.join(' ') || 'No students found in that file.');
              setMessage(null);
              return;
            }
            dispatch({ type: 'patch', data: { students: [...data.students, ...students], schedule: null } });
            setMessage(`Added ${students.length} student(s).${errors.length ? ` Notes: ${errors.join(' ')}` : ''}`);
            setError(null);
          }}
        />
        {message ? <Banner kind="ok" title="Upload complete">{message}</Banner> : null}
        {error ? <Banner kind="bad" title="Could not read that CSV">{error}</Banner> : null}
        <h3 style={{ marginTop: 20 }}>Columns</h3>
        <ul className="help-list">
          <li>
            <strong>name</strong> (required)
          </li>
          <li>
            <strong>dayType</strong> — full or shortened
          </li>
          <li>
            <strong>blocks</strong> — optional; semicolon-separated names. Blank = follow the day-type timeline
          </li>
          <li>
            <strong>busPickup / busDropoff</strong> — times such as 07:45
          </li>
          <li>
            <strong>needTags / traits</strong> — semicolon-separated (aggressive;elopes;wheelchair)
          </li>
          <li>
            <strong>requiresOneToOne</strong> — true / false
          </li>
          <li>
            <strong>preferredAides</strong> — aide names, semicolon-separated
          </li>
        </ul>
      </div>

      <div className="card">
        <h2>Backup &amp; classroom reset</h2>
        <p className="lede">
          AideFlow saves automatically in this browser. Export a JSON backup before you switch computers. Student names never leave this device.
        </p>
        <div className="row-actions">
          <button type="button" className="btn btn-primary" onClick={() => downloadText('aideflow-backup.json', exportJson(data))}>
            Export JSON backup
          </button>
          <button type="button" className="btn" onClick={() => jsonRef.current?.click()}>
            Import JSON backup
          </button>
          <button
            type="button"
            className="btn"
            disabled={!data.schedule || !scheduleLegal}
            onClick={() => downloadText('aideflow-schedule.csv', scheduleToCsv(data), 'text/csv')}
          >
            Export schedule CSV
          </button>
        </div>
        <input
          ref={jsonRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              const next = importJson(await file.text());
              dispatch({ type: 'replace', data: next });
              setMessage('Backup restored.');
              setError(null);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not import that file.');
              setMessage(null);
            }
          }}
        />
        <div className="row-actions" style={{ marginTop: 16 }}>
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (confirm('Reload the sample classroom? Your current local data will be replaced.')) {
                dispatch({ type: 'replace', data: resetDemo() });
              }
            }}
          >
            Load sample classroom
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              if (confirm('Start over with four empty aides and no students?')) {
                dispatch({ type: 'replace', data: resetEmpty() });
              }
            }}
          >
            Start blank classroom
          </button>
        </div>
      </div>
    </section>
  );
}
