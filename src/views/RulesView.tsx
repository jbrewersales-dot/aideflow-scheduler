import { useState } from 'react';
import { createId } from '../ids';
import { BUILT_IN_TRAITS, type ConflictSeverity, type TraitConflictRule, type TraitConflictScope } from '../types';
import { Field } from '../ui';
import { useStore } from '../state';

export function RulesView() {
  const { data, dispatch } = useStore();
  const [a, setA] = useState(data.students[0]?.id ?? '');
  const [b, setB] = useState(data.students[1]?.id ?? '');
  const [reason, setReason] = useState('');
  const [traitA, setTraitA] = useState('aggressive');
  const [traitB, setTraitB] = useState('aggressive');
  const [scope, setScope] = useState<TraitConflictScope>('aide');
  const [severity, setSeverity] = useState<ConflictSeverity>('hard');
  const [note, setNote] = useState('');

  const traitOptions = Array.from(
    new Set([...BUILT_IN_TRAITS, ...data.students.flatMap((s) => s.traits), traitA, traitB]),
  ).filter(Boolean);

  return (
    <section className="grid grid-2">
      <div className="card">
        <h2>Keep-apart pairs</h2>
        <p className="lede">These two students must never share an aide (or group) during the same block.</p>
        {data.keepApart.map((pair) => {
          const sa = data.students.find((s) => s.id === pair.studentAId)?.name ?? 'Unknown';
          const sb = data.students.find((s) => s.id === pair.studentBId)?.name ?? 'Unknown';
          return (
            <div className="list-row" key={pair.id}>
              <div>
                <strong>
                  {sa} + {sb}
                </strong>
                {pair.reason ? <div className="meta">{pair.reason}</div> : null}
              </div>
              <button type="button" className="btn btn-small btn-danger" onClick={() => dispatch({ type: 'deleteKeepApart', id: pair.id })}>
                Remove
              </button>
            </div>
          );
        })}
        <div className="form-grid" style={{ marginTop: 12 }}>
          <Field label="Student A">
            <select value={a} onChange={(e) => setA(e.target.value)}>
              <option value="">Select…</option>
              {data.students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Student B">
            <select value={b} onChange={(e) => setB(e.target.value)}>
              <option value="">Select…</option>
              {data.students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Why (optional)">
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              if (!a || !b || a === b) return;
              dispatch({
                type: 'upsertKeepApart',
                pair: { id: createId('ka'), studentAId: a, studentBId: b, reason },
              });
              setReason('');
            }}
          >
            Add keep-apart pair
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Trait conflict rules</h2>
        <p className="lede">These apply to every student who has the tags — you do not have to list each pair.</p>
        {data.traitConflicts.map((rule) => (
          <div className="list-row" key={rule.id}>
            <div>
              <strong>
                {rule.traitA} × {rule.traitB}
              </strong>
              <div className="meta">
                {rule.severity} · cannot share {rule.scope === 'aide' ? 'an aide' : 'a group'}
              </div>
              {rule.note ? <div className="meta">{rule.note}</div> : null}
            </div>
            <button type="button" className="btn btn-small btn-danger" onClick={() => dispatch({ type: 'deleteTraitRule', id: rule.id })}>
              Remove
            </button>
          </div>
        ))}
        <div className="form-grid two" style={{ marginTop: 12 }}>
          <Field label="Trait A">
            <TraitCombo options={traitOptions} value={traitA} onChange={setTraitA} />
          </Field>
          <Field label="Trait B">
            <TraitCombo options={traitOptions} value={traitB} onChange={setTraitB} />
          </Field>
          <Field label="Severity">
            <select value={severity} onChange={(e) => setSeverity(e.target.value === 'soft' ? 'soft' : 'hard')}>
              <option value="hard">Hard — schedule is invalid if this happens</option>
              <option value="soft">Soft — allowed, but AideFlow tries to avoid it</option>
            </select>
          </Field>
          <Field label="Scope">
            <select value={scope} onChange={(e) => setScope(e.target.value === 'group' ? 'group' : 'aide')}>
              <option value="aide">Cannot share an aide</option>
              <option value="group">Cannot share a group</option>
            </select>
          </Field>
        </div>
        <Field label="Note">
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <button
          type="button"
          className="btn btn-primary"
          style={{ marginTop: 12 }}
          onClick={() => {
            if (!traitA.trim() || !traitB.trim()) return;
            const rule: TraitConflictRule = {
              id: createId('tc'),
              traitA: traitA.trim(),
              traitB: traitB.trim(),
              scope,
              severity,
              note,
            };
            dispatch({ type: 'upsertTraitRule', rule });
            setNote('');
          }}
        >
          Add trait rule
        </button>
      </div>
    </section>
  );
}

function TraitCombo({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <>
      <select value={options.includes(value) ? value : ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">Custom…</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="or type a trait" style={{ marginTop: 8 }} />
    </>
  );
}
