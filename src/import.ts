/**
 * Turning whatever a school hands you into AideFlow data.
 *
 * Teachers do not get a tidy CSV. They get a bell schedule pasted out of a PDF,
 * a roster copied from a gradebook, a column of names in an email. Everything
 * here takes a blob of pasted text and works out what it means, reporting what
 * it understood so a person can check it before anything is saved.
 */
import { createId } from './ids';
import type { Aide, BlockKind, ScheduleBlock, Student } from './types';
import { blankAideRecord } from './data/defaults';

// ---------------------------------------------------------------- text basics

export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** Excel and Google Sheets paste as tabs; files arrive as commas. */
export function detectDelimiter(lines: string[]): string | null {
  const candidates: { d: string; re: RegExp }[] = [
    { d: '\t', re: /\t/g },
    { d: ',', re: /,/g },
    { d: ';', re: /;/g },
    { d: '|', re: /\|/g },
  ];
  for (const { d, re } of candidates) {
    const counts = lines.map((l) => (l.match(re) ?? []).length);
    const withAny = counts.filter((n) => n > 0).length;
    if (withAny >= Math.max(1, Math.floor(lines.length * 0.6))) return d;
  }
  // Columns lined up with runs of spaces.
  if (lines.filter((l) => /\s{2,}/.test(l)).length >= Math.ceil(lines.length * 0.6)) return '  ';
  return null;
}

/** Split one row, honouring "quoted, cells". */
export function splitRow(line: string, delimiter: string | null): string[] {
  if (!delimiter) return [line.trim()];
  if (delimiter === '  ') return line.split(/\s{2,}/).map((c) => c.trim()).filter((c) => c.length > 0);

  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

// ---------------------------------------------------------------------- times

const TIME_RE = /\b(\d{1,2})\s*[:.]\s*(\d{2})\s*([ap]\.?\s?m\.?)?|\b(\d{3,4})\s*([ap]\.?\s?m\.?)\b/gi;

export interface FoundTime {
  minutes: number;
  /** The author wrote am/pm, so do not second-guess it. */
  explicit: boolean;
  index: number;
  length: number;
}

/** Every clock time in a line, in order, as minutes past midnight. */
export function findTimes(line: string): FoundTime[] {
  const out: FoundTime[] = [];
  TIME_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TIME_RE.exec(line)) !== null) {
    let hour: number;
    let minute: number;
    let suffix: string | undefined;

    if (m[1] !== undefined) {
      hour = Number.parseInt(m[1], 10);
      minute = Number.parseInt(m[2], 10);
      suffix = m[3];
    } else {
      const digits = m[4];
      hour = Number.parseInt(digits.slice(0, digits.length - 2), 10);
      minute = Number.parseInt(digits.slice(-2), 10);
      suffix = m[5];
    }
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) continue;
    if (minute > 59 || hour > 23) continue;

    const clean = suffix?.toLowerCase().replace(/[.\s]/g, '');
    let explicit = false;
    if (clean === 'pm') {
      if (hour < 12) hour += 12;
      explicit = true;
    } else if (clean === 'am') {
      if (hour === 12) hour = 0;
      explicit = true;
    }
    out.push({ minutes: hour * 60 + minute, explicit, index: m.index, length: m[0].length });
  }
  return out;
}

export function minutesToHHMM(total: number): string {
  const wrapped = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Schools write "1:05" for the afternoon. A school day runs forwards, so any
 * time that would go backwards gets twelve hours added — unless the author
 * actually wrote am or pm.
 */
function forwardFrom(previous: number, t: FoundTime): number {
  if (t.explicit) return t.minutes;
  let v = t.minutes;
  while (v < previous && v + 720 <= 24 * 60) v += 720;
  return v;
}

// -------------------------------------------------------------- bell schedule

const KIND_HINTS: { re: RegExp; kind: BlockKind }[] = [
  { re: /\blunch|cafeteria|café|cafe\b/i, kind: 'lunch' },
  { re: /\brecess|playground|outside time\b/i, kind: 'recess' },
  { re: /\bhomeroom|home ?room|advisory|advisement|morning meeting|hr\b/i, kind: 'homeroom' },
  { re: /\b(specials?|encore|exploratory|elective|art|music|p\.?e\.?|gym|library|media)\b/i, kind: 'specials' },
  { re: /\b(arrival|drop[- ]?off|breakfast|am bus|bus in|morning bus)\b/i, kind: 'bus-dropoff' },
  { re: /\b(dismissal|pick[- ]?up|pm bus|bus out|afternoon bus|car rider|bus)\b/i, kind: 'bus-pickup' },
];

function guessKind(name: string): BlockKind {
  for (const { re, kind } of KIND_HINTS) if (re.test(name)) return kind;
  return 'period';
}

function cleanBlockName(raw: string): string {
  return raw
    .replace(/[\t|]+/g, ' ')
    .replace(/^[\s,;:\-–—]+|[\s,;:\-–—]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export interface ParsedBlock {
  name: string;
  startTime: string;
  endTime: string;
  kind: BlockKind;
  sourceLine: string;
}

export interface BellScheduleResult {
  blocks: ParsedBlock[];
  /** Lines that held no usable time, so the person can see what was skipped. */
  skipped: string[];
  warnings: string[];
}

/**
 * Read a school's bell schedule out of pasted text.
 *
 * Handles "1st Period 8:00 - 8:50", "Period 1,8:00 AM,8:50 AM", tab-separated
 * spreadsheet rows, "8:00-8:50 Homeroom", and lists that give only start times.
 */
export function parseBellSchedule(text: string): BellScheduleResult {
  const lines = splitLines(text);
  const blocks: ParsedBlock[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];

  interface Draft {
    name: string;
    start: number;
    end: number | null;
    sourceLine: string;
  }
  const drafts: Draft[] = [];
  let cursor = 0;

  for (const line of lines) {
    const times = findTimes(line);
    if (times.length === 0) {
      skipped.push(line);
      continue;
    }

    // Name is whatever text is left once the times are removed.
    let remainder = line;
    for (let i = times.length - 1; i >= 0; i--) {
      const t = times[i];
      remainder = remainder.slice(0, t.index) + '\u0000' + remainder.slice(t.index + t.length);
    }
    const name = cleanBlockName(remainder.replace(/\u0000/g, ' '));

    const start = forwardFrom(cursor, times[0]);
    let end: number | null = null;
    if (times.length >= 2) {
      end = forwardFrom(start, times[1]);
      if (end === start) end = null;
    }
    cursor = end ?? start;

    drafts.push({ name: name || `Block ${drafts.length + 1}`, start, end, sourceLine: line });
  }

  if (drafts.length === 0) {
    return {
      blocks: [],
      skipped,
      warnings: ['No times were found. Each line needs a time like 8:00, or 8:00-8:50.'],
    };
  }

  // A start-only list means each block runs until the next one begins.
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    let end = d.end;
    if (end === null) {
      const next = drafts[i + 1];
      if (next && next.start > d.start) end = next.start;
      else end = d.start + 45;
      warnings.push(`“${d.name}” had only a start time, so it runs until ${minutesToHHMM(end)}.`);
    }
    blocks.push({
      name: d.name,
      startTime: minutesToHHMM(d.start),
      endTime: minutesToHHMM(end),
      kind: guessKind(d.name),
      sourceLine: d.sourceLine,
    });
  }

  // Duplicate names make the per-student plan confusing, so number them.
  const seen = new Map<string, number>();
  for (const b of blocks) {
    const key = b.name.toLowerCase();
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n > 1) b.name = `${b.name} (${n})`;
  }

  return { blocks, skipped, warnings };
}

export function toScheduleBlocks(parsed: ParsedBlock[]): ScheduleBlock[] {
  return parsed.map((b) => ({
    id: createId('blk'),
    name: b.name,
    startTime: b.startTime,
    endTime: b.endTime,
    kind: b.kind,
    appliesTo: 'all',
    studentIds: [],
  }));
}

// --------------------------------------------------------------------- people

const HEADER_ALIASES: Record<string, string[]> = {
  name: ['name', 'student', 'student name', 'studentname', 'pupil', 'child', 'full name', 'fullname'],
  firstName: ['first', 'first name', 'firstname', 'given name', 'given'],
  lastName: ['last', 'last name', 'lastname', 'surname', 'family name'],
  dayType: ['day', 'day type', 'daytype', 'schedule', 'full/short', 'program'],
  arrival: ['arrival', 'arrive', 'arrives', 'arrival time', 'start', 'start time', 'in', 'time in'],
  departure: ['departure', 'depart', 'departs', 'leaves', 'leave', 'dismissal', 'end', 'end time', 'out', 'time out'],
  busPickup: ['bus pickup', 'buspickup', 'am bus', 'pickup', 'pick up', 'bus am'],
  busDropoff: ['bus dropoff', 'busdropoff', 'pm bus', 'dropoff', 'drop off', 'bus pm'],
  traits: ['traits', 'trait', 'flags', 'behaviors', 'behaviours', 'concerns', 'tags'],
  needs: ['needs', 'need tags', 'needtags', 'supports', 'support', 'services'],
  notes: ['notes', 'note', 'comments', 'comment', 'remarks', 'iep notes'],
  oneToOne: ['1:1', 'one to one', 'onetoone', 'requiresonetoone', '1 to 1', 'needs 1:1', 'aide required'],
  grade: ['grade', 'grade level', 'yr', 'year'],
};

function canon(header: string): string | null {
  const h = header.toLowerCase().replace(/[_\-.]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(h)) return field;
  }
  return null;
}

/** A row of field names rather than data. */
export function looksLikeHeader(cells: string[]): boolean {
  if (cells.length === 0) return false;
  const named = cells.filter((c) => canon(c) !== null).length;
  if (named >= Math.max(1, Math.ceil(cells.length / 2))) return true;
  return named >= 2;
}

function splitList(value: string): string[] {
  return value
    .split(/[;,|/]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function truthy(v: string): boolean {
  const s = v.trim().toLowerCase();
  return s === 'y' || s === 'yes' || s === 'true' || s === '1' || s === 'x' || s === '1:1';
}

export function normalizeTimeCell(value: string): string | undefined {
  const times = findTimes(value);
  if (times.length === 0) return undefined;
  return minutesToHHMM(times[0].minutes);
}

/** "Brewer, Ashley" in a one-column list is a surname-first roster. */
export function looksSurnameFirst(names: string[]): boolean {
  const withComma = names.filter((n) => /^[^,]+,\s*[^,]+$/.test(n));
  if (withComma.length < Math.max(2, Math.ceil(names.length * 0.6))) return false;
  return withComma.every((n) => !/\d/.test(n));
}

export function flipSurnameFirst(name: string): string {
  const m = name.match(/^([^,]+),\s*(.+)$/);
  if (!m) return name;
  return `${m[2].trim()} ${m[1].trim()}`.replace(/\s{2,}/g, ' ').trim();
}

export interface ParsedStudent {
  name: string;
  dayType: 'full' | 'shortened';
  arrivalTime?: string;
  departureTime?: string;
  busPickup?: string;
  busDropoff?: string;
  traits: string[];
  needTags: string[];
  needsNotes: string;
  requiresOneToOne: boolean;
}

export interface RosterResult {
  students: ParsedStudent[];
  /** Headers that were understood, for the preview. */
  columns: string[];
  surnameFirst: boolean;
  warnings: string[];
}

/**
 * Read a student roster out of pasted text. A bare column of names is enough;
 * extra columns are used when their headings are recognisable.
 */
export function parseRoster(text: string, options: { flipNames?: boolean } = {}): RosterResult {
  const lines = splitLines(text);
  const warnings: string[] = [];
  if (lines.length === 0) return { students: [], columns: [], surnameFirst: false, warnings: ['Nothing to read.'] };

  // "Hale, Marcus" is one name, not two columns. Decide that before splitting,
  // otherwise the comma in a surname-first roster eats every first name.
  const rawSurnameFirst = looksSurnameFirst(lines) && !looksLikeHeader(splitRow(lines[0], ','));
  const delimiter = rawSurnameFirst ? null : detectDelimiter(lines);
  const rows = lines.map((l) => splitRow(l, delimiter));

  let header: Map<string, number> | null = null;
  let columns: string[] = [];
  let startRow = 0;
  if (rows.length > 1 && looksLikeHeader(rows[0])) {
    header = new Map();
    rows[0].forEach((cell, i) => {
      const field = canon(cell);
      if (field && !header!.has(field)) {
        header!.set(field, i);
        columns.push(field);
      }
    });
    startRow = 1;
  }

  const body = rows.slice(startRow);
  const nameIndex = header?.get('name');
  const firstIndex = header?.get('firstName');
  const lastIndex = header?.get('lastName');

  const rawNames = body.map((cells) => {
    if (firstIndex !== undefined && lastIndex !== undefined) {
      return `${cells[firstIndex] ?? ''} ${cells[lastIndex] ?? ''}`.trim();
    }
    if (nameIndex !== undefined) return (cells[nameIndex] ?? '').trim();
    return (cells[0] ?? '').trim();
  });

  const surnameFirst = rawSurnameFirst && !header;
  const flip = options.flipNames ?? false;

  const students: ParsedStudent[] = [];
  body.forEach((cells, i) => {
    let name = rawNames[i];
    if (!name) return;
    if (flip) name = flipSurnameFirst(name);

    const get = (field: string): string => {
      const idx = header?.get(field);
      return idx === undefined ? '' : (cells[idx] ?? '').trim();
    };

    const dayRaw = get('dayType').toLowerCase();
    const departure = normalizeTimeCell(get('departure'));
    const dayType: 'full' | 'shortened' =
      /short|half|part|am only|pm only/.test(dayRaw) || (departure !== undefined && departure < '13:00')
        ? 'shortened'
        : 'full';

    students.push({
      name,
      dayType,
      arrivalTime: normalizeTimeCell(get('arrival')),
      departureTime: departure,
      busPickup: normalizeTimeCell(get('busPickup')),
      busDropoff: normalizeTimeCell(get('busDropoff')),
      traits: splitList(get('traits')),
      needTags: splitList(get('needs')),
      needsNotes: get('notes'),
      requiresOneToOne: truthy(get('oneToOne')) || /1:1/.test(get('traits')),
    });
  });

  if (students.length === 0) warnings.push('No names were found. Put one student per line.');
  if (!header && (delimiter === ',' || delimiter === '\t') && rows[0].length > 1 && !surnameFirst) {
    warnings.push('No column headings were recognised, so the first column was used as the name.');
  }

  return { students, columns, surnameFirst, warnings };
}

export function toStudents(parsed: ParsedStudent[]): Student[] {
  return parsed.map((p) => ({
    id: createId('stu'),
    name: p.name,
    dayType: p.dayType,
    blockIds: [],
    arrivalTime: p.arrivalTime,
    departureTime: p.departureTime,
    busPickup: p.busPickup,
    busDropoff: p.busDropoff,
    needsNotes: p.needsNotes,
    needTags: p.needTags,
    traits: p.traits,
    preferredAideIds: [],
    coverageMode: 'always',
    coverageBlockIds: [],
    requiresOneToOne: p.requiresOneToOne,
    plan: [],
  }));
}

export interface StaffResult {
  staff: { name: string; role: 'teacher' | 'aide' }[];
  warnings: string[];
}

/** One name per line. "Ashley Brewer - teacher" marks the role. */
export function parseStaffList(text: string): StaffResult {
  const lines = splitLines(text);
  const staff: { name: string; role: 'teacher' | 'aide' }[] = [];
  const delimiter = detectDelimiter(lines);

  for (const line of lines) {
    const cells = splitRow(line, delimiter);
    const first = cells[0]?.trim();
    if (!first) continue;
    if (canon(first) === 'name' && staff.length === 0) continue; // a heading row
    const rest = cells.slice(1).join(' ').toLowerCase();
    const inlineRole = /[-–—(]\s*(teacher|lead|co-?teacher)\b/i.test(line);
    const role: 'teacher' | 'aide' = /teacher|lead/.test(rest) || inlineRole ? 'teacher' : 'aide';
    const name = first.replace(/\s*[-–—(]\s*(teacher|lead|co-?teacher|aide|para\w*)\s*\)?\s*$/i, '').trim();
    if (!name) continue;
    staff.push({ name, role });
  }

  return {
    staff,
    warnings: staff.length === 0 ? ['No names were found. Put one adult per line.'] : [],
  };
}

export function toStaff(parsed: { name: string; role: 'teacher' | 'aide' }[], resourceRoomId: string): Aide[] {
  return parsed.map((p) => {
    const base = blankAideRecord(createId('staff'), p.name);
    if (p.role === 'teacher') {
      return { ...base, role: 'teacher', canLeaveRoom: false, maxCaseload: 10, homeLocationId: resourceRoomId };
    }
    return { ...base, homeLocationId: resourceRoomId };
  });
}
