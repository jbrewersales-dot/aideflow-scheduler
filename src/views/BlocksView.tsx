import { useState } from 'react';
import { formatClockRange, isValidTime, sortBlocks, studentAttendsBlock, timeToMinutes } from '../domain';
import type { AppliesTo, BlockKind, ScheduleBlock, Student } from '../types';
import { Field, Modal } from '../ui';
import { blankBlock, useStore } from '../state';

const KINDS: BlockKind[] = ['period', 'homeroom', 'recess', 'lunch', 'specials', 'bus-pickup', 'bus-dropoff', 'other'];

function whoLabel(block: ScheduleBlock, students: Student[]): string {
  if (block.appliesTo === 'all') return 'everyone who is here';
  if (block.appliesTo === 'full') return 'full-day students';
  if (block.appliesTo === 'shortened') return 'shortened-day students';
  const names = block.studentIds
    .map((id) => students.find((s) => s.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  if (names.length === 0) return 'nobody yet — pick the students';
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} +${names.length - 3} more`;
}

/** True when the student is in the building for any part of the block. */
function inBuildingFor(student: Student, block: ScheduleBlock): boolean {
  const start = timeToMinutes(block.startTime);
  const end = timeToMinutes(block.endTime);
  const from = isValidTime(student.arrivalTime) ? timeToMinutes(student.arrivalTime) : -Infinity;
  const to = isValidTime(student.departureTime) ? timeToMinutes(student.departureTime) : Infinity;
  return start < to && from < end;
}

export function BlocksView() {
  const { data, dispatch } = useStore();
  const [editing, setEditing] = useState<ScheduleBlock | null>(null);
  const blocks = sortBlocks(data.blocks);

  return (
    <section>
      <div className="page-head">
        <div>
          <h2>School-day timeline</h2>
          <p className="lede">
            Periods, recess, lunch, and bus windows. For each block you can say “everyone who is here”, use the
            full-day or shortened-day pattern, or tick the exact students who are in it.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing(blankBlock())}>
          Add block
        </button>
      </div>
      <div className="card">
        {blocks.map((b) => {
          const here = data.students.filter((s) => studentAttendsBlock(s, b, data.blocks));
          const ghosts = b.appliesTo === 'listed'
            ? here.filter((s) => !inBuildingFor(s, b))
            : [];
          return (
            <div className="list-row" key={b.id}>
              <div>
                <strong>{b.name}</strong>
                <div className="meta">
                  {formatClockRange(b)} · {b.kind} · {whoLabel(b, data.students)}
                </div>
                <div className="meta">
                  {here.length} student{here.length === 1 ? '' : 's'} in this block
                </div>
                {ghosts.length > 0 ? (
                  <div className="meta warn-text">
                    Ticked but outside their school hours: {ghosts.map((s) => s.name).join(', ')}
                  </div>
                ) : null}
              </div>
              <div className="row-actions">
                <button type="button" className="btn btn-small" onClick={() => setEditing(b)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-small btn-danger"
                  onClick={() => {
                    if (confirm(`Delete “${b.name}”?`)) dispatch({ type: 'deleteBlock', id: b.id });
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {editing ? (
        <BlockEditor
          block={editing}
          onClose={() => setEditing(null)}
          onSave={(block) => {
            if (!block.name.trim()) return;
            dispatch({ type: 'upsertBlock', block: { ...block, name: block.name.trim() } });
            setEditing(null);
          }}
        />
      ) : null}
    </section>
  );
}

function BlockEditor({
  block,
  onClose,
  onSave,
}: {
  block: ScheduleBlock;
  onClose: () => void;
  onSave: (b: ScheduleBlock) => void;
}) {
  const { data } = useStore();
  const [draft, setDraft] = useState(block);
  const patch = (partial: Partial<ScheduleBlock>) => setDraft((d) => ({ ...d, ...partial }));

  const roster = [...data.students].sort((a, b) => a.name.localeCompare(b.name));
  const listed = draft.appliesTo === 'listed';

  const toggle = (id: string): void => {
    patch({
      studentIds: draft.studentIds.includes(id)
        ? draft.studentIds.filter((x) => x !== id)
        : [...draft.studentIds, id],
    });
  };

  /** Switching to "pick the students" starts from whoever is in the block now. */
  const changeWho = (next: AppliesTo): void => {
    if (next === 'listed' && draft.appliesTo !== 'listed' && draft.studentIds.length === 0) {
      const current = data.students
        .filter((s) => studentAttendsBlock(s, { ...draft, appliesTo: draft.appliesTo }, data.blocks))
        .map((s) => s.id);
      patch({ appliesTo: next, studentIds: current });
      return;
    }
    patch({ appliesTo: next });
  };

  return (
    <Modal title={block.name ? `Edit ${block.name}` : 'New block'} onClose={onClose} wide={listed}>
      <div className="form-grid two">
        <Field label="Name">
          <input type="text" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
        </Field>
        <Field label="Kind">
          <select value={draft.kind} onChange={(e) => patch({ kind: e.target.value as BlockKind })}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Start">
          <input type="time" value={draft.startTime} onChange={(e) => patch({ startTime: e.target.value })} />
        </Field>
        <Field label="End">
          <input type="time" value={draft.endTime} onChange={(e) => patch({ endTime: e.target.value })} />
        </Field>
      </div>

      <div className="form-grid" style={{ marginTop: 12 }}>
        <Field
          label="Who is in this block"
          hint="Pick the students by name when the block is not simply all full-day or all shortened-day."
        >
          <select value={draft.appliesTo} onChange={(e) => changeWho(e.target.value as AppliesTo)}>
            <option value="all">Everyone who is here at this time</option>
            <option value="full">Full-day students only</option>
            <option value="shortened">Shortened-day students only</option>
            <option value="listed">Pick the students by name…</option>
          </select>
        </Field>
      </div>

      {listed ? (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="row-actions" style={{ marginBottom: 10 }}>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => patch({ studentIds: roster.map((s) => s.id) })}
            >
              Select all
            </button>
            <button type="button" className="btn btn-small" onClick={() => patch({ studentIds: [] })}>
              Clear all
            </button>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => patch({ studentIds: roster.filter((s) => inBuildingFor(s, draft)).map((s) => s.id) })}
            >
              Everyone here at this time
            </button>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => patch({ studentIds: roster.filter((s) => s.dayType === 'full').map((s) => s.id) })}
            >
              Full-day
            </button>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => patch({ studentIds: roster.filter((s) => s.dayType === 'shortened').map((s) => s.id) })}
            >
              Shortened-day
            </button>
          </div>

          {roster.length === 0 ? (
            <p className="muted">No students yet. Add them on the Students tab first.</p>
          ) : (
            <div className="student-picker">
              {roster.map((s) => {
                const on = draft.studentIds.includes(s.id);
                const away = !inBuildingFor(s, draft);
                return (
                  <label key={s.id} className={`picker-row${on ? ' on' : ''}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(s.id)} />
                    <span>
                      <strong>{s.name}</strong>
                      <span className="meta">
                        {s.arrivalTime ? `arrives ${s.arrivalTime}` : s.dayType === 'full' ? 'full day' : 'shortened day'}
                        {s.departureTime ? ` · leaves ${s.departureTime}` : ''}
                        {away ? ' · not normally here at this time' : ''}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          <p className="meta" style={{ marginTop: 10 }}>
            {draft.studentIds.length} selected. Ticking nobody means this block has no students in it. A student added
            later is not added to this block automatically.
          </p>
        </div>
      ) : null}

      <div className="row-actions" style={{ marginTop: 16 }}>
        <button type="button" className="btn btn-primary" onClick={() => onSave(draft)}>
          Save block
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
