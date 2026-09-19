import {
  aideAvailableForBlock,
  blocksOverlap,
  sortBlocks,
  studentAttendsBlock,
  studentNeedsCoverage,
  studentRequiresOneToOne,
} from '../domain';
import type { Aide, AppData, Assignment, Conflict, ScheduleBlock, SolveResult, Student } from '../types';
import { effectiveCap, evaluateAssignments, hardConflicts, makeContext, wouldViolateHard, type EvalContext } from './evaluate';
import { scoreAssignments } from './score';

const NODE_BUDGET = 250_000;

interface BlockSolve {
  assignments: Assignment[];
  score: number;
  nodes: number;
}

function availableAides(ctx: EvalContext, block: ScheduleBlock, busyAideIds: Set<string>): Aide[] {
  return ctx.aides.filter((a) => aideAvailableForBlock(a, block.id) && !busyAideIds.has(a.id));
}

function presentStudents(ctx: EvalContext, block: ScheduleBlock): Student[] {
  return ctx.students.filter((s) => studentAttendsBlock(s, block, ctx.blocks));
}

function requiredStudents(ctx: EvalContext, block: ScheduleBlock): Student[] {
  return ctx.students.filter((s) => studentNeedsCoverage(s, block, ctx.blocks));
}

function sortStudentsForSearch(ctx: EvalContext, students: Student[]): Student[] {
  return [...students].sort((a, b) => {
    const a1 = studentRequiresOneToOne(a, ctx.params.elopesRequiresOneToOne) ? 0 : 1;
    const b1 = studentRequiresOneToOne(b, ctx.params.elopesRequiresOneToOne) ? 0 : 1;
    if (a1 !== b1) return a1 - b1;
    const aLinks = ctx.keepApart.filter((p) => p.studentAId === a.id || p.studentBId === a.id).length;
    const bLinks = ctx.keepApart.filter((p) => p.studentAId === b.id || p.studentBId === b.id).length;
    if (aLinks !== bLinks) return bLinks - aLinks;
    return a.name.localeCompare(b.name);
  });
}

function preflightBlock(ctx: EvalContext, block: ScheduleBlock, busyAideIds: Set<string>): Conflict[] {
  const reasons: Conflict[] = [];
  const needed = requiredStudents(ctx, block);
  const aides = availableAides(ctx, block, busyAideIds);

  if (needed.length === 0) return reasons;

  if (aides.length === 0) {
    reasons.push({
      kind: 'aide-unavailable',
      severity: 'hard',
      blockId: block.id,
      studentIds: needed.map((s) => s.id),
      message: `No aides are available during ${block.name}, but ${needed.length} student(s) need coverage.`,
    });
    return reasons;
  }

  const oneToOne = needed.filter((s) => studentRequiresOneToOne(s, ctx.params.elopesRequiresOneToOne));
  if (oneToOne.length > aides.length) {
    reasons.push({
      kind: 'one-to-one-shared',
      severity: 'hard',
      blockId: block.id,
      studentIds: oneToOne.map((s) => s.id),
      message: `${block.name} has ${oneToOne.length} students who require 1:1 but only ${aides.length} available aide(s).`,
    });
  }

  const capacity = aides.reduce((sum, a) => sum + effectiveCap(a, ctx.params), 0);
  if (needed.length > capacity) {
    reasons.push({
      kind: 'over-caseload',
      severity: 'hard',
      blockId: block.id,
      studentIds: needed.map((s) => s.id),
      message: `${block.name} needs coverage for ${needed.length} students but aides only have ${capacity} total seats (max per aide / group size).`,
    });
  }

  const remainingSeats = capacity - oneToOne.length;
  const remainingStudents = needed.length - oneToOne.length;
  if (remainingStudents > remainingSeats && oneToOne.length <= aides.length) {
    reasons.push({
      kind: 'over-caseload',
      severity: 'hard',
      blockId: block.id,
      studentIds: needed.filter((s) => !oneToOne.includes(s)).map((s) => s.id),
      message: `After placing ${oneToOne.length} 1:1 student(s) in ${block.name}, only ${remainingSeats} seat(s) remain for ${remainingStudents} other student(s).`,
    });
  }

  return reasons;
}

function explainUnplaceable(
  ctx: EvalContext,
  block: ScheduleBlock,
  students: Student[],
  aides: Aide[],
): Conflict[] {
  const reasons: Conflict[] = [];
  const pre = preflightBlock(ctx, block, new Set(ctx.aides.filter((a) => !aides.some((x) => x.id === a.id)).map((a) => a.id)));
  reasons.push(...pre);

  // For each pair of keep-apart students, check they have at least two distinct legal aides
  for (const pair of ctx.keepApart) {
    const a = students.find((s) => s.id === pair.studentAId);
    const b = students.find((s) => s.id === pair.studentBId);
    if (!a || !b) continue;
    reasons.push({
      kind: 'keep-apart',
      severity: 'hard',
      blockId: block.id,
      studentIds: [a.id, b.id],
      ruleId: pair.id,
      message: `${a.name} and ${b.name} must stay apart during ${block.name}${pair.reason ? ` — ${pair.reason}` : ''}. If they cannot be placed on different aides, no valid schedule exists.`,
    });
  }

  if (reasons.length === 0) {
    reasons.push({
      kind: 'over-caseload',
      severity: 'hard',
      blockId: block.id,
      studentIds: students.map((s) => s.id),
      message: `Explored every legal assignment for ${block.name} and none satisfied all hard rules (keep-apart, trait conflicts, 1:1, caseload, and aide availability).`,
    });
  }

  return reasons;
}

function solveBlock(
  ctx: EvalContext,
  block: ScheduleBlock,
  busyAideIds: Set<string>,
  previousAideByStudent: Map<string, string>,
): BlockSolve | { fail: true; reasons: Conflict[]; nodes: number } {
  const required = requiredStudents(ctx, block);
  const optional = presentStudents(ctx, block).filter((s) => !required.some((r) => r.id === s.id));
  const aides = availableAides(ctx, block, busyAideIds);

  const structural = preflightBlock(ctx, block, busyAideIds);
  if (structural.length > 0) {
    return { fail: true, reasons: structural, nodes: 0 };
  }

  const mustPlace = sortStudentsForSearch(ctx, required);
  let nodes = 0;
  let best: Map<string, string> | null = null;
  let bestScore = -Infinity;

  const tryAssign = (queue: Student[], assigned: Map<string, string>, placingOptional: boolean): void => {
    if (nodes > NODE_BUDGET) return;
    if (queue.length === 0) {
      const score = scorePartial(ctx, block, assigned, previousAideByStudent);
      if (!best || score > bestScore) {
        best = new Map(assigned);
        bestScore = score;
      }
      return;
    }

    const student = queue[0];
    const rest = queue.slice(1);
    const orderedAides = [...aides].sort((a, b) => {
      const prev = previousAideByStudent.get(student.id);
      const ap = a.id === prev || student.preferredAideIds.includes(a.id) || a.preferredStudentIds.includes(student.id) ? 0 : 1;
      const bp = b.id === prev || student.preferredAideIds.includes(b.id) || b.preferredStudentIds.includes(student.id) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return a.name.localeCompare(b.name);
    });

    let placed = false;
    for (const aide of orderedAides) {
      nodes += 1;
      if (nodes > NODE_BUDGET) break;
      if (wouldViolateHard(ctx, block, student, aide, assigned)) continue;
      assigned.set(student.id, aide.id);
      tryAssign(rest, assigned, placingOptional);
      assigned.delete(student.id);
      placed = true;
    }

    if (placingOptional && !placed) {
      // Optional students may remain unassigned.
      tryAssign(rest, assigned, true);
    }
  };

  tryAssign(mustPlace, new Map<string, string>(), false);

  const requiredBest = best;
  if (!requiredBest) {
    return {
      fail: true,
      reasons: explainUnplaceable(ctx, block, mustPlace, aides),
      nodes,
    };
  }

  let chosen: Map<string, string> = new Map(requiredBest);

  // Best-effort optional students
  if (optional.length > 0 && nodes < NODE_BUDGET) {
    const start = new Map<string, string>(requiredBest);
    const withOptional = new Map<string, string>(requiredBest);
    let optScore = bestScore;
    const fill = (queue: Student[], assigned: Map<string, string>): void => {
      if (nodes > NODE_BUDGET) return;
      if (queue.length === 0) {
        const score = scorePartial(ctx, block, assigned, previousAideByStudent);
        if (score > optScore) {
          optScore = score;
          withOptional.clear();
          for (const [k, v] of assigned) withOptional.set(k, v);
        }
        return;
      }
      const student = queue[0];
      const rest = queue.slice(1);
      let any = false;
      for (const aide of aides) {
        nodes += 1;
        if (wouldViolateHard(ctx, block, student, aide, assigned)) continue;
        assigned.set(student.id, aide.id);
        fill(rest, assigned);
        assigned.delete(student.id);
        any = true;
      }
      if (!any) fill(rest, assigned);
    };
    fill(sortStudentsForSearch(ctx, optional), start);
    chosen = withOptional;
    bestScore = optScore;
  }

  const assignments: Assignment[] = [...chosen].map(([studentId, aideId]) => ({
    studentId,
    aideId,
    blockId: block.id,
  }));

  return { assignments, score: bestScore, nodes };
}

function scorePartial(
  ctx: EvalContext,
  block: ScheduleBlock,
  assigned: Map<string, string>,
  previousAideByStudent: Map<string, string>,
): number {
  const fake: Assignment[] = [...assigned].map(([studentId, aideId]) => ({
    studentId,
    aideId,
    blockId: block.id,
  }));
  const { score } = scoreAssignments(ctx, fake);
  let extra = 0;
  for (const [sid, aid] of assigned) {
    if (previousAideByStudent.get(sid) === aid) extra += ctx.params.weights.minimizeTransitions;
  }
  return score + extra;
}

/**
 * Search for a complete assignment that violates zero hard constraints.
 * If none exists, return reasons — never a partial or illegal schedule.
 */
export function solveSchedule(data: AppData): SolveResult {
  const ctx = makeContext(data);
  let searchedNodes = 0;

  if (ctx.aides.length === 0) {
    return {
      ok: false,
      searchedNodes: 0,
      reasons: [
        {
          kind: 'aide-unavailable',
          severity: 'hard',
          studentIds: ctx.students.map((s) => s.id),
          message: 'There are no aides to assign. Add at least one aide and try again.',
        },
      ],
    };
  }

  if (ctx.blocks.length === 0) {
    return {
      ok: false,
      searchedNodes: 0,
      reasons: [
        {
          kind: 'missing-coverage',
          severity: 'hard',
          studentIds: [],
          message: 'There are no schedule blocks. Add a school-day timeline first.',
        },
      ],
    };
  }

  const blocks = sortBlocks(ctx.blocks);
  const allAssignments: Assignment[] = [];
  const previousAideByStudent = new Map<string, string>();
  const usedAideBlocks: { aideId: string; block: ScheduleBlock }[] = [];

  for (const block of blocks) {
    const busy = new Set<string>();
    for (const used of usedAideBlocks) {
      if (blocksOverlap(used.block, block)) busy.add(used.aideId);
    }

    const result = solveBlock(ctx, block, busy, previousAideByStudent);
    searchedNodes += 'nodes' in result ? result.nodes : 0;

    if ('fail' in result && result.fail) {
      return { ok: false, reasons: result.reasons, searchedNodes };
    }

    const solved = result as BlockSolve;
    allAssignments.push(...solved.assignments);
    previousAideByStudent.clear();
    for (const a of solved.assignments) {
      previousAideByStudent.set(a.studentId, a.aideId);
      usedAideBlocks.push({ aideId: a.aideId, block });
    }
  }

  const conflicts = hardConflicts(evaluateAssignments(ctx, allAssignments));
  if (conflicts.length > 0) {
    // Safety net: the search must never emit an illegal schedule.
    return { ok: false, reasons: conflicts, searchedNodes };
  }

  const { score, notes } = scoreAssignments(ctx, allAssignments);
  return {
    ok: true,
    schedule: {
      assignments: allAssignments,
      score,
      generatedAt: new Date().toISOString(),
      notes,
    },
  };
}

export function evaluateData(data: AppData, assignments: Assignment[] = data.schedule?.assignments ?? []): Conflict[] {
  return evaluateAssignments(makeContext(data), assignments);
}
