import { isTeacher, studentAttendsBlock, studentLocationId } from '../domain';
import type { Assignment, ScheduleBlock } from '../types';
import type { EvalContext } from './evaluate';

export function scoreAssignments(ctx: EvalContext, assignments: Assignment[]): { score: number; notes: string[] } {
  const w = ctx.params.weights;
  let preferred = 0;
  let trained = 0;
  let transitionsKept = 0;
  let transitionsTotal = 0;
  let teacherHeld = 0;

  const byStudent = new Map<string, Assignment[]>();
  for (const a of assignments) {
    const list = byStudent.get(a.studentId) ?? [];
    list.push(a);
    byStudent.set(a.studentId, list);
  }

  const orderedBlocks = [...ctx.blocks].sort((a, b) => a.startTime.localeCompare(b.startTime));

  for (const a of assignments) {
    const student = ctx.studentById.get(a.studentId);
    const aide = ctx.aideById.get(a.aideId);
    if (!student || !aide) continue;
    if (student.preferredAideIds.includes(aide.id) || aide.preferredStudentIds.includes(student.id)) {
      preferred += 1;
    }
    const tags = new Set([...student.needTags, ...student.traits]);
    for (const t of aide.trainedTags) {
      if (tags.has(t)) {
        trained += 1;
        break;
      }
    }
    // A student already in the teacher's room is cheapest to keep with the teacher,
    // which leaves aides free for students who leave the room.
    if (isTeacher(aide) && studentLocationId(student, a.blockId, ctx.locations) === aide.homeLocationId) {
      teacherHeld += 1;
    }
  }

  for (const student of ctx.students) {
    const rows = byStudent.get(student.id) ?? [];
    const aideByBlock = new Map(rows.map((r) => [r.blockId, r.aideId]));
    let prev: { block: ScheduleBlock; aideId: string } | null = null;
    for (const block of orderedBlocks) {
      if (!studentAttendsBlock(student, block, ctx.blocks)) continue;
      const aideId = aideByBlock.get(block.id);
      if (!aideId) {
        prev = null;
        continue;
      }
      if (prev) {
        transitionsTotal += 1;
        if (prev.aideId === aideId) transitionsKept += 1;
      }
      prev = { block, aideId };
    }
  }

  // Caseload balance: lower variance of (aide, block) group sizes is better
  const sizes: number[] = [];
  const keyCount = new Map<string, number>();
  for (const a of assignments) {
    const key = `${a.blockId}::${a.aideId}`;
    keyCount.set(key, (keyCount.get(key) ?? 0) + 1);
  }
  for (const n of keyCount.values()) sizes.push(n);
  const mean = sizes.length ? sizes.reduce((s, n) => s + n, 0) / sizes.length : 0;
  const variance = sizes.length ? sizes.reduce((s, n) => s + (n - mean) ** 2, 0) / sizes.length : 0;

  const score =
    preferred * w.preferredMatch +
    trained * w.trainedTagMatch +
    transitionsKept * w.minimizeTransitions +
    teacherHeld * w.keepWithTeacher -
    variance * w.caseloadBalance;

  const notes: string[] = [];
  notes.push(`Preferred adult–student matches: ${preferred}`);
  notes.push(`Trained-tag matches: ${trained}`);
  if (transitionsTotal > 0) {
    notes.push(`Same-adult transitions kept: ${transitionsKept}/${transitionsTotal}`);
  }
  notes.push(`Group size variance: ${variance.toFixed(2)}`);

  return { score, notes };
}
