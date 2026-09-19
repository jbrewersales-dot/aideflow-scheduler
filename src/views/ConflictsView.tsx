import { nameById, sortBlocks } from '../domain';
import { Banner } from '../ui';
import { useStore } from '../state';

export function ConflictsView() {
  const { data, hard, lastResult, scheduleLegal, setView } = useStore();
  const reasons = lastResult && !lastResult.ok ? lastResult.reasons : hard;
  const blocks = sortBlocks(data.blocks);

  return (
    <section>
      <div className="page-head">
        <div>
          <h2>Conflicts &amp; impossibility report</h2>
          <p className="lede">
            AideFlow will not invent a schedule that breaks a hard rule. If Auto-Schedule cannot finish, the reasons are listed here.
          </p>
        </div>
      </div>

      {lastResult && !lastResult.ok ? (
        <Banner kind="bad" title="No valid schedule">
          <p>
            Every legal combination was checked. None covered every required student without breaking a hard rule. Nothing was saved.
          </p>
        </Banner>
      ) : scheduleLegal ? (
        <Banner kind="ok" title="Current schedule has no hard conflicts">
          Soft notes may still appear below. They are preferences, not blockers.
        </Banner>
      ) : data.schedule ? (
        <Banner kind="bad" title="Manual changes broke a hard rule">
          Print and schedule export stay locked until you fix the red items or run Auto-Schedule again.
        </Banner>
      ) : (
        <Banner kind="warn" title="No schedule yet">
          Run Auto-Schedule from the top of the page. If it cannot finish, the report will land here.
        </Banner>
      )}

      {reasons.length === 0 ? <p className="muted">No conflicts to show.</p> : null}
      <div className="card">
        {reasons.map((c, i) => (
          <div className="conflict-item" key={`${c.kind}-${i}-${c.message}`}>
            <div className="kicker">
              {c.severity} · {c.kind}
              {c.blockId ? ` · ${nameById(blocks, c.blockId)}` : ''}
            </div>
            <p style={{ margin: '4px 0 0' }}>{c.message}</p>
          </div>
        ))}
      </div>

      <div className="row-actions" style={{ marginTop: 16 }}>
        <button type="button" className="btn" onClick={() => setView('params')}>
          Relax parameters
        </button>
        <button type="button" className="btn" onClick={() => setView('rules')}>
          Edit keep-apart / traits
        </button>
        <button type="button" className="btn" onClick={() => setView('aides')}>
          Add or free an aide
        </button>
      </div>
    </section>
  );
}
