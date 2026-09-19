import { useMemo, useState } from 'react';
import { BUILT_IN_TRAITS } from '../types';
import { ChipSelect, Field, Modal, TagEditor } from '../ui';
import { blankStudent, useStore } from '../state';
import type { Student } from '../types';

export function StudentsView() {
  const { data, dispatch } = useStore();
  const [editing, setEditing] = useState<Student | null>(null);
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return data.students
      .filter((s) => !n || s.name.toLowerCase().includes(n) || s.traits.join(' ').includes(n))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data.students, q]);

  return (
    <section>
      <div className="page-head">
        <div>
          <h2>Students</h2>
          <p className="lede">Names, day type, bus times, supports, and traits. Leave “blocks” blank to use the full-day or shortened-day pattern.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing(blankStudent())}>
          Add student
        </button>
      </div>
      <input type="text" placeholder="Search students" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 360, marginBottom: 12 }} />
      <div className="card">
        {filtered.length === 0 ? <p className="muted">No students yet. Add one or upload a CSV on the Data tab.</p> : null}
        {filtered.map((s) => (
          <div className="list-row" key={s.id}>
            <div>
              <strong>{s.name}</strong>
              <div className="meta">
                {s.dayType === 'full' ? 'Full day' : 'Shortened day'}
                {s.requiresOneToOne ? ' · 1:1' : ''}
                {s.traits.length ? ` · ${s.traits.join(', ')}` : ''}
              </div>
              {s.needsNotes ? <div className="meta">{s.needsNotes}</div> : null}
            </div>
            <div className="row-actions">
              <button type="button" className="btn btn-small" onClick={() => setEditing(s)}>
                Edit
              </button>
              <button
                type="button"
                className="btn btn-small btn-danger"
                onClick={() => {
                  if (confirm(`Delete ${s.name}? This also removes keep-apart pairs that include them.`)) {
                    dispatch({ type: 'deleteStudent', id: s.id });
                  }
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      {editing ? (
        <StudentEditor
          student={editing}
          onClose={() => setEditing(null)}
          onSave={(student) => {
            if (!student.name.trim()) return;
            dispatch({ type: 'upsertStudent', student: { ...student, name: student.name.trim() } });
            setEditing(null);
          }}
        />
      ) : null}
    </section>
  );
}

function StudentEditor({
  student,
  onClose,
  onSave,
}: {
  student: Student;
  onClose: () => void;
  onSave: (s: Student) => void;
}) {
  const { data } = useStore();
  const [draft, setDraft] = useState(student);
  const patch = (partial: Partial<Student>) => setDraft((d) => ({ ...d, ...partial }));

  return (
    <Modal title={student.name ? `Edit ${student.name}` : 'New student'} onClose={onClose}>
      <div className="form-grid two">
        <Field label="Name">
          <input type="text" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
        </Field>
        <Field label="Day type">
          <select value={draft.dayType} onChange={(e) => patch({ dayType: e.target.value === 'shortened' ? 'shortened' : 'full' })}>
            <option value="full">Full day</option>
            <option value="shortened">Shortened day</option>
          </select>
        </Field>
        <Field label="Bus pickup" hint="Optional arrival time">
          <input type="time" value={draft.busPickup ?? ''} onChange={(e) => patch({ busPickup: e.target.value || undefined })} />
        </Field>
        <Field label="Bus drop-off" hint="Optional dismissal time">
          <input type="time" value={draft.busDropoff ?? ''} onChange={(e) => patch({ busDropoff: e.target.value || undefined })} />
        </Field>
        <Field label="Coverage">
          <select
            value={draft.coverageMode}
            onChange={(e) =>
              patch({
                coverageMode: e.target.value === 'listed' || e.target.value === 'none' ? e.target.value : 'always',
              })
            }
          >
            <option value="always">Must have an aide every block they attend</option>
            <option value="listed">Only the blocks checked below</option>
            <option value="none">No required aide (optional grouping)</option>
          </select>
        </Field>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.requiresOneToOne}
            onChange={(e) => patch({ requiresOneToOne: e.target.checked })}
          />
          Needs 1:1 (cannot share an aide)
        </label>
      </div>
      <div className="form-grid" style={{ marginTop: 12 }}>
        <Field label="Traits">
          <ChipSelect options={[...BUILT_IN_TRAITS]} value={draft.traits} onToggle={(traits) => patch({ traits })} danger />
          <TagEditor values={draft.traits} onChange={(traits) => patch({ traits })} placeholder="Add a custom trait and press Enter" />
        </Field>
        <Field label="Needs / support tags">
          <TagEditor values={draft.needTags} onChange={(needTags) => patch({ needTags })} placeholder="e.g. AAC, behavior plan — press Enter" />
        </Field>
        <Field label="Notes">
          <textarea value={draft.needsNotes} onChange={(e) => patch({ needsNotes: e.target.value })} />
        </Field>
        <Field label="Preferred aides">
          <ChipSelect
            options={data.aides.map((a) => a.name)}
            value={data.aides.filter((a) => draft.preferredAideIds.includes(a.id)).map((a) => a.name)}
            onToggle={(names) =>
              patch({
                preferredAideIds: data.aides.filter((a) => names.includes(a.name)).map((a) => a.id),
              })
            }
          />
        </Field>
        <Field label="Blocks they attend" hint="Leave all off to follow the day-type pattern automatically.">
          <ChipSelect
            options={data.blocks.map((b) => b.name)}
            value={data.blocks.filter((b) => draft.blockIds.includes(b.id)).map((b) => b.name)}
            onToggle={(names) =>
              patch({
                blockIds: data.blocks.filter((b) => names.includes(b.name)).map((b) => b.id),
              })
            }
          />
        </Field>
        {draft.coverageMode === 'listed' ? (
          <Field label="Blocks that require an aide">
            <ChipSelect
              options={data.blocks.map((b) => b.name)}
              value={data.blocks.filter((b) => draft.coverageBlockIds.includes(b.id)).map((b) => b.name)}
              onToggle={(names) =>
                patch({
                  coverageBlockIds: data.blocks.filter((b) => names.includes(b.name)).map((b) => b.id),
                })
              }
            />
          </Field>
        ) : null}
      </div>
      <div className="row-actions" style={{ marginTop: 16 }}>
        <button type="button" className="btn btn-primary" onClick={() => onSave(draft)}>
          Save student
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
