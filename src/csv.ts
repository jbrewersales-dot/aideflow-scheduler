import { createId } from './ids';
import { formatClock, isValidTime, planFor, sortBlocks, studentActivity, studentAttendsBlock, studentLocationId, studentNeedsCoverage, studentNeedsEscort } from './domain';
import type { AppData, Student, StudentBlockPlan } from './types';

export const STUDENT_CSV_HEADERS = [
  'name',
  'dayType',
  'arrivalTime',
  'departureTime',
  'blocks',
  'busPickup',
  'busDropoff',
  'needTags',
  'traits',
  'needsNotes',
  'requiresOneToOne',
  'coverageMode',
  'preferredAides',
] as const;

export const STUDENT_CSV_TEMPLATE = `${STUDENT_CSV_HEADERS.join(',')}
Marcus Hale,full,,,,"07:40","14:25","behavior;1:1","aggressive;needs-1to1","Needs a consistent 1:1. Keep apart from Ethan.",true,always,"Denise Morales"
Lily Chen,full,,,,"07:45","14:20","mobility;sensory","sensory-sensitive;wheelchair","Manual wheelchair. Headphones at recess.",false,always,"Keisha Ward"
Jordan Blake,shortened,,"12:15",,"07:50","12:10","elopement;1:1","elopes;needs-1to1;flight-risk","Must have 1:1 from bus to bus.",true,always,"Priya Shah"
Dylan Reyes,full,"11:30",,,"11:25","14:25","behavior","","Afternoon-only placement.",false,always,""
`;

export const PLAN_CSV_HEADERS = [
  'student',
  'block',
  'attends',
  'activity',
  'location',
  'needsAide',
  'aideAccompanies',
  'note',
] as const;

export const PLAN_CSV_TEMPLATE = `${PLAN_CSV_HEADERS.join(',')}
Lily Chen,Period 1 · ELA,yes,"Gen-ed ELA (inclusion)","Gen-ed classroom A",yes,yes,"Aide pushes in for the whole period."
Ava Patel,Period 3 · Science / SS,yes,"Speech therapy","Speech / OT room",yes,yes,"Aide walks her down and back."
Maya Thompson,Specials / wrap-up,yes,"Art (independent)","Specials (art / music / PE)",no,no,"Does not need an adult."
`;

function splitList(value: string): string[] {
  return value
    .split(/[;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

/** Split on newlines that are not inside a quoted cell. */
function splitCsvRows(text: string): string[] {
  const rows: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      cur += ch;
      continue;
    }
    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      rows.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  rows.push(cur);
  return rows.map((r) => r.trim()).filter((r) => r.length > 0 && !r.startsWith('#'));
}

function truthy(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === 'true' || v === 'yes' || v === 'y' || v === '1' || v === 'x';
}

function falsy(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === 'false' || v === 'no' || v === 'n' || v === '0';
}

/** "7:45 AM", "0745", "7.45" and "07:45" all mean the same thing to a teacher. */
export function normalizeTime(value: string): string | undefined {
  const raw = value.trim();
  if (!raw) return undefined;
  const m = raw.match(/^(\d{1,2})[:.]?(\d{2})\s*([ap]\.?m\.?)?$/i);
  if (!m) return undefined;
  let hour = Number.parseInt(m[1], 10);
  const minute = Number.parseInt(m[2], 10);
  const suffix = m[3]?.toLowerCase().replace(/\./g, '');
  if (Number.isNaN(hour) || Number.isNaN(minute) || minute > 59 || hour > 23) return undefined;
  if (suffix === 'pm' && hour < 12) hour += 12;
  if (suffix === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function parseStudentCsv(text: string, data: AppData): { students: Student[]; errors: string[] } {
  const lines = splitCsvRows(text);
  const errors: string[] = [];
  if (lines.length === 0) {
    return { students: [], errors: ['The CSV file is empty.'] };
  }

  const header = parseCsvLine(lines[0]).map((h) => h.replace(/^﻿/, ''));
  const index = new Map(header.map((h, i) => [h.toLowerCase(), i]));
  if (!index.has('name')) {
    return { students: [], errors: ['Missing required column “name”. Download the template and try again.'] };
  }

  const get = (cols: string[], key: string): string => {
    const i = index.get(key.toLowerCase());
    if (i === undefined) return '';
    return cols[i] ?? '';
  };

  const students: Student[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = parseCsvLine(lines[r]);
    const name = get(cols, 'name');
    if (!name) {
      errors.push(`Row ${r + 1}: name is required.`);
      continue;
    }
    const dayRaw = (get(cols, 'dayType') || 'full').toLowerCase();
    const dayType = dayRaw.startsWith('short') ? 'shortened' : 'full';
    const blockNames = splitList(get(cols, 'blocks'));
    const blockIds = blockNames
      .map((label) => {
        const hit = data.blocks.find((b) => b.id === label || b.name.toLowerCase() === label.toLowerCase());
        return hit?.id;
      })
      .filter((id): id is string => Boolean(id));

    if (blockNames.length > 0 && blockIds.length !== blockNames.length) {
      errors.push(`Row ${r + 1} (${name}): some block names were not recognized and were skipped.`);
    }

    const preferred = splitList(get(cols, 'preferredAides'))
      .map((label) => data.aides.find((a) => a.id === label || a.name.toLowerCase() === label.toLowerCase())?.id)
      .filter((id): id is string => Boolean(id));

    const coverageRaw = (get(cols, 'coverageMode') || 'always').toLowerCase();
    const coverageMode = coverageRaw === 'listed' || coverageRaw === 'none' ? coverageRaw : 'always';

    const arrivalRaw = get(cols, 'arrivalTime');
    const departureRaw = get(cols, 'departureTime');
    const arrivalTime = normalizeTime(arrivalRaw);
    const departureTime = normalizeTime(departureRaw);
    if (arrivalRaw && !arrivalTime) errors.push(`Row ${r + 1} (${name}): could not read arrival time “${arrivalRaw}”.`);
    if (departureRaw && !departureTime) errors.push(`Row ${r + 1} (${name}): could not read departure time “${departureRaw}”.`);

    students.push({
      id: createId('stu'),
      name,
      dayType,
      blockIds,
      arrivalTime,
      departureTime,
      busPickup: normalizeTime(get(cols, 'busPickup')),
      busDropoff: normalizeTime(get(cols, 'busDropoff')),
      needTags: splitList(get(cols, 'needTags')),
      traits: splitList(get(cols, 'traits')),
      needsNotes: get(cols, 'needsNotes'),
      requiresOneToOne: truthy(get(cols, 'requiresOneToOne')),
      coverageMode,
      coverageBlockIds: [],
      preferredAideIds: preferred,
      plan: [],
    });
  }

  return { students, errors };
}

/**
 * Apply a per-student, per-block day plan onto the existing roster.
 * Rows whose student or block cannot be matched are reported, never guessed.
 */
export function parsePlanCsv(
  text: string,
  data: AppData,
): { students: Student[]; applied: number; errors: string[] } {
  const lines = splitCsvRows(text);
  const errors: string[] = [];
  if (lines.length === 0) return { students: data.students, applied: 0, errors: ['The CSV file is empty.'] };

  const header = parseCsvLine(lines[0]).map((h) => h.replace(/^﻿/, '').toLowerCase());
  const index = new Map(header.map((h, i) => [h, i]));
  for (const col of ['student', 'block']) {
    if (!index.has(col)) {
      return {
        students: data.students,
        applied: 0,
        errors: [`Missing required column “${col}”. Download the day-plan template and try again.`],
      };
    }
  }

  const get = (cols: string[], key: string): string => {
    const i = index.get(key);
    if (i === undefined) return '';
    return cols[i] ?? '';
  };

  const planByStudent = new Map<string, StudentBlockPlan[]>();
  let applied = 0;

  for (let r = 1; r < lines.length; r++) {
    const cols = parseCsvLine(lines[r]);
    const studentLabel = get(cols, 'student');
    const blockLabel = get(cols, 'block');
    if (!studentLabel && !blockLabel) continue;

    const student = data.students.find(
      (s) => s.id === studentLabel || s.name.toLowerCase() === studentLabel.toLowerCase(),
    );
    if (!student) {
      errors.push(`Row ${r + 1}: no student named “${studentLabel}”. Add them first, then upload the day plan.`);
      continue;
    }
    const block = data.blocks.find(
      (b) => b.id === blockLabel || b.name.toLowerCase() === blockLabel.toLowerCase(),
    );
    if (!block) {
      errors.push(`Row ${r + 1} (${student.name}): no block named “${blockLabel}”.`);
      continue;
    }

    const locationLabel = get(cols, 'location');
    let locationId = '';
    if (locationLabel) {
      const location = data.locations.find(
        (l) => l.id === locationLabel || l.name.toLowerCase() === locationLabel.toLowerCase(),
      );
      if (!location) {
        errors.push(`Row ${r + 1} (${student.name}): no room named “${locationLabel}”. Add it on the Rooms tab.`);
      } else {
        locationId = location.id;
      }
    }

    const attendsRaw = get(cols, 'attends');
    const needsRaw = get(cols, 'needsAide');

    const row: StudentBlockPlan = {
      blockId: block.id,
      attends: truthy(attendsRaw) ? true : falsy(attendsRaw) ? false : null,
      activity: get(cols, 'activity'),
      locationId,
      needsAide: truthy(needsRaw) ? true : falsy(needsRaw) ? false : null,
      aideAccompanies: truthy(get(cols, 'aideAccompanies')),
      note: get(cols, 'note'),
    };

    const list = planByStudent.get(student.id) ?? [];
    const existing = list.findIndex((p) => p.blockId === row.blockId);
    if (existing >= 0) list[existing] = row;
    else list.push(row);
    planByStudent.set(student.id, list);
    applied += 1;
  }

  const students = data.students.map((s) => {
    const incoming = planByStudent.get(s.id);
    if (!incoming) return s;
    const kept = s.plan.filter((p) => !incoming.some((n) => n.blockId === p.blockId));
    return { ...s, plan: [...kept, ...incoming] };
  });

  return { students, applied, errors };
}

export function studentsToCsv(students: Student[], data: AppData): string {
  const header = STUDENT_CSV_HEADERS.join(',');
  const rows = students.map((s) => {
    const blocks = s.blockIds.map((id) => data.blocks.find((b) => b.id === id)?.name ?? id).join(';');
    const preferred = s.preferredAideIds.map((id) => data.aides.find((a) => a.id === id)?.name ?? id).join(';');
    const cells = [
      s.name,
      s.dayType,
      s.arrivalTime ?? '',
      s.departureTime ?? '',
      blocks,
      s.busPickup ?? '',
      s.busDropoff ?? '',
      s.needTags.join(';'),
      s.traits.join(';'),
      s.needsNotes,
      s.requiresOneToOne ? 'true' : 'false',
      s.coverageMode,
      preferred,
    ];
    return cells.map(csvEscape).join(',');
  });
  return [header, ...rows].join('\n');
}

export function planToCsv(data: AppData): string {
  const header = PLAN_CSV_HEADERS.join(',');
  const blocks = sortBlocks(data.blocks);
  const rows: string[] = [];
  for (const student of [...data.students].sort((a, b) => a.name.localeCompare(b.name))) {
    for (const block of blocks) {
      const row = planFor(student, block.id);
      if (!row) continue;
      rows.push(
        [
          student.name,
          block.name,
          row.attends === null ? '' : row.attends ? 'yes' : 'no',
          row.activity,
          data.locations.find((l) => l.id === row.locationId)?.name ?? '',
          row.needsAide === null ? '' : row.needsAide ? 'yes' : 'no',
          row.aideAccompanies ? 'yes' : 'no',
          row.note,
        ]
          .map(csvEscape)
          .join(','),
      );
    }
  }
  return [header, ...rows].join('\n');
}

export function scheduleToCsv(data: AppData): string {
  const header = 'time,block,student,activity,room,adult,withStudent,dayType,traits';
  const blocks = sortBlocks(data.blocks);
  const rows: string[] = [];

  for (const block of blocks) {
    const inBlock = data.students
      .filter((s) => studentAttendsBlock(s, block, data.blocks))
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const student of inBlock) {
      const row = (data.schedule?.assignments ?? []).find(
        (a) => a.studentId === student.id && a.blockId === block.id,
      );
      const aide = data.aides.find((x) => x.id === row?.aideId);
      const needs = studentNeedsCoverage(student, block, data.blocks);
      rows.push(
        [
          `${formatClock(block.startTime)}-${formatClock(block.endTime)}`,
          block.name,
          student.name,
          studentActivity(student, block),
          data.locations.find((l) => l.id === studentLocationId(student, block.id, data.locations))?.name ?? '',
          aide?.name ?? (needs ? 'UNASSIGNED' : 'no adult needed'),
          studentNeedsEscort(student, block.id) ? 'travels with student' : '',
          student.dayType,
          student.traits.join(';'),
        ]
          .map(csvEscape)
          .join(','),
      );
    }
  }
  return [header, ...rows].join('\n');
}

/** One row per adult per block: the sheet an aide carries around all day. */
export function staffToCsv(data: AppData): string {
  const header = 'adult,time,block,room,students,note';
  const blocks = sortBlocks(data.blocks);
  const rows: string[] = [];
  for (const aide of data.aides) {
    for (const block of blocks) {
      const mine = (data.schedule?.assignments ?? []).filter(
        (a) => a.aideId === aide.id && a.blockId === block.id,
      );
      if (mine.length === 0) continue;
      const names = mine
        .map((a) => data.students.find((s) => s.id === a.studentId))
        .filter((s): s is Student => Boolean(s));
      const locId = names[0] ? studentLocationId(names[0], block.id, data.locations) : '';
      rows.push(
        [
          aide.name,
          `${formatClock(block.startTime)}-${formatClock(block.endTime)}`,
          block.name,
          data.locations.find((l) => l.id === locId)?.name ?? '',
          names.map((s) => s.name).join('; '),
          names.some((s) => studentNeedsEscort(s, block.id)) ? 'leaves the room' : '',
        ]
          .map(csvEscape)
          .join(','),
      );
    }
  }
  return [header, ...rows].join('\n');
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export { isValidTime };
