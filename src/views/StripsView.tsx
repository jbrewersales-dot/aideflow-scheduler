import { formatTimeRange, sortBlocks, studentAttendsBlock } from '../domain';
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

  return (
    <section>
      <div className="page-head">
        <div>
          <h2>Per-student day</h2>
          <p className="lede">Who is with whom, block by block. Shortened-day students stop at the midday bus.</p>
        </div>
      </div>
      {data.students
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((student) => {
          const theirs = blocks.filter((b) => studentAttendsBlock(student, b, data.blocks));
          return (
            <article className="student-strip card" key={student.id}>
              <h3>
                {student.name}{' '}
                <span className="meta">{student.dayType === 'full' ? 'Full day' : 'Shortened day'}</span>
              </h3>
              <div className="strip-track">
                {theirs.map((block) => {
                  const row = assignments.find((a) => a.studentId === student.id && a.blockId === block.id);
                  const aide = data.aides.find((a) => a.id === row?.aideId);
                  return (
                    <div className="strip-block" key={block.id}>
                      <div className="kicker">{formatTimeRange(block)}</div>
                      <strong>{block.name}</strong>
                      <div className="meta">{aide?.name ?? 'Unassigned'}</div>
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
