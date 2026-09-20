import { useState } from 'react';
import { Field, Modal } from '../ui';
import { blankLocation, useStore } from '../state';
import { planFor, sortBlocks } from '../domain';
import type { LocationKind, SchoolLocation } from '../types';

const KINDS: { id: LocationKind; label: string }[] = [
  { id: 'resource', label: 'Resource / special education room' },
  { id: 'general-ed', label: 'General education classroom' },
  { id: 'specials', label: 'Specials (art, music, PE)' },
  { id: 'therapy', label: 'Therapy (speech, OT, PT)' },
  { id: 'bus', label: 'Bus loop / pickup' },
  { id: 'other', label: 'Somewhere else' },
];

export function RoomsView() {
  const { data, dispatch } = useStore();
  const [editing, setEditing] = useState<SchoolLocation | null>(null);
  const blocks = sortBlocks(data.blocks);

  const usageCount = (id: string): number =>
    data.students.reduce(
      (n, s) => n + blocks.filter((b) => planFor(s, b.id)?.locationId === id).length,
      0,
    );

  return (
    <section>
      <div className="page-head">
        <div>
          <h2>Rooms</h2>
          <p className="lede">
            Anywhere a student can be. This matters because one adult cannot be in two rooms at once — if a child goes
            to speech or a gen-ed class, the adult with them is not available to anyone else that period.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing(blankLocation())}>
          Add a room
        </button>
      </div>
      <div className="card">
        {data.locations.map((l, i) => (
          <div className="list-row" key={l.id}>
            <div>
              <strong>{l.name}</strong>
              {i === 0 ? <span className="pill">Default room</span> : null}
              <div className="meta">
                {KINDS.find((k) => k.id === l.kind)?.label ?? l.kind}
                {l.note ? ` · ${l.note}` : ''}
              </div>
              <div className="meta">Used in {usageCount(l.id)} student block(s)</div>
            </div>
            <div className="row-actions">
              <button type="button" className="btn btn-small" onClick={() => setEditing(l)}>
                Edit
              </button>
              <button
                type="button"
                className="btn btn-small btn-danger"
                disabled={data.locations.length <= 1}
                onClick={() => {
                  const uses = usageCount(l.id);
                  const warning = uses
                    ? `${l.name} is used in ${uses} student block(s). Those go back to the default room. Continue?`
                    : `Remove ${l.name}?`;
                  if (confirm(warning)) dispatch({ type: 'deleteLocation', id: l.id });
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="meta" style={{ marginTop: 12 }}>
        The first room in this list is the classroom students are in unless their own day says otherwise.
      </p>
      {editing ? (
        <RoomEditor
          location={editing}
          onClose={() => setEditing(null)}
          onSave={(location) => {
            if (!location.name.trim()) return;
            dispatch({ type: 'upsertLocation', location: { ...location, name: location.name.trim() } });
            setEditing(null);
          }}
        />
      ) : null}
    </section>
  );
}

function RoomEditor({
  location,
  onClose,
  onSave,
}: {
  location: SchoolLocation;
  onClose: () => void;
  onSave: (l: SchoolLocation) => void;
}) {
  const [draft, setDraft] = useState(location);
  return (
    <Modal title={location.name ? `Edit ${location.name}` : 'New room'} onClose={onClose}>
      <div className="form-grid">
        <Field label="Room name" hint="What Ashley would call it out loud, e.g. “Mrs. Diaz — Room 12”.">
          <input type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        <Field label="Kind of place">
          <select
            value={draft.kind}
            onChange={(e) => setDraft({ ...draft, kind: e.target.value as LocationKind })}
          >
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Note">
          <input type="text" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
        </Field>
      </div>
      <div className="row-actions" style={{ marginTop: 16 }}>
        <button type="button" className="btn btn-primary" onClick={() => onSave(draft)}>
          Save room
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
