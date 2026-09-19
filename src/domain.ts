import type { Aide, AppData, Assignment, ScheduleBlock, Student } from './types';

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => Number.parseInt(n, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
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

export function studentAttendsBlock(student: Student, block: ScheduleBlock, allBlocks: ScheduleBlock[]): boolean {
  const ids = studentBlockIds(student, allBlocks);
  return ids.includes(block.id);
}

export function studentBlockIds(student: Student, blocks: ScheduleBlock[]): string[] {
  if (student.blockIds.length > 0) {
    const known = new Set(blocks.map((b) => b.id));
    return student.blockIds.filter((id) => known.has(id));
  }
  return blocks
    .filter((b) => {
      if (b.appliesTo === 'all') return true;
      return b.appliesTo === student.dayType;
    })
    .map((b) => b.id);
}

export function studentNeedsCoverage(student: Student, block: ScheduleBlock, allBlocks: ScheduleBlock[]): boolean {
  if (!studentAttendsBlock(student, block, allBlocks)) return false;
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

export function aideAvailableForBlock(aide: Aide, blockId: string): boolean {
  if (aide.availableBlockIds.length === 0) return true;
  return aide.availableBlockIds.includes(blockId);
}

export function nameById<T extends { id: string; name: string }>(items: T[], id: string): string {
  return items.find((i) => i.id === id)?.name ?? id;
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
