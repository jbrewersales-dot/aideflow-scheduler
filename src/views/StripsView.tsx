import {
  formatClock,
  formatClockRange,
  locationName,
  planFor,
  sortBlocks,
  studentActivity,
  studentAttendsBlock,
  studentLocationId,
  studentNeedsCoverage,
  studentNeedsEscort,
} from '../domain';
import { Banner } from '../ui';
import { useStore } from '../state';

export function StripsView() {
  const { data } = useStore();
  const blocks = sortBlocks(data.blocks);
  const assignments = data.schedule?.assignments ?? [];

  if (!data.schedule) {
    return (
      <Banner kind="warn" title="No schedule yet">
        Run Auto-Schedule to see each student’s day.
      </Banner>
    );
  }

  const defaultRoom = data.locations[0]?.id ?? '';

  return (
    <section>
      <div className="page-head">
        <div>
          <h2>Each student’s day</h2>
          <p className="lede">
            One row per child: what they are doing, where, and which adult is with them. Students who leave the room
            are marked so you can see at a glance which adult goes with them.
          </p>
        </div>
      </div>
      {data.students
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((student) => {
          const theirs = blocks.filter((b) => studentAttendsBlock(student, b, data.blocks));
          const first = theirs[0];
          const last = theirs[theirs.length - 1];
          return (
            <article className="student-strip card" key={student.id}>
              <h3>
                {student.name}{' '}
                <span className="meta">
                  {first && last ? `${formatClock(first.startTime)} – ${formatClock(last.endTime)}` : 'Not in today'}
                  {student.busPickup ? ` · bus ${formatClock(student.busPickup)}` : ''}
                  {student.requiresOneToOne ? ' · 1:1' : ''}
                </span>
              </h3>
              <div className="strip-track">
                {theirs.map((block) => {
                  const row = assignments.find((a) => a.studentId === student.id && a.blockId === block.id);
                  const aide = data.aides.find((a) => a.id === row?.aideId);
                  const roomId = studentLocationId(student, block.id, data.locations);
                  const away = roomId !== defaultRoom;
                  const escort = studentNeedsEscort(student, block.id);
                  const needs = studentNeedsCoverage(student, block, data.blocks);
                  const note = planFor(student, block.id)?.note;
                  return (
                    <div className={`strip-block${away ? ' away' : ''}`} key={block.id}>
                      <div className="kicker">{formatClockRange(block)}</div>
                      <strong>{studentActivity(student, block)}</strong>
                      {away ? <div className="meta">{locationName(data.locations, roomId)}</div> : null}
                      <div className="meta">
                        {aide ? `with ${aide.name}` : needs ? 'Unassigned' : 'no adult needed'}
                        {escort && aide ? ' (goes with them)' : ''}
                      </div>
                      {note ? <div className="meta strip-note">{note}</div> : null}
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
    </section>
  );
}
