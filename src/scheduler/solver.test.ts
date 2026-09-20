import { describe, expect, it } from 'vitest';
import { createDemoData, planRow } from '../data/demo';
import { RESOURCE_ROOM_ID, blankAideRecord, defaultBlocks, defaultLocations, defaultParams } from '../data/defaults';
import { normalizeTime, parsePlanCsv, parseStudentCsv, scheduleToCsv } from '../csv';
import { studentAttendsBlock, studentLocationId, studentNeedsCoverage } from '../domain';
import { migrate } from '../storage';
import type { Aide, AppData, ScheduleBlock, Student } from '../types';
import { evaluateAssignments, hardConflicts, makeContext } from './evaluate';
import { evaluateData, solveSchedule } from './solver';

function aide(partial: Partial<Aide> & Pick<Aide, 'id' | 'name'>): Aide {
  return { ...blankAideRecord(partial.id, partial.name), ...partial };
}

function teacher(partial: Partial<Aide> & Pick<Aide, 'id' | 'name'>): Aide {
  return {
    ...blankAideRecord(partial.id, partial.name),
    role: 'teacher',
    canLeaveRoom: false,
    homeLocationId: RESOURCE_ROOM_ID,
    maxCaseload: 6,
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
    plan: [],
    ...partial,
  };
}

function world(overrides: Partial<AppData> = {}): AppData {
  const blocks = overrides.blocks ?? [
    { id: 'p1', name: 'Period 1', startTime: '08:00', endTime: '09:00', kind: 'period', appliesTo: 'all', studentIds: [] } satisfies ScheduleBlock,
  ];
  return {
    version: 2,
    teacherName: 'Test',
    schoolName: 'Test',
    students: [],
    aides: [],
    blocks,
    locations: defaultLocations(),
    keepApart: [],
    traitConflicts: [],
    params: defaultParams(),
    schedule: null,
    backupPlans: [],
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

    const assignedMorning = new Set(
      result.schedule.assignments.filter((a) => a.blockId === 'blk_p1').map((a) => a.studentId),
    );
    // Everyone who is in the building in Period 1 is covered.
    const presentMorning = data.students.filter((s) =>
      studentNeedsCoverage(s, data.blocks.find((b) => b.id === 'blk_p1')!, data.blocks),
    );
    expect(assignedMorning.size).toBe(presentMorning.length);

    const afternoonStudents = new Set(
      result.schedule.assignments.filter((a) => a.blockId === 'blk_p5').map((a) => a.studentId),
    );
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
    expect(result.reasons.some((r) => /1:1|aide|seat|staff/i.test(r.message))).toBe(true);
  });

  it('respects keep-apart pairs — never assigns them to the same adult', () => {
    const data = world({
      aides: [aide({ id: 'a1', name: 'Pat' }), aide({ id: 'a2', name: 'Quinn' })],
      students: [student({ id: 's1', name: 'Avery' }), student({ id: 's2', name: 'Blair' })],
      keepApart: [{ id: 'ka1', studentAId: 's1', studentBId: 's2', reason: 'Do not pair' }],
    });
    const result = solveSchedule(data);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    const p1 = result.schedule.assignments.filter((a) => a.blockId === 'p1');
    expect(p1.find((a) => a.studentId === 's1')?.aideId).not.toBe(p1.find((a) => a.studentId === 's2')?.aideId);
  });

  it('reports impossibility when keep-apart students have only one adult', () => {
    const data = world({
      aides: [aide({ id: 'a1', name: 'Only Aide' })],
      students: [student({ id: 's1', name: 'Avery' }), student({ id: 's2', name: 'Blair' })],
      keepApart: [{ id: 'ka1', studentAId: 's1', studentBId: 's2', reason: 'Do not pair' }],
    });
    const result = solveSchedule(data);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reasons.some((r) => r.kind === 'keep-apart' || /apart|share|combination/i.test(r.message))).toBe(true);
  });

  it('respects hard trait conflicts (two aggressive students cannot share an adult)', () => {
    const data = world({
      aides: [aide({ id: 'a1', name: 'Pat' }), aide({ id: 'a2', name: 'Quinn' })],
      students: [
        student({ id: 's1', name: 'Avery', traits: ['aggressive'] }),
        student({ id: 's2', name: 'Blair', traits: ['aggressive'] }),
      ],
      traitConflicts: [
        { id: 'tc1', traitA: 'aggressive', traitB: 'aggressive', scope: 'aide', severity: 'hard', note: '' },
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
        { id: 'tc1', traitA: 'aggressive', traitB: 'aggressive', scope: 'aide', severity: 'hard', note: '' },
      ],
    });
    const result = solveSchedule(data);
    expect(result.ok).toBe(false);
  });

  it('never double-books an adult across overlapping blocks', () => {
    const blocks: ScheduleBlock[] = [
      { id: 'lunch', name: 'Lunch', startTime: '11:30', endTime: '12:15', kind: 'lunch', appliesTo: 'all', studentIds: [] },
      { id: 'duty', name: 'Hall duty', startTime: '12:00', endTime: '12:30', kind: 'other', appliesTo: 'all', studentIds: [] },
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
  });

  it('solves overlapping blocks together when enough adults exist', () => {
    const blocks: ScheduleBlock[] = [
      { id: 'lunch', name: 'Lunch', startTime: '11:30', endTime: '12:15', kind: 'lunch', appliesTo: 'all', studentIds: [] },
      { id: 'duty', name: 'Hall duty', startTime: '12:00', endTime: '12:30', kind: 'other', appliesTo: 'all', studentIds: [] },
    ];
    const data = world({
      blocks,
      aides: [aide({ id: 'a1', name: 'Pat' }), aide({ id: 'a2', name: 'Quinn' })],
      students: [
        student({ id: 's1', name: 'Avery', blockIds: ['lunch'] }),
        student({ id: 's2', name: 'Blair', blockIds: ['duty'] }),
      ],
    });
    const result = solveSchedule(data);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    const lunchAide = result.schedule.assignments.find((a) => a.blockId === 'lunch')?.aideId;
    const dutyAide = result.schedule.assignments.find((a) => a.blockId === 'duty')?.aideId;
    expect(lunchAide).toBeTruthy();
    expect(dutyAide).toBeTruthy();
    expect(lunchAide).not.toBe(dutyAide);
  });

  it('will not assign an adult to a block they are not available for', () => {
    const data = world({
      aides: [aide({ id: 'a1', name: 'Morning only', availableBlockIds: ['p1'] })],
      blocks: [
        { id: 'p1', name: 'Period 1', startTime: '08:00', endTime: '09:00', kind: 'period', appliesTo: 'all', studentIds: [] },
        { id: 'p2', name: 'Period 2', startTime: '09:00', endTime: '10:00', kind: 'period', appliesTo: 'all', studentIds: [] },
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
      students: [student({ id: 's1', name: 'Avery', traits: ['elopes'] }), student({ id: 's2', name: 'Blair' })],
      params: { ...defaultParams(), elopesRequiresOneToOne: true },
    });
    expect(solveSchedule(data).ok).toBe(false);
  });

  it('explains that a 1:1 student uses a whole adult, not one seat', () => {
    // 2 adults with room for 4 each looks like 8 seats, but one 1:1 student
    // consumes an entire adult, so only 4 seats are really available.
    const data = world({
      aides: [aide({ id: 'a1', name: 'Pat' }), aide({ id: 'a2', name: 'Quinn' })],
      students: [
        student({ id: 's0', name: 'Solo', requiresOneToOne: true }),
        ...Array.from({ length: 5 }, (_, i) => student({ id: `s${i + 1}`, name: `Kid ${i + 1}` })),
      ],
    });
    const result = solveSchedule(data);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reasons.some((r) => /uses up 1 adult\(s\) entirely/.test(r.message))).toBe(true);
  });

  it('still solves when the 1:1 maths works out', () => {
    const data = world({
      aides: [aide({ id: 'a1', name: 'Pat' }), aide({ id: 'a2', name: 'Quinn' })],
      students: [
        student({ id: 's0', name: 'Solo', requiresOneToOne: true }),
        ...Array.from({ length: 4 }, (_, i) => student({ id: `s${i + 1}`, name: `Kid ${i + 1}` })),
      ],
    });
    const result = solveSchedule(data);
    expect(result.ok).toBe(true);
  });

  it('never returns ok:true when hard conflicts exist (safety net)', () => {
    const data = createDemoData();
    data.aides = data.aides.slice(1, 2);
    data.params.maxStudentsPerAide = 1;
    data.params.maxGroupSize = 1;
    expect(solveSchedule(data).ok).toBe(false);
  });
});

describe('rooms and travel', () => {
  it('one adult is never put in two rooms during the same block', () => {
    const data = world({
      aides: [aide({ id: 'a1', name: 'Pat' }), aide({ id: 'a2', name: 'Quinn' })],
      students: [
        student({ id: 's1', name: 'Avery', plan: [planRow('p1', { locationId: 'loc_gened_a' })] }),
        student({ id: 's2', name: 'Blair', plan: [planRow('p1', { locationId: 'loc_therapy' })] }),
      ],
    });
    const result = solveSchedule(data);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    const p1 = result.schedule.assignments.filter((a) => a.blockId === 'p1');
    expect(p1.find((a) => a.studentId === 's1')?.aideId).not.toBe(p1.find((a) => a.studentId === 's2')?.aideId);
  });

  it('reports impossibility when more rooms need adults than adults exist', () => {
    const data = world({
      aides: [aide({ id: 'a1', name: 'Only Aide' })],
      students: [
        student({ id: 's1', name: 'Avery', plan: [planRow('p1', { locationId: 'loc_gened_a' })] }),
        student({ id: 's2', name: 'Blair', plan: [planRow('p1', { locationId: 'loc_therapy' })] }),
      ],
    });
    const result = solveSchedule(data);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reasons.some((r) => r.kind === 'location-split')).toBe(true);
  });

  it('a teacher who cannot leave the room is never sent out with a student', () => {
    const data = world({
      aides: [teacher({ id: 't1', name: 'Ashley' }), aide({ id: 'a1', name: 'Pat' })],
      students: [
        student({
          id: 's1',
          name: 'Avery',
          plan: [planRow('p1', { locationId: 'loc_gened_a', aideAccompanies: true })],
        }),
        student({ id: 's2', name: 'Blair' }),
      ],
    });
    const result = solveSchedule(data);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    const away = result.schedule.assignments.find((a) => a.studentId === 's1');
    expect(away?.aideId).toBe('a1');
    // Ashley keeps the student who stays in her room.
    expect(result.schedule.assignments.find((a) => a.studentId === 's2')?.aideId).toBe('t1');
  });

  it('says so plainly when only the teacher is left and a student must leave the room', () => {
    const data = world({
      aides: [teacher({ id: 't1', name: 'Ashley' })],
      students: [
        student({
          id: 's1',
          name: 'Avery',
          plan: [planRow('p1', { locationId: 'loc_gened_a', aideAccompanies: true })],
        }),
      ],
    });
    const result = solveSchedule(data);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reasons.some((r) => r.kind === 'cannot-leave-room')).toBe(true);
  });

  it('a student marked as not needing an adult is left unassigned without complaint', () => {
    const data = world({
      aides: [aide({ id: 'a1', name: 'Pat', maxCaseload: 1 })],
      students: [
        student({ id: 's1', name: 'Avery' }),
        student({ id: 's2', name: 'Blair', plan: [planRow('p1', { needsAide: false })] }),
      ],
    });
    const result = solveSchedule(data);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.schedule.assignments.some((a) => a.studentId === 's1')).toBe(true);
  });
});

describe('who is here, and when', () => {
  it('a PM arrival is absent in the morning and present after lunch', () => {
    const blocks = defaultBlocks();
    const dylan = student({ id: 's1', name: 'Dylan', arrivalTime: '11:30' });
    const morning = blocks.find((b) => b.id === 'blk_p1')!;
    const lunch = blocks.find((b) => b.id === 'blk_lunch')!;
    const afternoon = blocks.find((b) => b.id === 'blk_p5')!;
    expect(studentAttendsBlock(dylan, morning, blocks)).toBe(false);
    expect(studentAttendsBlock(dylan, lunch, blocks)).toBe(true);
    expect(studentAttendsBlock(dylan, afternoon, blocks)).toBe(true);
  });

  it('an early departure ends the day at the right time', () => {
    const blocks = defaultBlocks();
    const jordan = student({ id: 's1', name: 'Jordan', departureTime: '12:15' });
    expect(studentAttendsBlock(jordan, blocks.find((b) => b.id === 'blk_lunch')!, blocks)).toBe(true);
    expect(studentAttendsBlock(jordan, blocks.find((b) => b.id === 'blk_p5')!, blocks)).toBe(false);
  });

  it('an explicit plan row overrides the arrival window in both directions', () => {
    const blocks = defaultBlocks();
    const p1 = blocks.find((b) => b.id === 'blk_p1')!;
    const late = student({ id: 's1', name: 'Late', arrivalTime: '11:30', plan: [planRow('blk_p1', { attends: true })] });
    const early = student({ id: 's2', name: 'Early', plan: [planRow('blk_p1', { attends: false })] });
    expect(studentAttendsBlock(late, p1, blocks)).toBe(true);
    expect(studentAttendsBlock(early, p1, blocks)).toBe(false);
  });

  it('demo: Dylan arrives midday and is covered from lunch onward', () => {
    const data = createDemoData();
    const result = solveSchedule(data);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    const dylanBlocks = new Set(
      result.schedule.assignments.filter((a) => a.studentId === 'stu_dylan').map((a) => a.blockId),
    );
    expect(dylanBlocks.has('blk_p1')).toBe(false);
    expect(dylanBlocks.has('blk_p5')).toBe(true);
  });
});

describe('picking exactly who is in a block', () => {
  const block = (over: Partial<ScheduleBlock> = {}): ScheduleBlock => ({
    id: 'p1', name: 'Period 1', startTime: '08:00', endTime: '09:00',
    kind: 'period', appliesTo: 'all', studentIds: [], ...over,
  });

  it('only the ticked students are in the block', () => {
    const b = block({ appliesTo: 'listed', studentIds: ['s1', 's3'] });
    const roster = [
      student({ id: 's1', name: 'One' }),
      student({ id: 's2', name: 'Two' }),
      student({ id: 's3', name: 'Three', dayType: 'shortened' }),
    ];
    expect(roster.map((s) => studentAttendsBlock(s, b, [b]))).toEqual([true, false, true]);
  });

  it('a mix of full-day and shortened-day students can share one block', () => {
    const b = block({ appliesTo: 'listed', studentIds: ['full1', 'short1'] });
    const full = student({ id: 'full1', name: 'Full', dayType: 'full' });
    const short = student({ id: 'short1', name: 'Short', dayType: 'shortened' });
    expect(studentAttendsBlock(full, b, [b])).toBe(true);
    expect(studentAttendsBlock(short, b, [b])).toBe(true);
  });

  it('ticking nobody means the block has no students', () => {
    const b = block({ appliesTo: 'listed', studentIds: [] });
    const s = student({ id: 's1', name: 'One' });
    expect(studentAttendsBlock(s, b, [b])).toBe(false);
  });

  it("a student's own plan row still overrides the block's list", () => {
    const b = block({ appliesTo: 'listed', studentIds: ['s1'] });
    const optedOut = student({ id: 's1', name: 'One', plan: [planRow('p1', { attends: false })] });
    const optedIn = student({ id: 's2', name: 'Two', plan: [planRow('p1', { attends: true })] });
    expect(studentAttendsBlock(optedOut, b, [b])).toBe(false);
    expect(studentAttendsBlock(optedIn, b, [b])).toBe(true);
  });

  it('schedules only the ticked students', () => {
    const data = world({
      blocks: [block({ appliesTo: 'listed', studentIds: ['s1'] })],
      aides: [aide({ id: 'a1', name: 'Pat' })],
      students: [student({ id: 's1', name: 'In' }), student({ id: 's2', name: 'Out' })],
    });
    const result = solveSchedule(data);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.schedule.assignments.map((a) => a.studentId)).toEqual(['s1']);
  });

  it('removing a student takes them off every block list', () => {
    const before = migrate({
      version: 2, teacherName: 'A', schoolName: '', students: [], aides: [],
      blocks: [{ id: 'p1', name: 'P1', startTime: '08:00', endTime: '09:00', kind: 'period',
        appliesTo: 'listed', studentIds: ['s1', 's2'] }],
      keepApart: [], traitConflicts: [], params: {},
    });
    expect(before.blocks[0].studentIds).toEqual(['s1', 's2']);
    expect(before.blocks[0].appliesTo).toBe('listed');
  });
});

describe('when an adult is out', () => {
  it('builds a different schedule with someone marked absent', () => {
    const data = createDemoData();
    const result = solveSchedule(data, { absentStaffIds: ['aide_denise'] });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.schedule.assignments.some((a) => a.aideId === 'aide_denise')).toBe(false);
    expect(result.schedule.absentStaffIds).toContain('aide_denise');
  });

  it('honours the absent flag stored on the staff member', () => {
    const data = createDemoData();
    data.aides = data.aides.map((a) => (a.id === 'aide_keisha' ? { ...a, absent: true } : a));
    const result = solveSchedule(data);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.schedule.assignments.some((a) => a.aideId === 'aide_keisha')).toBe(false);
  });

  it('says plainly when everyone is out rather than inventing a schedule', () => {
    const data = createDemoData();
    const result = solveSchedule(data, { absentStaffIds: data.aides.map((a) => a.id) });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reasons.some((r) => /out today|no staff/i.test(r.message))).toBe(true);
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

  it('flags a manual move that puts one adult in two rooms', () => {
    const data = world({
      aides: [aide({ id: 'a1', name: 'Pat' })],
      students: [
        student({ id: 's1', name: 'Avery', plan: [planRow('p1', { locationId: 'loc_gened_a' })] }),
        student({ id: 's2', name: 'Blair', plan: [planRow('p1', { locationId: 'loc_therapy' })] }),
      ],
    });
    const conflicts = evaluateData(data, [
      { studentId: 's1', aideId: 'a1', blockId: 'p1' },
      { studentId: 's2', aideId: 'a1', blockId: 'p1' },
    ]);
    expect(hardConflicts(conflicts).some((c) => c.kind === 'location-split')).toBe(true);
  });

  it('shortened-day students skip the afternoon in the demo classroom', () => {
    const data = createDemoData();
    const ctx = makeContext(data);
    const conflicts = evaluateAssignments(ctx, []);
    expect(conflicts.some((c) => c.studentIds.includes('stu_jordan') && c.blockId === 'blk_p5')).toBe(false);
  });
});

describe('spreadsheets', () => {
  it('reads times written the way a teacher writes them', () => {
    expect(normalizeTime('7:45')).toBe('07:45');
    expect(normalizeTime('7:45 AM')).toBe('07:45');
    expect(normalizeTime('1:05 pm')).toBe('13:05');
    expect(normalizeTime('12:00 AM')).toBe('00:00');
    expect(normalizeTime('0745')).toBe('07:45');
    expect(normalizeTime('nonsense')).toBeUndefined();
    expect(normalizeTime('')).toBeUndefined();
  });

  it('imports a roster with arrival times', () => {
    const data = world({ blocks: defaultBlocks() });
    const csv = 'name,dayType,arrivalTime\nDylan Reyes,full,11:30 AM\nSam Diaz,shortened,\n';
    const { students, errors } = parseStudentCsv(csv, data);
    expect(errors).toEqual([]);
    expect(students).toHaveLength(2);
    expect(students[0].arrivalTime).toBe('11:30');
    expect(students[1].dayType).toBe('shortened');
  });

  it('keeps notes with commas and quotes intact', () => {
    const data = world({ blocks: defaultBlocks() });
    const csv = 'name,needsNotes\n"Reyes, Dylan","Says ""hi"" first, then works"\n';
    const { students } = parseStudentCsv(csv, data);
    expect(students[0].name).toBe('Reyes, Dylan');
    expect(students[0].needsNotes).toBe('Says "hi" first, then works');
  });

  it('imports a day plan and applies it to the right student and block', () => {
    const base = createDemoData();
    const csv =
      'student,block,activity,location,needsAide,aideAccompanies\nEthan Ruiz,Period 2 · Math,"Gen-ed math","Gen-ed classroom B",yes,yes\n';
    const { students, applied, errors } = parsePlanCsv(csv, base);
    expect(errors).toEqual([]);
    expect(applied).toBe(1);
    const ethan = students.find((s) => s.id === 'stu_ethan');
    expect(ethan?.plan.find((p) => p.blockId === 'blk_p2')?.activity).toBe('Gen-ed math');
    expect(studentLocationId(ethan!, 'blk_p2', base.locations)).toBe('loc_gened_b');
  });

  it('reports unknown names instead of guessing', () => {
    const base = createDemoData();
    const csv = 'student,block,activity\nNobody At All,Period 2 · Math,Something\n';
    const { applied, errors } = parsePlanCsv(csv, base);
    expect(applied).toBe(0);
    expect(errors.join(' ')).toMatch(/no student named/i);
  });

  it('exports a schedule that names the room and the adult for every student', () => {
    const data = createDemoData();
    const result = solveSchedule(data);
    if (!result.ok) throw new Error('expected success');
    data.schedule = result.schedule;
    const csv = scheduleToCsv(data);
    expect(csv.split('\n')[0]).toContain('room');
    expect(csv).toContain('Lily Chen');
    expect(csv).toContain('Gen-ed classroom A');
    expect(csv).not.toContain('UNASSIGNED');
  });
});

describe('opening an older saved classroom', () => {
  it('adds the teacher, rooms and empty plans to a version 1 file', () => {
    const old = {
      version: 1,
      teacherName: 'Ashley Brewer',
      schoolName: 'Resource',
      students: [{ id: 'stu_a', name: 'Avery', dayType: 'full', traits: ['elopes'], coverageMode: 'always' }],
      aides: [{ id: 'aide_a', name: 'Pat', maxCaseload: 3 }],
      blocks: defaultBlocks(),
      keepApart: [],
      traitConflicts: [],
      params: { maxStudentsPerAide: 4, maxGroupSize: 4, weights: { preferredMatch: 8 } },
      schedule: { assignments: [], score: 1, generatedAt: 'x', notes: [] },
    };
    const migrated = migrate(old);
    expect(migrated.version).toBe(2);
    expect(migrated.aides.some((a) => a.role === 'teacher' && a.name === 'Ashley Brewer')).toBe(true);
    expect(migrated.aides.find((a) => a.id === 'aide_a')?.canLeaveRoom).toBe(true);
    expect(migrated.locations.length).toBeGreaterThan(0);
    expect(migrated.students[0].plan).toEqual([]);
    expect(migrated.students[0].traits).toEqual(['elopes']);
    expect(migrated.params.maxStudentsPerTeacher).toBeGreaterThan(0);
    // A roster built under the old rules is re-solved rather than trusted.
    expect(migrated.schedule).toBeNull();
  });

  it('refuses a file that is not an AideFlow backup', () => {
    expect(() => migrate({ hello: 'world' })).toThrow();
  });
});
