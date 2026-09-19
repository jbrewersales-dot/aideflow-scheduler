import {
  aideAvailableForBlock,
  blocksOverlap,
  studentAttendsBlock,
  studentNeedsCoverage,
  studentRequiresOneToOne,
} from '../domain';
import type {
  Aide,
  AppData,
  Assignment,
  Conflict,
  ConflictSeverity,
  ScheduleBlock,
  Student,
  TraitConflictRule,
} from '../types';

export interface EvalContext {
  students: Student[];
  aides: Aide[];
  blocks: ScheduleBlock[];
  keepApart: AppData['keepApart'];
  traitConflicts: TraitConflictRule[];
  params: AppData['params'];
  studentById: Map<string, Student>;
  aideById: Map<string, Aide>;
  blockById: Map<string, ScheduleBlock>;
}

export function makeContext(data: Pick<AppData, 'students' | 'aides' | 'blocks' | 'keepApart' | 'traitConflicts' | 'params'>): EvalContext {
  return {
    students: data.students,
    aides: data.aides,
    blocks: data.blocks,
    keepApart: data.keepApart,
    traitConflicts: data.traitConflicts,
    params: data.params,
    studentById: new Map(data.students.map((s) => [s.id, s])),
    aideById: new Map(data.aides.map((a) => [a.id, a])),
    blockById: new Map(data.blocks.map((b) => [b.id, b])),
  };
}

function ruleSeverity(ctx: EvalContext, rule: TraitConflictRule): ConflictSeverity {
  if (!ctx.params.traitConflictsAreHard) return 'soft';
  return rule.severity;
}

export function pairMatchesTraitRule(aTraits: string[], bTraits: string[], rule: TraitConflictRule): boolean {
  if (rule.traitA === rule.traitB) {
    return aTraits.includes(rule.traitA) && bTraits.includes(rule.traitB);
  }
  return (
    (aTraits.includes(rule.traitA) && bTraits.includes(rule.traitB)) ||
    (aTraits.includes(rule.traitB) && bTraits.includes(rule.traitA))
  );
}

export function effectiveCap(aide: Aide, params: AppData['params']): number {
  return Math.max(1, Math.min(aide.maxCaseload, params.maxStudentsPerAide, params.maxGroupSize));
}

/**
 * Incremental hard-constraint check used by the backtracker.
 * `assigned` is studentId → aideId for the current block only.
 */
export function wouldViolateHard(
  ctx: EvalContext,
  block: ScheduleBlock,
  student: Student,
  aide: Aide,
  assigned: Map<string, string>,
): Conflict | null {
  if (!aideAvailableForBlock(aide, block.id)) {
    return {
      kind: 'aide-unavailable',
      severity: 'hard',
      blockId: block.id,
      studentIds: [student.id],
      aideId: aide.id,
      message: `${aide.name} is not available during ${block.name}.`,
    };
  }

  const peers: Student[] = [];
  for (const [sid, aid] of assigned) {
    if (aid === aide.id) {
      const peer = ctx.studentById.get(sid);
      if (peer) peers.push(peer);
    }
  }

  const nextCount = peers.length + 1;
  const cap = effectiveCap(aide, ctx.params);
  if (nextCount > cap) {
    return {
      kind: 'over-caseload',
      severity: 'hard',
      blockId: block.id,
      studentIds: [student.id, ...peers.map((p) => p.id)],
      aideId: aide.id,
      message: `${aide.name} would have ${nextCount} students in ${block.name} (max ${cap}).`,
    };
  }

  const studentOneToOne = studentRequiresOneToOne(student, ctx.params.elopesRequiresOneToOne);
  if (studentOneToOne && peers.length > 0) {
    return {
      kind: 'one-to-one-shared',
      severity: 'hard',
      blockId: block.id,
      studentIds: [student.id, ...peers.map((p) => p.id)],
      aideId: aide.id,
      message: `${student.name} requires 1:1 and cannot share ${aide.name} with ${peers.map((p) => p.name).join(', ')} during ${block.name}.`,
    };
  }

  for (const peer of peers) {
    if (studentRequiresOneToOne(peer, ctx.params.elopesRequiresOneToOne)) {
      return {
        kind: 'one-to-one-shared',
        severity: 'hard',
        blockId: block.id,
        studentIds: [peer.id, student.id],
        aideId: aide.id,
        message: `${peer.name} requires 1:1 and cannot share ${aide.name} with ${student.name} during ${block.name}.`,
      };
    }
  }

  if (ctx.params.elopesRequiresOneToOne && student.traits.includes('elopes') && !studentOneToOne) {
    // covered by studentRequiresOneToOne when the flag is on
  }

  for (const pair of ctx.keepApart) {
    const otherId = pair.studentAId === student.id ? pair.studentBId : pair.studentBId === student.id ? pair.studentAId : null;
    if (!otherId) continue;
    if (peers.some((p) => p.id === otherId)) {
      const other = ctx.studentById.get(otherId);
      return {
        kind: 'keep-apart',
        severity: 'hard',
        blockId: block.id,
        studentIds: [student.id, otherId],
        aideId: aide.id,
        ruleId: pair.id,
        message: `${student.name} and ${other?.name ?? otherId} must stay apart${pair.reason ? ` (${pair.reason})` : ''} — they cannot share ${aide.name} in ${block.name}.`,
      };
    }
  }

  for (const rule of ctx.traitConflicts) {
    if (ruleSeverity(ctx, rule) !== 'hard') continue;
    for (const peer of peers) {
      if (pairMatchesTraitRule(student.traits, peer.traits, rule)) {
        return {
          kind: 'trait-conflict',
          severity: 'hard',
          blockId: block.id,
          studentIds: [student.id, peer.id],
          aideId: aide.id,
          ruleId: rule.id,
          message: `${student.name} and ${peer.name} conflict on traits “${rule.traitA}” / “${rule.traitB}” and cannot share ${aide.name} in ${block.name}.`,
        };
      }
    }
  }

  return null;
}

export function evaluateAssignments(ctx: EvalContext, assignments: Assignment[]): Conflict[] {
  const conflicts: Conflict[] = [];
  const byBlock = new Map<string, Assignment[]>();

  for (const a of assignments) {
    if (!ctx.studentById.has(a.studentId)) {
      conflicts.push({
        kind: 'unknown-ref',
        severity: 'hard',
        blockId: a.blockId,
        studentIds: [a.studentId],
        aideId: a.aideId,
        message: `Assignment refers to an unknown student.`,
      });
      continue;
    }
    if (!ctx.aideById.has(a.aideId)) {
      conflicts.push({
        kind: 'unknown-ref',
        severity: 'hard',
        blockId: a.blockId,
        studentIds: [a.studentId],
        aideId: a.aideId,
        message: `Assignment refers to an unknown aide.`,
      });
      continue;
    }
    if (!ctx.blockById.has(a.blockId)) {
      conflicts.push({
        kind: 'unknown-ref',
        severity: 'hard',
        studentIds: [a.studentId],
        aideId: a.aideId,
        message: `Assignment refers to an unknown schedule block.`,
      });
      continue;
    }
    const list = byBlock.get(a.blockId) ?? [];
    list.push(a);
    byBlock.set(a.blockId, list);
  }

  for (const block of ctx.blocks) {
    const presentNeeded = ctx.students.filter((s) => studentNeedsCoverage(s, block, ctx.blocks));
    const assignedHere = byBlock.get(block.id) ?? [];
    const assignedIds = new Set(assignedHere.map((a) => a.studentId));

    for (const student of presentNeeded) {
      if (!assignedIds.has(student.id)) {
        conflicts.push({
          kind: 'missing-coverage',
          severity: 'hard',
          blockId: block.id,
          studentIds: [student.id],
          message: `${student.name} must have an aide during ${block.name}, but is unassigned.`,
        });
      }
    }

    const assigned = new Map<string, string>();
    for (const row of assignedHere) {
      const student = ctx.studentById.get(row.studentId);
      const aide = ctx.aideById.get(row.aideId);
      if (!student || !aide) continue;

      if (!studentAttendsBlock(student, block, ctx.blocks)) {
        conflicts.push({
          kind: 'student-not-present',
          severity: 'hard',
          blockId: block.id,
          studentIds: [student.id],
          aideId: aide.id,
          message: `${student.name} is assigned in ${block.name} but does not attend that block.`,
        });
      }

      const hit = wouldViolateHard(ctx, block, student, aide, assigned);
      if (hit) conflicts.push(hit);
      assigned.set(student.id, aide.id);
    }

    for (const student of ctx.students) {
      if (!assigned.has(student.id)) continue;
      if (
        ctx.params.elopesRequiresOneToOne &&
        student.traits.includes('elopes') &&
        studentAttendsBlock(student, block, ctx.blocks)
      ) {
        const aideId = assigned.get(student.id);
        const groupSize = [...assigned.values()].filter((id) => id === aideId).length;
        if (groupSize !== 1) {
          conflicts.push({
            kind: 'elopes-not-one-to-one',
            severity: 'hard',
            blockId: block.id,
            studentIds: [student.id],
            aideId,
            message: `${student.name} is tagged “elopes” and must have 1:1 coverage in ${block.name}.`,
          });
        }
      }
    }

    // Soft trait conflicts (for highlighting / scoring, not blocking the solver emit)
    for (const rule of ctx.traitConflicts) {
      if (ruleSeverity(ctx, rule) !== 'soft') continue;
      const groups = new Map<string, Student[]>();
      for (const [sid, aid] of assigned) {
        const s = ctx.studentById.get(sid);
        if (!s) continue;
        const g = groups.get(aid) ?? [];
        g.push(s);
        groups.set(aid, g);
      }
      for (const [aideId, group] of groups) {
        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            if (pairMatchesTraitRule(group[i].traits, group[j].traits, rule)) {
              conflicts.push({
                kind: 'trait-conflict',
                severity: 'soft',
                blockId: block.id,
                studentIds: [group[i].id, group[j].id],
                aideId,
                ruleId: rule.id,
                message: `Soft trait preference: ${group[i].name} and ${group[j].name} (“${rule.traitA}” / “${rule.traitB}”) share an aide in ${block.name}.`,
              });
            }
          }
        }
      }
    }
  }

  // Aide cannot serve two overlapping blocks
  const aideBlocks = new Map<string, Set<string>>();
  for (const a of assignments) {
    const set = aideBlocks.get(a.aideId) ?? new Set();
    set.add(a.blockId);
    aideBlocks.set(a.aideId, set);
  }
  for (const [aideId, blockIds] of aideBlocks) {
    const aide = ctx.aideById.get(aideId);
    const list = [...blockIds].map((id) => ctx.blockById.get(id)).filter((b): b is ScheduleBlock => Boolean(b));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (blocksOverlap(list[i], list[j])) {
          const studentIds = assignments
            .filter((a) => a.aideId === aideId && (a.blockId === list[i].id || a.blockId === list[j].id))
            .map((a) => a.studentId);
          conflicts.push({
            kind: 'aide-unavailable',
            severity: 'hard',
            studentIds,
            aideId,
            message: `${aide?.name ?? 'Aide'} is double-booked in overlapping blocks ${list[i].name} and ${list[j].name}.`,
          });
        }
      }
    }
  }

  return dedupeConflicts(conflicts);
}

export function hardConflicts(conflicts: Conflict[]): Conflict[] {
  return conflicts.filter((c) => c.severity === 'hard');
}

function dedupeConflicts(conflicts: Conflict[]): Conflict[] {
  const seen = new Set<string>();
  const out: Conflict[] = [];
  for (const c of conflicts) {
    const key = `${c.kind}|${c.severity}|${c.blockId ?? ''}|${c.aideId ?? ''}|${[...c.studentIds].sort().join(',')}|${c.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}
