import type {
  Aide,
  AppData,
  Assignment,
  ScheduleBlock,
  SchoolLocation,
  Student,
  StudentBlockPlan,
} from './types';

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => Number.parseInt(n, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

export function isValidTime(value: string | undefined): value is string {
  return typeof value === 'string' && /^\d{1,2}:\d{2}$/.test(value);
}

export function blocksOverlap(a: ScheduleBlock, b: ScheduleBlock): boolean {
  if (a.id === b.id) return false;
  const a0 = timeToMinutes(a.startTime);
  const a1 = timeToMinutes(a.endTime);
  const b0 = timeToMinutes(b.startTime);
  const b1 = timeToMinutes(b.endTime);
  return a0 < b1 && b0 < a1;
}

export function sortBlocks(blocks: ScheduleBlock[]): ScheduleBlock[] {
  return [...blocks].sort((a, b) => {
    const d = timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
    if (d !== 0) return d;
    return a.name.localeCompare(b.name);
  });
}

export function planFor(student: Student, blockId: string): StudentBlockPlan | undefined {
  return student.plan.find((p) => p.blockId === blockId);
}

/**
 * Attendance is decided student-first, in this order:
 *   1. an explicit yes/no on that student's own plan row,
 *   2. the student's arrival / departure window,
 *   3. an explicit list of blocks on the student,
 *   4. the full-day / shortened-day pattern of the block.
 */
export function studentAttendsBlock(student: Student, block: ScheduleBlock, allBlocks: ScheduleBlock[]): boolean {
  const row = planFor(student, block.id);
  if (row && row.attends !== null) return row.attends;

  const start = timeToMinutes(block.startTime);
  const end = timeToMinutes(block.endTime);

  if (isValidTime(student.arrivalTime) || isValidTime(student.departureTime)) {
    const from = isValidTime(student.arrivalTime) ? timeToMinutes(student.arrivalTime) : -Infinity;
    const to = isValidTime(student.departureTime) ? timeToMinutes(student.departureTime) : Infinity;
    // The block counts as attended when the student is present for any of it.
    if (!(start < to && from < end)) return false;
    if (student.blockIds.length > 0) return student.blockIds.includes(block.id);
    return true;
  }

  if (student.blockIds.length > 0) {
    const known = new Set(allBlocks.map((b) => b.id));
    return student.blockIds.includes(block.id) && known.has(block.id);
  }

  if (block.appliesTo === 'all') return true;
  return block.appliesTo === student.dayType;
}

export function studentBlockIds(student: Student, blocks: ScheduleBlock[]): string[] {
  return blocks.filter((b) => studentAttendsBlock(student, b, blocks)).map((b) => b.id);
}

export function studentNeedsCoverage(student: Student, block: ScheduleBlock, allBlocks: ScheduleBlock[]): boolean {
  if (!studentAttendsBlock(student, block, allBlocks)) return false;
  const row = planFor(student, block.id);
  if (row && row.needsAide !== null) return row.needsAide;
  if (student.coverageMode === 'none') return false;
  if (student.coverageMode === 'listed') return student.coverageBlockIds.includes(block.id);
  return true;
}

export function studentRequiresOneToOne(student: Student, elopesRequiresOneToOne: boolean): boolean {
  if (student.requiresOneToOne) return true;
  if (student.traits.includes('needs-1to1')) return true;
  if (elopesRequiresOneToOne && student.traits.includes('elopes')) return true;
  return false;
}

/** The default location every student is in when their plan does not say otherwise. */
export function defaultLocationId(locations: SchoolLocation[]): string {
  const resource = locations.find((l) => l.kind === 'resource');
  return resource?.id ?? locations[0]?.id ?? '';
}

export function studentLocationId(student: Student, blockId: string, locations: SchoolLocation[]): string {
  const row = planFor(student, blockId);
  if (row && row.locationId) {
    if (locations.some((l) => l.id === row.locationId)) return row.locationId;
  }
  return defaultLocationId(locations);
}

export function studentActivity(student: Student, block: ScheduleBlock): string {
  const row = planFor(student, block.id);
  if (row && row.activity.trim()) return row.activity.trim();
  return block.name;
}

/** True when the staff member has to physically go with the student. */
export function studentNeedsEscort(student: Student, blockId: string): boolean {
  return planFor(student, blockId)?.aideAccompanies ?? false;
}

export function aideAvailableForBlock(aide: Aide, blockId: string): boolean {
  if (aide.absent) return false;
  if (aide.availableBlockIds.length === 0) return true;
  return aide.availableBlockIds.includes(blockId);
}

/** Staff who can actually be assigned students today. */
export function workingStaff(aides: Aide[], absentStaffIds: string[] = []): Aide[] {
  const out = new Set(absentStaffIds);
  return aides.filter((a) => !a.absent && !out.has(a.id) && a.countsAsCoverage);
}

export function isTeacher(aide: Aide): boolean {
  return aide.role === 'teacher';
}

export function nameById<T extends { id: string; name: string }>(items: T[], id: string): string {
  return items.find((i) => i.id === id)?.name ?? id;
}

export function locationName(locations: SchoolLocation[], id: string): string {
  return locations.find((l) => l.id === id)?.name ?? 'Classroom';
}

export function assignmentKey(a: Assignment): string {
  return `${a.blockId}::${a.studentId}`;
}

export function indexAssignments(assignments: Assignment[]): Map<string, Map<string, string>> {
  const byBlock = new Map<string, Map<string, string>>();
  for (const a of assignments) {
    let m = byBlock.get(a.blockId);
    if (!m) {
      m = new Map();
      byBlock.set(a.blockId, m);
    }
    m.set(a.studentId, a.aideId);
  }
  return byBlock;
}

export function cloneData(data: AppData): AppData {
  return structuredClone(data);
}

export function formatTimeRange(block: ScheduleBlock): string {
  return `${block.startTime}–${block.endTime}`;
}

/** 07:45 → 7:45 AM, for print-outs read by people who do not use 24-hour time. */
export function formatClock(hhmm: string): string {
  if (!isValidTime(hhmm)) return hhmm;
  const total = timeToMinutes(hhmm);
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatClockRange(block: ScheduleBlock): string {
  return `${formatClock(block.startTime)} – ${formatClock(block.endTime)}`;
}
