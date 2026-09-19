import { useState } from 'react';
import type { Aide } from '../types';
import { ChipSelect, Field, Modal, TagEditor } from '../ui';
import { blankAide, useStore } from '../state';

export function AidesView() {
  const { data, dispatch } = useStore();
  const [editing, setEditing] = useState<Aide | null>(null);

  return (
    <section>
      <div className="page-head">
        <div>
          <h2>Aides</h2>
          <p className="lede">AideFlow starts with four aides. Add more if you have them. Availability is by period — leave all blocks off to mean “available all day.”</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing(blankAide())}>
          Add aide
        </button>
      </div>
      <div className="grid grid-2">
        {data.aides.map((a) => (
          <article className="card" key={a.id}>
            <h3>{a.name}</h3>
            <p className="meta">Max {a.maxCaseload} students at once</p>
            {a.trainedTags.length ? <p className="meta">Trained: {a.trainedTags.join(', ')}</p> : null}
            {a.notes ? <p>{a.notes}</p> : null}
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
    <Modal title={aide.name ? `Edit ${aide.name}` : 'New aide'} onClose={onClose}>
      <div className="form-grid two">
        <Field label="Name">
          <input type="text" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
        </Field>
        <Field label="Max students at one time">
          <input
            type="number"
            min={1}
            max={12}
            value={draft.maxCaseload}
            onChange={(e) => patch({ maxCaseload: Math.max(1, Number(e.target.value) || 1) })}
          />
        </Field>
      </div>
      <div className="form-grid" style={{ marginTop: 12 }}>
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
              patch({
                availableBlockIds: data.blocks.filter((b) => names.includes(b.name)).map((b) => b.id),
              })
            }
          />
        </Field>
        <Field label="Students they work especially well with">
          <ChipSelect
            options={data.students.map((s) => s.name)}
            value={data.students.filter((s) => draft.preferredStudentIds.includes(s.id)).map((s) => s.name)}
            onToggle={(names) =>
              patch({
                preferredStudentIds: data.students.filter((s) => names.includes(s.name)).map((s) => s.id),
              })
            }
          />
        </Field>
      </div>
      <div className="row-actions" style={{ marginTop: 16 }}>
        <button type="button" className="btn btn-primary" onClick={() => onSave(draft)}>
          Save aide
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
