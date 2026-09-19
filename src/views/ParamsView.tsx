import { Field } from '../ui';
import { useStore } from '../state';

export function ParamsView() {
  const { data, dispatch } = useStore();
  const p = data.params;

  return (
    <section>
      <div className="page-head">
        <div>
          <h2>Scheduler parameters</h2>
          <p className="lede">
            Hard rules are never broken. Soft weights only pick among legal schedules. After you change anything here, run Auto-Schedule again.
          </p>
        </div>
      </div>
      <div className="grid grid-2">
        <div className="card">
          <h3>Hard limits</h3>
          <div className="form-grid">
            <Field label="Max students per aide per block" hint="Also limited by each aide’s own caseload.">
              <input
                type="number"
                min={1}
                max={12}
                value={p.maxStudentsPerAide}
                onChange={(e) =>
                  dispatch({ type: 'setParams', params: { ...p, maxStudentsPerAide: Math.max(1, Number(e.target.value) || 1) } })
                }
              />
            </Field>
            <Field label="Max group size">
              <input
                type="number"
                min={1}
                max={12}
                value={p.maxGroupSize}
                onChange={(e) => dispatch({ type: 'setParams', params: { ...p, maxGroupSize: Math.max(1, Number(e.target.value) || 1) } })}
              />
            </Field>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={p.traitConflictsAreHard}
                onChange={(e) => dispatch({ type: 'setParams', params: { ...p, traitConflictsAreHard: e.target.checked } })}
              />
              Treat trait-conflict rules as hard when they are marked hard
            </label>
            <p className="meta">
              Uncheck this to temporarily relax every trait rule to a preference (useful when Auto-Schedule says no valid schedule).
            </p>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={p.elopesRequiresOneToOne}
                onChange={(e) => dispatch({ type: 'setParams', params: { ...p, elopesRequiresOneToOne: e.target.checked } })}
              />
              Students tagged “elopes” must have 1:1
            </label>
          </div>
        </div>
        <div className="card">
          <h3>Soft scoring weights</h3>
          <p className="meta">Higher numbers matter more when several legal schedules exist. They never override a hard rule.</p>
          <div className="form-grid">
            <Weight
              label="Preferred aide–student matches"
              value={p.weights.preferredMatch}
              onChange={(preferredMatch) => dispatch({ type: 'setParams', params: { ...p, weights: { ...p.weights, preferredMatch } } })}
            />
            <Weight
              label="Balance caseloads"
              value={p.weights.caseloadBalance}
              onChange={(caseloadBalance) => dispatch({ type: 'setParams', params: { ...p, weights: { ...p.weights, caseloadBalance } } })}
            />
            <Weight
              label="Minimize aide transitions"
              value={p.weights.minimizeTransitions}
              onChange={(minimizeTransitions) =>
                dispatch({ type: 'setParams', params: { ...p, weights: { ...p.weights, minimizeTransitions } } })
              }
            />
            <Weight
              label="Trained-tag match"
              value={p.weights.trainedTagMatch}
              onChange={(trainedTagMatch) => dispatch({ type: 'setParams', params: { ...p, weights: { ...p.weights, trainedTagMatch } } })}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function Weight({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <Field label={`${label} (${value})`}>
      <input type="range" min={0} max={20} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </Field>
  );
}
