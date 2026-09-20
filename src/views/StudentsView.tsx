import { useMemo, useState } from 'react';
import { BUILT_IN_TRAITS } from '../types';
import { ChipSelect, Field, Modal, TagEditor } from '../ui';
import { blankStudent, useStore } from '../state';
import { formatClockRange, planFor, sortBlocks, studentAttendsBlock, studentNeedsCoverage } from '../domain';
import { blankPlanRow } from '../data/demo';
import type { Student, StudentBlockPlan } from '../types';

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
          <p className="lede">
            Start here. Build each child’s day — when they arrive, what class they are in, which room, and whether an
            adult has to be with them. The day grid is built from these rows.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing(blankStudent())}>
          Add student
        </button>
      </div>
      <input
        type="text"
        placeholder="Search students"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ maxWidth: 360, marginBottom: 12 }}
      />
      <div className="card">
        {filtered.length === 0 ? <p className="muted">No students yet. Add one or upload a CSV on the Data tab.</p> : null}
        {filtered.map((s) => {
          const blocks = sortBlocks(data.blocks);
          const here = blocks.filter((b) => studentAttendsBlock(s, b, data.blocks));
          const away = s.plan.filter((p) => p.locationId && p.locationId !== '').length;
          return (
            <div className="list-row" key={s.id}>
              <div>
                <strong>{s.name}</strong>
                <div className="meta">
                  {s.arrivalTime ? `Arrives ${s.arrivalTime}` : s.dayType === 'full' ? 'Full day' : 'Shortened day'}
                  {s.departureTime ? ` · leaves ${s.departureTime}` : ''}
                  {s.requiresOneToOne ? ' · 1:1' : ''}
                  {` · ${here.length} block${here.length === 1 ? '' : 's'}`}
                  {away > 0 ? ` · ${away} out of the room` : ''}
                </div>
                {s.traits.length ? <div className="meta">{s.traits.join(', ')}</div> : null}
                {s.needsNotes ? <div className="meta">{s.needsNotes}</div> : null}
              </div>
              <div className="row-actions">
                <button type="button" className="btn btn-small" onClick={() => setEditing(s)}>
                  Edit day
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
          );
        })}
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
  const [draft, setDraft] = useState(student);
  const [tab, setTab] = useState<'about' | 'day'>('about');
  const patch = (partial: Partial<Student>) => setDraft((d) => ({ ...d, ...partial }));

  return (
    <Modal title={student.name ? `${student.name}’s day` : 'New student'} onClose={onClose} wide={tab === 'day'}>
      <div className="subnav">
        <button type="button" className={tab === 'about' ? 'active' : undefined} onClick={() => setTab('about')}>
          About this student
        </button>
        <button type="button" className={tab === 'day' ? 'active' : undefined} onClick={() => setTab('day')}>
          Their day, block by block
        </button>
      </div>

      {tab === 'about' ? (
        <AboutTab draft={draft} patch={patch} />
      ) : (
        <DayTab draft={draft} patch={patch} />
      )}

      <div className="row-actions" style={{ marginTop: 16 }}>
        <button type="button" className="btn btn-primary" onClick={() => onSave(draft)}>
          Save student
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
      </div>
      {!draft.name.trim() ? <p className="meta">Give the student a name before saving.</p> : null}
    </Modal>
  );
}

function AboutTab({ draft, patch }: { draft: Student; patch: (p: Partial<Student>) => void }) {
  const { data } = useStore();
  return (
    <>
      <div className="form-grid two">
        <Field label="Name">
          <input type="text" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
        </Field>
        <Field label="Day type" hint="A starting pattern. Arrival and departure times below win.">
          <select
            value={draft.dayType}
            onChange={(e) => patch({ dayType: e.target.value === 'shortened' ? 'shortened' : 'full' })}
          >
            <option value="full">Full day</option>
            <option value="shortened">Shortened day</option>
          </select>
        </Field>
        <Field label="Arrives at school" hint="Leave blank for a normal morning arrival.">
          <input
            type="time"
            value={draft.arrivalTime ?? ''}
            onChange={(e) => patch({ arrivalTime: e.target.value || undefined })}
          />
        </Field>
        <Field label="Leaves school" hint="Set this for a shortened day, e.g. 12:15.">
          <input
            type="time"
            value={draft.departureTime ?? ''}
            onChange={(e) => patch({ departureTime: e.target.value || undefined })}
          />
        </Field>
        <Field label="Bus pickup (home)">
          <input
            type="time"
            value={draft.busPickup ?? ''}
            onChange={(e) => patch({ busPickup: e.target.value || undefined })}
          />
        </Field>
        <Field label="Bus drop-off (home)">
          <input
            type="time"
            value={draft.busDropoff ?? ''}
            onChange={(e) => patch({ busDropoff: e.target.value || undefined })}
          />
        </Field>
        <Field label="Adult coverage" hint="You can override this for single blocks on the day tab.">
          <select
            value={draft.coverageMode}
            onChange={(e) =>
              patch({
                coverageMode: e.target.value === 'listed' || e.target.value === 'none' ? e.target.value : 'always',
              })
            }
          >
            <option value="always">Needs an adult every block they attend</option>
            <option value="listed">Only the blocks checked below</option>
            <option value="none">No required adult (grouping is optional)</option>
          </select>
        </Field>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.requiresOneToOne}
            onChange={(e) => patch({ requiresOneToOne: e.target.checked })}
          />
          Needs 1:1 (cannot share an adult with anyone)
        </label>
      </div>
      <div className="form-grid" style={{ marginTop: 12 }}>
        <Field label="Traits" hint="These drive the keep-apart and trait rules.">
          <ChipSelect options={[...BUILT_IN_TRAITS]} value={draft.traits} onToggle={(traits) => patch({ traits })} danger />
          <TagEditor values={draft.traits} onChange={(traits) => patch({ traits })} placeholder="Add a custom trait and press Enter" />
        </Field>
        <Field label="Needs / support tags">
          <TagEditor
            values={draft.needTags}
            onChange={(needTags) => patch({ needTags })}
            placeholder="e.g. AAC, behavior plan — press Enter"
          />
        </Field>
        <Field label="Notes">
          <textarea value={draft.needsNotes} onChange={(e) => patch({ needsNotes: e.target.value })} />
        </Field>
        <Field label="Preferred adults">
          <ChipSelect
            options={data.aides.map((a) => a.name)}
            value={data.aides.filter((a) => draft.preferredAideIds.includes(a.id)).map((a) => a.name)}
            onToggle={(names) =>
              patch({ preferredAideIds: data.aides.filter((a) => names.includes(a.name)).map((a) => a.id) })
            }
          />
        </Field>
        {draft.coverageMode === 'listed' ? (
          <Field label="Blocks that require an adult">
            <ChipSelect
              options={data.blocks.map((b) => b.name)}
              value={data.blocks.filter((b) => draft.coverageBlockIds.includes(b.id)).map((b) => b.name)}
              onToggle={(names) =>
                patch({ coverageBlockIds: data.blocks.filter((b) => names.includes(b.name)).map((b) => b.id) })
              }
            />
          </Field>
        ) : null}
      </div>
    </>
  );
}

function DayTab({ draft, patch }: { draft: Student; patch: (p: Partial<Student>) => void }) {
  const { data } = useStore();
  const blocks = sortBlocks(data.blocks);

  const setRow = (blockId: string, partial: Partial<StudentBlockPlan>): void => {
    const existing = planFor(draft, blockId);
    const row: StudentBlockPlan = { ...(existing ?? blankPlanRow(blockId)), ...partial };
    const rest = draft.plan.filter((p) => p.blockId !== blockId);
    // Drop rows that say nothing, so the plan stays readable.
    const isEmpty =
      row.attends === null &&
      !row.activity.trim() &&
      !row.locationId &&
      row.needsAide === null &&
      !row.aideAccompanies &&
      !row.note.trim();
    patch({ plan: isEmpty ? rest : [...rest, row] });
  };

  return (
    <div>
      <p className="meta" style={{ marginBottom: 12 }}>
        Every row is one part of this child’s day. Blank fields follow the defaults from the other tab, so you only fill
        in what is special. “Adult goes with them” means that adult leaves the classroom and cannot cover anyone else.
      </p>
      <div className="schedule-wrap">
        <table className="schedule-table plan-table">
          <thead>
            <tr>
              <th className="sticky">Time</th>
              <th>Here?</th>
              <th>What they are doing</th>
              <th>Where</th>
              <th>Needs an adult?</th>
              <th>Adult goes with them</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((block) => {
              const row = planFor(draft, block.id);
              const here = studentAttendsBlock(draft, block, data.blocks);
              const needs = studentNeedsCoverage(draft, block, data.blocks);
              return (
                <tr key={block.id} className={here ? undefined : 'row-off'}>
                  <td className="sticky">
                    <strong>{block.name}</strong>
                    <span className="time-cell">{formatClockRange(block)}</span>
                  </td>
                  <td>
                    <select
                      value={row?.attends === null || row?.attends === undefined ? 'auto' : row.attends ? 'yes' : 'no'}
                      onChange={(e) =>
                        setRow(block.id, {
                          attends: e.target.value === 'auto' ? null : e.target.value === 'yes',
                        })
                      }
                    >
                      <option value="auto">{here ? 'Auto — here' : 'Auto — not here'}</option>
                      <option value="yes">Here</option>
                      <option value="no">Not here</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="text"
                      placeholder={block.name}
                      value={row?.activity ?? ''}
                      onChange={(e) => setRow(block.id, { activity: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      value={row?.locationId ?? ''}
                      onChange={(e) => setRow(block.id, { locationId: e.target.value })}
                    >
                      <option value="">Classroom (default)</option>
                      {data.locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={row?.needsAide === null || row?.needsAide === undefined ? 'auto' : row.needsAide ? 'yes' : 'no'}
                      onChange={(e) =>
                        setRow(block.id, {
                          needsAide: e.target.value === 'auto' ? null : e.target.value === 'yes',
                        })
                      }
                    >
                      <option value="auto">{needs ? 'Auto — yes' : 'Auto — no'}</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </td>
                  <td>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={row?.aideAccompanies ?? false}
                        onChange={(e) => setRow(block.id, { aideAccompanies: e.target.checked })}
                        aria-label={`Adult goes with them during ${block.name}`}
                      />
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
