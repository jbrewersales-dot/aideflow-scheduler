import {
  aideAvailableForBlock,
  blocksOverlap,
  isTeacher,
  locationName,
  sortBlocks,
  studentAttendsBlock,
  studentNeedsCoverage,
  studentRequiresOneToOne,
} from '../domain';
import type { Aide, AppData, Assignment, Conflict, ScheduleBlock, SolveResult, Student } from '../types';
import {
  assignableStaff,
  effectiveCap,
  evaluateAssignments,
  hardConflicts,
  locationOf,
  makeContext,
  wouldViolateHard,
  type EvalContext,
} from './evaluate';
import { scoreAssignments } from './score';

/**
 * Nodes we are willing to explore while *proving* a part of the day impossible.
 * Only reaching this without any legal arrangement is reported as "too complex".
 */
const NODE_BUDGET = 3_000_000;
/** Extra nodes spent looking for a nicer schedule after the first legal one. */
const IMPROVE_BUDGET = 12_000;

export interface SolveOptions {
  /** Staff treated as out for this run, on top of each staff member's own flag. */
  absentStaffIds?: string[];
}

function availableAides(ctx: EvalContext, block: ScheduleBlock): Aide[] {
  return assignableStaff(ctx).filter((a) => aideAvailableForBlock(a, block.id));
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

/**
 * Cheap structural checks that prove a block is impossible before searching it.
 * Every message names the block and the students involved in plain language.
 */
function preflightBlock(ctx: EvalContext, block: ScheduleBlock): Conflict[] {
  const reasons: Conflict[] = [];
  const needed = requiredStudents(ctx, block);
  const aides = availableAides(ctx, block);

  if (needed.length === 0) return reasons;

  if (aides.length === 0) {
    reasons.push({
      kind: 'aide-unavailable',
      severity: 'hard',
      blockId: block.id,
      studentIds: needed.map((s) => s.id),
      message: `No staff are available during ${block.name}, but ${needed.length} student(s) need an adult.`,
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
      message: `${block.name} has ${oneToOne.length} students who require 1:1 but only ${aides.length} available staff member(s).`,
    });
  }

  // One adult can only be in one room, so every distinct room needs its own adult.
  const byLocation = new Map<string, Student[]>();
  for (const s of needed) {
    const loc = locationOf(ctx, s, block.id);
    const list = byLocation.get(loc) ?? [];
    list.push(s);
    byLocation.set(loc, list);
  }
  if (byLocation.size > aides.length) {
    reasons.push({
      kind: 'location-split',
      severity: 'hard',
      blockId: block.id,
      studentIds: needed.map((s) => s.id),
      message: `During ${block.name} students need adults in ${byLocation.size} different places (${[...byLocation.keys()].map((id) => locationName(ctx.locations, id)).join(', ')}) but only ${aides.length} staff member(s) are available.`,
    });
  }

  // Staff who cannot leave their room cannot serve students elsewhere.
  for (const [loc, group] of byLocation) {
    const canCover = aides.filter(
      (a) => a.canLeaveRoom || !a.homeLocationId || a.homeLocationId === loc,
    );
    if (canCover.length === 0) {
      reasons.push({
        kind: 'cannot-leave-room',
        severity: 'hard',
        blockId: block.id,
        studentIds: group.map((s) => s.id),
        message: `No available staff member can go to ${locationName(ctx.locations, loc)} during ${block.name} for ${group.map((s) => s.name).join(', ')}.`,
      });
    }
    const seatsThere = canCover.reduce((sum, a) => sum + effectiveCap(a, ctx.params), 0);
    if (group.length > seatsThere && canCover.length > 0) {
      reasons.push({
        kind: 'over-caseload',
        severity: 'hard',
        blockId: block.id,
        studentIds: group.map((s) => s.id),
        message: `${locationName(ctx.locations, loc)} during ${block.name} needs ${group.length} seats but reachable staff only provide ${seatsThere}.`,
      });
    }
  }

  const caps = aides.map((a) => effectiveCap(a, ctx.params)).sort((x, y) => x - y);
  const capacity = caps.reduce((sum, n) => sum + n, 0);
  if (needed.length > capacity) {
    reasons.push({
      kind: 'over-caseload',
      severity: 'hard',
      blockId: block.id,
      studentIds: needed.map((s) => s.id),
      message: `${block.name} needs coverage for ${needed.length} students but staff only have ${capacity} total seats (max per adult / group size).`,
    });
  }

  // A 1:1 student takes up a whole adult, not one seat. The best case is that
  // the adults with the smallest groups take the 1:1 students, so the seats
  // left over are the largest remaining caps.
  const oneToOneCount = oneToOne.length;
  if (oneToOneCount > 0 && oneToOneCount <= aides.length) {
    const remainingSeats = caps.slice(oneToOneCount).reduce((sum, n) => sum + n, 0);
    const remainingStudents = needed.length - oneToOneCount;
    if (remainingStudents > remainingSeats) {
      reasons.push({
        kind: 'over-caseload',
        severity: 'hard',
        blockId: block.id,
        studentIds: needed.filter((s) => !oneToOne.includes(s)).map((s) => s.id),
        message: `In ${block.name}, ${oneToOneCount} student(s) need 1:1, which uses up ${oneToOneCount} adult(s) entirely. That leaves ${remainingSeats} seat(s) for the other ${remainingStudents} student(s).`,
      });
    }
  }

  return reasons;
}

function explainUnplaceable(ctx: EvalContext, blocks: ScheduleBlock[]): Conflict[] {
  const reasons: Conflict[] = [];
  for (const block of blocks) {
    reasons.push(...preflightBlock(ctx, block));
  }

  if (reasons.length === 0) {
    // Name the keep-apart and trait pressure that the exhaustive search hit.
    for (const block of blocks) {
      const needed = requiredStudents(ctx, block);
      const ids = new Set(needed.map((s) => s.id));
      for (const pair of ctx.keepApart) {
        if (!ids.has(pair.studentAId) || !ids.has(pair.studentBId)) continue;
        const a = ctx.studentById.get(pair.studentAId);
        const b = ctx.studentById.get(pair.studentBId);
        reasons.push({
          kind: 'keep-apart',
          severity: 'hard',
          blockId: block.id,
          studentIds: [pair.studentAId, pair.studentBId],
          ruleId: pair.id,
          message: `${a?.name ?? 'A student'} and ${b?.name ?? 'another student'} must stay apart during ${block.name}${pair.reason ? ` — ${pair.reason}` : ''}, and no legal split was found.`,
        });
      }
    }
  }

  if (reasons.length === 0) {
    reasons.push({
      kind: 'over-caseload',
      severity: 'hard',
      blockId: blocks[0]?.id,
      studentIds: blocks.flatMap((b) => requiredStudents(ctx, b).map((s) => s.id)),
      message: `Explored every legal combination for ${blocks.map((b) => b.name).join(', ')} and none satisfied all hard rules (keep-apart, trait conflicts, 1:1, room limits, caseload, and staff availability).`,
    });
  }

  return reasons;
}

interface ComponentSolve {
  assignments: Assignment[];
  score: number;
  nodes: number;
}

interface ComponentFail {
  fail: true;
  reasons: Conflict[];
  nodes: number;
}

interface Slot {
  block: ScheduleBlock;
  student: Student;
  optional: boolean;
}

/**
 * Solve a group of blocks that overlap each other (usually a single block).
 * Overlapping blocks are searched together so an early choice can never make a
 * later block unsolvable without the search backtracking into it.
 */
function solveComponent(
  ctx: EvalContext,
  blocks: ScheduleBlock[],
  previousAideByStudent: Map<string, string>,
): ComponentSolve | ComponentFail {
  for (const block of blocks) {
    const structural = preflightBlock(ctx, block);
    if (structural.length > 0) {
      return { fail: true, reasons: structural, nodes: 0 };
    }
  }

  const ordered = sortBlocks(blocks);
  const requiredSlots: Slot[] = [];
  const optionalSlots: Slot[] = [];
  for (const block of ordered) {
    const required = requiredStudents(ctx, block);
    const requiredIds = new Set(required.map((s) => s.id));
    for (const student of sortStudentsForSearch(ctx, required)) {
      requiredSlots.push({ block, student, optional: false });
    }
    const optional = presentStudents(ctx, block).filter((s) => !requiredIds.has(s.id));
    for (const student of sortStudentsForSearch(ctx, optional)) {
      optionalSlots.push({ block, student, optional: true });
    }
  }

  const aidesByBlock = new Map<string, Aide[]>();
  for (const block of ordered) aidesByBlock.set(block.id, availableAides(ctx, block));

  const overlapIds = new Map<string, string[]>();
  for (const a of ordered) {
    overlapIds.set(
      a.id,
      ordered.filter((b) => blocksOverlap(a, b)).map((b) => b.id),
    );
  }

  const assignedByBlock = new Map<string, Map<string, string>>();
  for (const block of ordered) assignedByBlock.set(block.id, new Map());
  const staffBlocks = new Map<string, Set<string>>();

  let nodes = 0;
  let exhausted = false;
  let best: Assignment[] | null = null;
  let bestScore = -Infinity;
  /** Node count when the first legal arrangement was found. */
  let firstSolutionAt = -1;

  const snapshot = (): Assignment[] => {
    const out: Assignment[] = [];
    for (const [blockId, map] of assignedByBlock) {
      for (const [studentId, aideId] of map) out.push({ studentId, aideId, blockId });
    }
    return out;
  };

  const place = (slot: Slot, aide: Aide): boolean => {
    const busy = staffBlocks.get(aide.id);
    if (busy) {
      for (const other of overlapIds.get(slot.block.id) ?? []) {
        if (busy.has(other)) return false;
      }
    }
    const map = assignedByBlock.get(slot.block.id);
    if (!map) return false;
    if (wouldViolateHard(ctx, slot.block, slot.student, aide, map)) return false;
    map.set(slot.student.id, aide.id);
    const set = staffBlocks.get(aide.id) ?? new Set<string>();
    set.add(slot.block.id);
    staffBlocks.set(aide.id, set);
    return true;
  };

  const unplace = (slot: Slot, aide: Aide): void => {
    const map = assignedByBlock.get(slot.block.id);
    map?.delete(slot.student.id);
    const stillHere = [...(map?.values() ?? [])].includes(aide.id);
    if (!stillHere) staffBlocks.get(aide.id)?.delete(slot.block.id);
  };

  const orderAides = (slot: Slot): Aide[] => {
    const list = aidesByBlock.get(slot.block.id) ?? [];
    const prev = previousAideByStudent.get(slot.student.id);
    return [...list].sort((a, b) => {
      const rank = (x: Aide): number => {
        if (x.id === prev) return 0;
        if (slot.student.preferredAideIds.includes(x.id)) return 1;
        if (x.preferredStudentIds.includes(slot.student.id)) return 2;
        return 3;
      };
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });
  };

  /**
   * True once we should stop. Before any legal arrangement is found we keep
   * going to the full budget, so "no valid schedule" always means the search
   * really did run out of possibilities rather than out of patience.
   */
  const outOfBudget = (): boolean => {
    if (nodes > NODE_BUDGET) {
      exhausted = true;
      return true;
    }
    if (firstSolutionAt >= 0 && nodes - firstSolutionAt > IMPROVE_BUDGET) return true;
    return false;
  };

  const search = (slots: Slot[], index: number): void => {
    if (outOfBudget()) return;
    if (index >= slots.length) {
      const assignments = snapshot();
      const score = scorePartial(ctx, assignments, previousAideByStudent);
      if (score > bestScore) {
        bestScore = score;
        best = assignments;
      }
      if (firstSolutionAt < 0) firstSolutionAt = nodes;
      return;
    }

    const slot = slots[index];
    let placedAny = false;
    for (const aide of orderAides(slot)) {
      nodes += 1;
      if (outOfBudget()) return;
      if (!place(slot, aide)) continue;
      placedAny = true;
      search(slots, index + 1);
      unplace(slot, aide);
    }

    if (slot.optional && !placedAny) {
      search(slots, index + 1);
    }
  };

  search(requiredSlots, 0);

  if (!best) {
    return {
      fail: true,
      reasons: exhausted
        ? [
            {
              kind: 'over-caseload',
              severity: 'hard',
              blockId: ordered[0]?.id,
              studentIds: requiredSlots.map((s) => s.student.id),
              message: `The search for ${ordered.map((b) => b.name).join(', ')} hit its size limit before finding a legal arrangement. Simplify the rules for this part of the day and try again.`,
            },
          ]
        : explainUnplaceable(ctx, ordered),
      nodes,
    };
  }

  // Lock in the best required-only solution, then fill optional students around it.
  const lockedIn: Assignment[] = best;
  for (const map of assignedByBlock.values()) map.clear();
  staffBlocks.clear();
  for (const a of lockedIn) {
    assignedByBlock.get(a.blockId)?.set(a.studentId, a.aideId);
    const set = staffBlocks.get(a.aideId) ?? new Set<string>();
    set.add(a.blockId);
    staffBlocks.set(a.aideId, set);
  }

  if (optionalSlots.length > 0 && !exhausted) {
    bestScore = scorePartial(ctx, snapshot(), previousAideByStudent);
    best = snapshot();
    firstSolutionAt = nodes;
    search(optionalSlots, 0);
  }

  return { assignments: best ?? lockedIn, score: bestScore, nodes };
}

/**
 * Cheap preference score for one component, used to choose between legal
 * arrangements. It runs at every leaf of the search, so it only looks at the
 * assignments in hand — the full-day score is computed once at the end.
 */
function scorePartial(
  ctx: EvalContext,
  assignments: Assignment[],
  previousAideByStudent: Map<string, string>,
): number {
  const w = ctx.params.weights;
  let score = 0;
  const groupSizes = new Map<string, number>();

  for (const a of assignments) {
    const student = ctx.studentById.get(a.studentId);
    const aide = ctx.aideById.get(a.aideId);
    if (!student || !aide) continue;

    if (student.preferredAideIds.includes(aide.id) || aide.preferredStudentIds.includes(student.id)) {
      score += w.preferredMatch;
    }
    const tags = new Set([...student.needTags, ...student.traits]);
    for (const t of aide.trainedTags) {
      if (tags.has(t)) {
        score += w.trainedTagMatch;
        break;
      }
    }
    if (previousAideByStudent.get(a.studentId) === a.aideId) score += w.minimizeTransitions;
    if (isTeacher(aide) && locationOf(ctx, student, a.blockId) === aide.homeLocationId) {
      score += w.keepWithTeacher;
    }
    // Covering a student at all beats leaving an optional one out.
    score += 1;

    const key = `${a.blockId}::${a.aideId}`;
    groupSizes.set(key, (groupSizes.get(key) ?? 0) + 1);
  }

  const sizes = [...groupSizes.values()];
  if (sizes.length > 1) {
    const mean = sizes.reduce((s, n) => s + n, 0) / sizes.length;
    const variance = sizes.reduce((s, n) => s + (n - mean) ** 2, 0) / sizes.length;
    score -= variance * w.caseloadBalance;
  }

  return score;
}

/** Blocks that overlap each other must be solved together. */
function overlapComponents(blocks: ScheduleBlock[]): ScheduleBlock[][] {
  const ordered = sortBlocks(blocks);
  const seen = new Set<string>();
  const components: ScheduleBlock[][] = [];

  for (const start of ordered) {
    if (seen.has(start.id)) continue;
    const queue = [start];
    const group: ScheduleBlock[] = [];
    seen.add(start.id);
    while (queue.length > 0) {
      const current = queue.pop();
      if (!current) break;
      group.push(current);
      for (const other of ordered) {
        if (seen.has(other.id)) continue;
        if (blocksOverlap(current, other)) {
          seen.add(other.id);
          queue.push(other);
        }
      }
    }
    components.push(sortBlocks(group));
  }

  return components;
}

/**
 * Search for a complete assignment that violates zero hard constraints.
 * If none exists, return reasons — never a partial or illegal schedule.
 */
export function solveSchedule(data: AppData, options: SolveOptions = {}): SolveResult {
  const absentStaffIds = options.absentStaffIds ?? [];
  const ctx = makeContext(data, absentStaffIds);
  let searchedNodes = 0;

  const staff = assignableStaff(ctx);
  if (staff.length === 0) {
    const anyStaff = ctx.aides.length > 0;
    return {
      ok: false,
      searchedNodes: 0,
      reasons: [
        {
          kind: anyStaff ? 'staff-absent' : 'aide-unavailable',
          severity: 'hard',
          studentIds: ctx.students.map((s) => s.id),
          message: anyStaff
            ? 'Everyone who can cover students is marked out today. Bring someone back in, or add a substitute on the Staff tab.'
            : 'There are no staff to assign. Add at least one aide and try again.',
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

  const allAssignments: Assignment[] = [];
  const previousAideByStudent = new Map<string, string>();

  for (const component of overlapComponents(ctx.blocks)) {
    const result = solveComponent(ctx, component, previousAideByStudent);
    searchedNodes += result.nodes;

    if ('fail' in result) {
      return { ok: false, reasons: result.reasons, searchedNodes };
    }

    allAssignments.push(...result.assignments);
    previousAideByStudent.clear();
    for (const a of result.assignments) {
      previousAideByStudent.set(a.studentId, a.aideId);
    }
  }

  const conflicts = hardConflicts(evaluateAssignments(ctx, allAssignments));
  if (conflicts.length > 0) {
    // Safety net: the search must never emit an illegal schedule.
    return { ok: false, reasons: conflicts, searchedNodes };
  }

  const { score, notes } = scoreAssignments(ctx, allAssignments);
  const absentNames = ctx.aides
    .filter((a) => a.absent || ctx.absentStaffIds.has(a.id))
    .map((a) => a.name);
  if (absentNames.length > 0) notes.push(`Built without ${absentNames.join(', ')}`);

  return {
    ok: true,
    schedule: {
      assignments: allAssignments,
      score,
      generatedAt: new Date().toISOString(),
      notes,
      absentStaffIds: ctx.aides.filter((a) => a.absent || ctx.absentStaffIds.has(a.id)).map((a) => a.id),
    },
  };
}

export function evaluateData(
  data: AppData,
  assignments: Assignment[] = data.schedule?.assignments ?? [],
): Conflict[] {
  return evaluateAssignments(makeContext(data), assignments);
}

/** Staff whose absence the user may want a backup plan for. */
export function coverableStaff(data: AppData): Aide[] {
  return data.aides.filter((a) => a.countsAsCoverage && !isTeacher(a));
}
