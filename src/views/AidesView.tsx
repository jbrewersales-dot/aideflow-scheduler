import { useState } from 'react';
import type { Aide } from '../types';
import { ChipSelect, Field, Modal, TagEditor } from '../ui';
import { blankAide, useStore } from '../state';
import { isTeacher, locationName } from '../domain';

export function AidesView() {
  const { data, dispatch } = useStore();
  const [editing, setEditing] = useState<Aide | null>(null);
  const staff = [...data.aides].sort((a, b) => Number(isTeacher(b)) - Number(isTeacher(a)));

  return (
    <section>
      <div className="page-head">
        <div>
          <h2>Staff</h2>
          <p className="lede">
            Everyone who can be responsible for a student, including Ashley. Tick <strong>out today</strong> for anyone
            who is absent and press Auto-Schedule for a day that works without them.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing(blankAide())}>
          Add staff member
        </button>
      </div>
      <div className="grid grid-2">
        {staff.map((a) => (
          <article className={`card${a.absent ? ' card-muted' : ''}`} key={a.id}>
            <h3>
              {a.name}{' '}
              <span className="pill">{isTeacher(a) ? 'Teacher' : 'Aide'}</span>
            </h3>
            <p className="meta">
              Up to {a.maxCaseload} students at once · based in {locationName(data.locations, a.homeLocationId)}
            </p>
            <p className="meta">{a.canLeaveRoom ? 'Can leave the room with a student' : 'Stays in the room'}</p>
            {a.trainedTags.length ? <p className="meta">Trained: {a.trainedTags.join(', ')}</p> : null}
            {a.notes ? <p>{a.notes}</p> : null}
            <label className="checkbox" style={{ marginTop: 8 }}>
              <input
                type="checkbox"
                checked={a.absent}
                onChange={(e) => dispatch({ type: 'setAbsent', id: a.id, absent: e.target.checked })}
              />
              Out today
            </label>
            <div className="row-actions">
              <button type="button" className="btn btn-small" onClick={() => setEditing(a)}>
                Edit
              </button>
              <button
                type="button"
                className="btn btn-small btn-danger"
                onClick={() => {
                  if (confirm(`Remove ${a.name} from AideFlow?`)) dispatch({ type: 'deleteAide', id: a.id });
                }}
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
      {editing ? (
        <AideEditor
          aide={editing}
          onClose={() => setEditing(null)}
          onSave={(aide) => {
            if (!aide.name.trim()) return;
            dispatch({ type: 'upsertAide', aide: { ...aide, name: aide.name.trim() } });
            setEditing(null);
          }}
        />
      ) : null}
    </section>
  );
}

function AideEditor({ aide, onClose, onSave }: { aide: Aide; onClose: () => void; onSave: (a: Aide) => void }) {
  const { data } = useStore();
  const [draft, setDraft] = useState(aide);
  const patch = (partial: Partial<Aide>) => setDraft((d) => ({ ...d, ...partial }));

  return (
    <Modal title={aide.name ? `Edit ${aide.name}` : 'New staff member'} onClose={onClose}>
      <div className="form-grid two">
        <Field label="Name">
          <input type="text" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
        </Field>
        <Field label="Role" hint="Teachers normally stay in the room and can hold a bigger group.">
          <select
            value={draft.role}
            onChange={(e) => {
              const role = e.target.value === 'teacher' ? 'teacher' : 'aide';
              patch({ role, canLeaveRoom: role === 'aide', maxCaseload: role === 'teacher' ? 10 : 4 });
            }}
          >
            <option value="aide">Aide / paraprofessional</option>
            <option value="teacher">Teacher</option>
          </select>
        </Field>
        <Field label="Max students at one time">
          <input
            type="number"
            min={1}
            max={20}
            value={draft.maxCaseload}
            onChange={(e) => patch({ maxCaseload: Math.max(1, Number(e.target.value) || 1) })}
          />
        </Field>
        <Field label="Based in">
          <select value={draft.homeLocationId} onChange={(e) => patch({ homeLocationId: e.target.value })}>
            {data.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="form-grid" style={{ marginTop: 12 }}>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.canLeaveRoom}
            onChange={(e) => patch({ canLeaveRoom: e.target.checked })}
          />
          Can leave the room to go with a student
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.countsAsCoverage}
            onChange={(e) => patch({ countsAsCoverage: e.target.checked })}
          />
          Counts as a student’s assigned adult
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={draft.absent} onChange={(e) => patch({ absent: e.target.checked })} />
          Out today
        </label>
        <Field label="Trained / preferred needs tags">
          <TagEditor
            values={draft.trainedTags}
            onChange={(trainedTags) => patch({ trainedTags })}
            placeholder="e.g. aggressive, wheelchair — press Enter"
          />
        </Field>
        <Field label="Notes">
          <textarea value={draft.notes} onChange={(e) => patch({ notes: e.target.value })} />
        </Field>
        <Field label="Available blocks" hint="Leave all off if they work the whole day.">
          <ChipSelect
            options={data.blocks.map((b) => b.name)}
            value={data.blocks.filter((b) => draft.availableBlockIds.includes(b.id)).map((b) => b.name)}
            onToggle={(names) =>
              patch({ availableBlockIds: data.blocks.filter((b) => names.includes(b.name)).map((b) => b.id) })
            }
          />
        </Field>
        <Field label="Students they work especially well with">
          <ChipSelect
            options={data.students.map((s) => s.name)}
            value={data.students.filter((s) => draft.preferredStudentIds.includes(s.id)).map((s) => s.name)}
            onToggle={(names) =>
              patch({ preferredStudentIds: data.students.filter((s) => names.includes(s.name)).map((s) => s.id) })
            }
          />
        </Field>
      </div>
      <div className="row-actions" style={{ marginTop: 16 }}>
        <button type="button" className="btn btn-primary" onClick={() => onSave(draft)}>
          Save
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
