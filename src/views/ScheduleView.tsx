import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useMemo, useState } from 'react';
import { formatTimeRange, sortBlocks, studentAttendsBlock, studentNeedsCoverage, studentRequiresOneToOne } from '../domain';
import type { Assignment } from '../types';
import { Banner } from '../ui';
import { useStore } from '../state';

export function ScheduleView() {
  const { data, dispatch, hard, scheduleLegal, conflicts, setView } = useStore();
  const blocks = useMemo(() => sortBlocks(data.blocks), [data.blocks]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [pick, setPick] = useState<{ studentId: string; blockId: string } | null>(null);

  const conflictKeys = useMemo(() => {
    const set = new Set<string>();
    for (const c of hard) {
      for (const sid of c.studentIds) {
        set.add(`${c.blockId ?? ''}::${sid}`);
      }
    }
    return set;
  }, [hard]);

  const assigned = data.schedule?.assignments ?? [];

  const onDragEnd = (event: DragEndEvent) => {
    const over = event.over?.id;
    const active = String(event.active.id);
    if (!over) return;
    const [blockId, studentId] = active.split('::');
    const [toBlock, aideId] = String(over).split('::');
    if (!blockId || !studentId || toBlock !== blockId || !aideId) return;
    dispatch({ type: 'reassign', assignment: { studentId, aideId, blockId } });
  };

  if (!data.schedule) {
    return (
      <section>
        <Banner kind="warn" title="No schedule yet">
          <p>
            The sample classroom is loaded. Press <strong>Auto-Schedule</strong> at the top. AideFlow only keeps a result when every hard rule is satisfied.
          </p>
        </Banner>
      </section>
    );
  }

  return (
    <section>
      {scheduleLegal ? (
        <Banner kind="ok" title="Valid schedule">
          <span className="score">Score {data.schedule.score.toFixed(1)}</span>
          {data.schedule.notes.length ? ` · ${data.schedule.notes.join(' · ')}` : null}
          <div className="row-actions" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-small" onClick={() => setView('print')}>
              Print / PDF
            </button>
            <button type="button" className="btn btn-small" onClick={() => setView('strips')}>
              Student day strips
            </button>
          </div>
        </Banner>
      ) : (
        <Banner kind="bad" title="Hard conflicts — this schedule cannot be printed or exported">
          Drag a student to another aide, or run Auto-Schedule again. {hard.length} hard issue{hard.length === 1 ? '' : 's'}.
        </Banner>
      )}

      <p className="lede no-print">
        Drag a name onto another aide in the same row. On a tablet, tap a name and choose an aide. Red chips break a hard rule.
      </p>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="schedule-wrap">
          <table className="schedule-table">
            <thead>
              <tr>
                <th className="sticky">Time</th>
                {data.aides.map((a) => (
                  <th key={a.id}>{a.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {blocks.map((block) => {
                const present = data.students.filter((s) => studentAttendsBlock(s, block, data.blocks));
                const rows = assigned.filter((a) => a.blockId === block.id);
                const byAide = new Map<string, Assignment[]>();
                for (const a of data.aides) byAide.set(a.id, []);
                for (const row of rows) {
                  const list = byAide.get(row.aideId) ?? [];
                  list.push(row);
                  byAide.set(row.aideId, list);
                }
                const assignedIds = new Set(rows.map((r) => r.studentId));
                const missing = present.filter(
                  (s) => studentNeedsCoverage(s, block, data.blocks) && !assignedIds.has(s.id),
                );
                return (
                  <tr key={block.id}>
                    <td className="sticky">
                      <strong>{block.name}</strong>
                      <span className="time-cell">{formatTimeRange(block)}</span>
                      {missing.length > 0 ? (
                        <div className="unassigned">Needs coverage: {missing.map((s) => s.name).join(', ')}</div>
                      ) : null}
                    </td>
                    {data.aides.map((aide) => (
                      <AideCell
                        key={aide.id}
                        blockId={block.id}
                        aideId={aide.id}
                        assignments={byAide.get(aide.id) ?? []}
                        conflictKeys={conflictKeys}
                        onPick={(studentId) => setPick({ studentId, blockId: block.id })}
                        oneToOneIds={new Set(
                          data.students.filter((s) => studentRequiresOneToOne(s, data.params.elopesRequiresOneToOne)).map((s) => s.id),
                        )}
                      />
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </DndContext>

      {conflicts.some((c) => c.severity === 'soft') ? (
        <p className="meta" style={{ marginTop: 12 }}>
          Soft notes: {conflicts.filter((c) => c.severity === 'soft').length} preference(s) not fully met — see Conflicts.
        </p>
      ) : null}

      {pick ? (
        <div className="modal-back" onClick={() => setPick(null)} role="presentation">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Move {data.students.find((s) => s.id === pick.studentId)?.name}</h3>
            <p className="meta">Choose an aide for this block.</p>
            <div className="row-actions">
              {data.aides.map((a) => (
                <button
                  type="button"
                  key={a.id}
                  className="btn"
                  onClick={() => {
                    dispatch({
                      type: 'reassign',
                      assignment: { studentId: pick.studentId, aideId: a.id, blockId: pick.blockId },
                    });
                    setPick(null);
                  }}
                >
                  {a.name}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => setPick(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function AideCell({
  blockId,
  aideId,
  assignments,
  conflictKeys,
  onPick,
  oneToOneIds,
}: {
  blockId: string;
  aideId: string;
  assignments: Assignment[];
  conflictKeys: Set<string>;
  onPick: (studentId: string) => void;
  oneToOneIds: Set<string>;
}) {
  const { data } = useStore();
  const { setNodeRef, isOver } = useDroppable({ id: `${blockId}::${aideId}` });
  return (
    <td ref={setNodeRef} className={`drop-cell${isOver ? ' over' : ''}`}>
      {assignments.map((a) => {
        const student = data.students.find((s) => s.id === a.studentId);
        if (!student) return null;
        return (
          <StudentChip
            key={a.studentId}
            blockId={blockId}
            studentId={a.studentId}
            name={student.name}
            conflict={conflictKeys.has(`${blockId}::${a.studentId}`)}
            oneToOne={oneToOneIds.has(a.studentId)}
            onPick={() => onPick(a.studentId)}
          />
        );
      })}
    </td>
  );
}

function StudentChip({
  blockId,
  studentId,
  name,
  conflict,
  oneToOne,
  onPick,
}: {
  blockId: string;
  studentId: string;
  name: string;
  conflict: boolean;
  oneToOne: boolean;
  onPick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${blockId}::${studentId}`,
  });
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.55 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`student-chip${conflict ? ' conflict' : ''}${oneToOne ? ' one2one' : ''}`}
      {...listeners}
      {...attributes}
    >
      <span>{name}</span>
      <button type="button" className="btn btn-ghost btn-small" onClick={onPick} aria-label={`Move ${name}`}>
        Move
      </button>
    </div>
  );
}
