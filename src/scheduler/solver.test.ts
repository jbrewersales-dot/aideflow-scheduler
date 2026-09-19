import { describe, expect, it } from 'vitest';
import { createDemoData } from '../data/demo';
import { defaultBlocks, defaultParams } from '../data/defaults';
import type { Aide, AppData, ScheduleBlock, Student } from '../types';
import { evaluateAssignments, hardConflicts, makeContext } from './evaluate';
import { evaluateData, solveSchedule } from './solver';

function aide(partial: Partial<Aide> & Pick<Aide, 'id' | 'name'>): Aide {
  return {
    availableBlockIds: [],
    maxCaseload: 4,
    trainedTags: [],
    notes: '',
    preferredStudentIds: [],
    ...partial,
  };
}

function student(partial: Partial<Student> & Pick<Student, 'id' | 'name'>): Student {
  return {
    dayType: 'full',
    blockIds: [],
    needsNotes: '',
    needTags: [],
    traits: [],
    preferredAideIds: [],
    coverageMode: 'always',
    coverageBlockIds: [],
    requiresOneToOne: false,
    ...partial,
  };
}

function world(overrides: Partial<AppData> = {}): AppData {
  const blocks = overrides.blocks ?? [
    { id: 'p1', name: 'Period 1', startTime: '08:00', endTime: '09:00', kind: 'period', appliesTo: 'all' } satisfies ScheduleBlock,
  ];
  return {
    version: 1,
    teacherName: 'Test',
    schoolName: 'Test',
    students: [],
    aides: [],
    blocks,
    keepApart: [],
    traitConflicts: [],
    params: defaultParams(),
    schedule: null,
    ...overrides,
  };
}

describe('solveSchedule', () => {
  it('finds a complete valid schedule for the demo classroom', () => {
    const data = createDemoData();
    const result = solveSchedule(data);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');

    const hard = hardConflicts(evaluateAssignments(makeContext(data), result.schedule.assignments));
    expect(hard).toEqual([]);

    const morning = data.blocks.find((b) => b.id === 'blk_p1');
    expect(morning).toBeTruthy();
    const assignedMorning = new Set(
      result.schedule.assignments.filter((a) => a.blockId === 'blk_p1').map((a) => a.studentId),
    );
    expect(assignedMorning.size).toBe(data.students.length);

    const afternoon = result.schedule.assignments.filter((a) => a.blockId === 'blk_p5');
    const afternoonStudents = new Set(afternoon.map((a) => a.studentId));
    expect(afternoonStudents.has('stu_jordan')).toBe(false);
    expect(afternoonStudents.has('stu_marcus')).toBe(true);
  });

  it('returns no schedule when the problem is overconstrained, with reasons', () => {
    const data = world({
      aides: [aide({ id: 'a1', name: 'Only Aide' })],
      students: [
        student({ id: 's1', name: 'Avery', requiresOneToOne: true }),
        student({ id: 's2', name: 'Blair', requiresOneToOne: true }),
      ],
    });
    const result = solveSchedule(data);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons.every((r) => r.severity === 'hard')).toBe(true);
    expect(result.reasons.some((r) => /1:1|aide|seat/i.test(r.message))).toBe(true);
  });

  it('respects keep-apart pairs — never assigns them to the same aide', () => {
    const data = world({
      aides: [aide({ id: 'a1', name: 'Pat' }), aide({ id: 'a2', name: 'Quinn' })],
      students: [student({ id: 's1', name: 'Avery' }), student({ id: 's2', name: 'Blair' })],
      keepApart: [{ id: 'ka1', studentAId: 's1', studentBId: 's2', reason: 'Do not pair' }],
    });
    const result = solveSchedule(data);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    const p1 = result.schedule.assignments.filter((a) => a.blockId === 'p1');
    const aide1 = p1.find((a) => a.studentId === 's1')?.aideId;
    const aide2 = p1.find((a) => a.studentId === 's2')?.aideId;
    expect(aide1).toBeTruthy();
    expect(aide2).toBeTruthy();
    expect(aide1).not.toBe(aide2);
  });

  it('reports impossibility when keep-apart students have only one aide', () => {
    const data = world({
      aides: [aide({ id: 'a1', name: 'Only Aide' })],
      students: [student({ id: 's1', name: 'Avery' }), student({ id: 's2', name: 'Blair' })],
      keepApart: [{ id: 'ka1', studentAId: 's1', studentBId: 's2', reason: 'Do not pair' }],
    });
    const result = solveSchedule(data);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reasons.some((r) => r.kind === 'keep-apart' || /apart|share/i.test(r.message))).toBe(true);
  });

  it('respects hard trait conflicts (two aggressive students cannot share an aide)', () => {
    const data = world({
      aides: [aide({ id: 'a1', name: 'Pat' }), aide({ id: 'a2', name: 'Quinn' })],
      students: [
        student({ id: 's1', name: 'Avery', traits: ['aggressive'] }),
        student({ id: 's2', name: 'Blair', traits: ['aggressive'] }),
      ],
      traitConflicts: [
        {
          id: 'tc1',
          traitA: 'aggressive',
          traitB: 'aggressive',
          scope: 'aide',
          severity: 'hard',
          note: '',
        },
      ],
    });
    const result = solveSchedule(data);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    const p1 = result.schedule.assignments.filter((a) => a.blockId === 'p1');
    expect(p1.find((a) => a.studentId === 's1')?.aideId).not.toBe(p1.find((a) => a.studentId === 's2')?.aideId);
  });

  it('returns no solution when a hard trait conflict cannot be satisfied', () => {
    const data = world({
      aides: [aide({ id: 'a1', name: 'Only Aide' })],
      students: [
        student({ id: 's1', name: 'Avery', traits: ['aggressive'] }),
        student({ id: 's2', name: 'Blair', traits: ['aggressive'] }),
      ],
      traitConflicts: [
        {
          id: 'tc1',
          traitA: 'aggressive',
          traitB: 'aggressive',
          scope: 'aide',
          severity: 'hard',
          note: '',
        },
      ],
    });
    const result = solveSchedule(data);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reasons.some((r) => r.kind === 'trait-conflict' || /aggressive|trait|explored/i.test(r.message))).toBe(
      true,
    );
  });

  it('never double-books an aide across overlapping blocks', () => {
    const blocks: ScheduleBlock[] = [
      { id: 'lunch', name: 'Lunch', startTime: '11:30', endTime: '12:15', kind: 'lunch', appliesTo: 'all' },
      { id: 'duty', name: 'Hall duty', startTime: '12:00', endTime: '12:30', kind: 'other', appliesTo: 'all' },
    ];
    const data = world({
      blocks,
      aides: [aide({ id: 'a1', name: 'Only Aide' })],
      students: [
        student({ id: 's1', name: 'Avery', blockIds: ['lunch'] }),
        student({ id: 's2', name: 'Blair', blockIds: ['duty'] }),
      ],
    });
    const result = solveSchedule(data);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('will not assign an aide to a block they are not available for', () => {
    const data = world({
      aides: [aide({ id: 'a1', name: 'Morning only', availableBlockIds: ['p1'] })],
      blocks: [
        { id: 'p1', name: 'Period 1', startTime: '08:00', endTime: '09:00', kind: 'period', appliesTo: 'all' },
        { id: 'p2', name: 'Period 2', startTime: '09:00', endTime: '10:00', kind: 'period', appliesTo: 'all' },
      ],
      students: [student({ id: 's1', name: 'Avery' })],
    });
    const result = solveSchedule(data);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reasons.some((r) => r.blockId === 'p2' || /Period 2/i.test(r.message))).toBe(true);
  });

  it('treats elopes as requiring 1:1 when that parameter is on', () => {
    const data = world({
      aides: [aide({ id: 'a1', name: 'Pat' })],
      students: [
        student({ id: 's1', name: 'Avery', traits: ['elopes'] }),
        student({ id: 's2', name: 'Blair' }),
      ],
      params: { ...defaultParams(), elopesRequiresOneToOne: true, maxStudentsPerAide: 4, maxGroupSize: 4 },
    });
    const result = solveSchedule(data);
    expect(result.ok).toBe(false);
  });

  it('never returns ok:true when hard conflicts exist (safety net)', () => {
    const data = createDemoData();
    data.aides = data.aides.slice(0, 1);
    data.params.maxStudentsPerAide = 1;
    data.params.maxGroupSize = 1;
    const result = solveSchedule(data);
    expect(result.ok).toBe(false);
  });
});

describe('evaluateData', () => {
  it('flags a manual double-assignment that exceeds caseload', () => {
    const data = world({
      aides: [aide({ id: 'a1', name: 'Pat', maxCaseload: 1 })],
      students: [student({ id: 's1', name: 'Avery' }), student({ id: 's2', name: 'Blair' })],
      params: { ...defaultParams(), maxStudentsPerAide: 1, maxGroupSize: 1 },
    });
    const conflicts = evaluateData(data, [
      { studentId: 's1', aideId: 'a1', blockId: 'p1' },
      { studentId: 's2', aideId: 'a1', blockId: 'p1' },
    ]);
    expect(hardConflicts(conflicts).some((c) => c.kind === 'over-caseload')).toBe(true);
  });

  it('uses demo default blocks so shortened-day students skip afternoon', () => {
    const data = createDemoData();
    const jordan = data.students.find((s) => s.id === 'stu_jordan');
    expect(jordan).toBeTruthy();
    const ctx = makeContext(data);
    const p5 = ctx.blockById.get('blk_p5');
    expect(p5).toBeTruthy();
    const assigned = evaluateAssignments(ctx, []);
    expect(assigned.some((c) => c.studentIds.includes('stu_jordan') && c.blockId === 'blk_p5')).toBe(false);
    expect(defaultBlocks().some((b) => b.id === 'blk_p5')).toBe(true);
  });
});
