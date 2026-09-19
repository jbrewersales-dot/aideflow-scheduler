import { useState } from 'react';
import { formatTimeRange, sortBlocks } from '../domain';
import type { AppliesTo, BlockKind, ScheduleBlock } from '../types';
import { Field, Modal } from '../ui';
import { blankBlock, useStore } from '../state';

const KINDS: BlockKind[] = ['period', 'homeroom', 'recess', 'lunch', 'specials', 'bus-pickup', 'bus-dropoff', 'other'];

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
            Periods, recess, lunch, and bus windows. Mark a block “shortened day only” or “full day only” so those students appear as anchors (pickup/drop) without extra typing.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing(blankBlock())}>
          Add block
        </button>
      </div>
      <div className="card">
        {blocks.map((b) => (
          <div className="list-row" key={b.id}>
            <div>
              <strong>{b.name}</strong>
              <div className="meta">
                {formatTimeRange(b)} · {b.kind} ·{' '}
                {b.appliesTo === 'all' ? 'everyone' : b.appliesTo === 'full' ? 'full-day only' : 'shortened-day only'}
              </div>
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
        ))}
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
  const [draft, setDraft] = useState(block);
  const patch = (partial: Partial<ScheduleBlock>) => setDraft((d) => ({ ...d, ...partial }));

  return (
    <Modal title={block.name ? `Edit ${block.name}` : 'New block'} onClose={onClose}>
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
        <Field label="Who attends this block">
          <select value={draft.appliesTo} onChange={(e) => patch({ appliesTo: e.target.value as AppliesTo })}>
            <option value="all">Everyone</option>
            <option value="full">Full-day students only</option>
            <option value="shortened">Shortened-day students only</option>
          </select>
        </Field>
      </div>
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
