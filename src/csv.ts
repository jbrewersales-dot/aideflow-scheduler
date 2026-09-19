import { createId } from './ids';
import type { AppData, Student } from './types';

export const STUDENT_CSV_HEADERS = [
  'name',
  'dayType',
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
Marcus Hale,full,,"07:40","14:25","behavior;1:1","aggressive;needs-1to1","Needs a consistent 1:1. Keep apart from Ethan.",true,always,"Denise Morales"
Lily Chen,full,,"07:45","14:20","mobility;sensory","sensory-sensitive;wheelchair","Manual wheelchair. Headphones at recess.",false,always,"Keisha Ward"
Jordan Blake,shortened,,"07:50","12:10","elopement;1:1","elopes;needs-1to1;flight-risk","Must have 1:1 from bus to bus.",true,always,"Priya Shah"
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

export function parseStudentCsv(text: string, data: AppData): { students: Student[]; errors: string[] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
  const errors: string[] = [];
  if (lines.length === 0) {
    return { students: [], errors: ['The CSV file is empty.'] };
  }

  const header = parseCsvLine(lines[0]).map((h) => h.replace(/^\uFEFF/, ''));
  const index = new Map(header.map((h, i) => [h, i]));
  const required = ['name'];
  for (const col of required) {
    if (!index.has(col)) {
      return { students: [], errors: [`Missing required column “${col}”. Download the template and try again.`] };
    }
  }

  const get = (cols: string[], key: string): string => {
    const i = index.get(key);
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
        const hit = data.blocks.find(
          (b) => b.id === label || b.name.toLowerCase() === label.toLowerCase(),
        );
        return hit?.id;
      })
      .filter((id): id is string => Boolean(id));

    if (blockNames.length > 0 && blockIds.length !== blockNames.length) {
      errors.push(`Row ${r + 1} (${name}): some block names were not recognized and were skipped.`);
    }

    const preferred = splitList(get(cols, 'preferredAides'))
      .map((label) => data.aides.find((a) => a.id === label || a.name.toLowerCase() === label.toLowerCase())?.id)
      .filter((id): id is string => Boolean(id));

    const oneToOneRaw = get(cols, 'requiresOneToOne').toLowerCase();
    const coverageRaw = (get(cols, 'coverageMode') || 'always').toLowerCase();
    const coverageMode = coverageRaw === 'listed' || coverageRaw === 'none' ? coverageRaw : 'always';

    students.push({
      id: createId('stu'),
      name,
      dayType,
      blockIds: blockIds,
      busPickup: get(cols, 'busPickup') || undefined,
      busDropoff: get(cols, 'busDropoff') || undefined,
      needTags: splitList(get(cols, 'needTags')),
      traits: splitList(get(cols, 'traits')),
      needsNotes: get(cols, 'needsNotes'),
      requiresOneToOne: oneToOneRaw === 'true' || oneToOneRaw === 'yes' || oneToOneRaw === '1',
      coverageMode,
      coverageBlockIds: [],
      preferredAideIds: preferred,
    });
  }

  return { students, errors };
}

export function studentsToCsv(students: Student[], data: AppData): string {
  const header = STUDENT_CSV_HEADERS.join(',');
  const rows = students.map((s) => {
    const blocks = s.blockIds
      .map((id) => data.blocks.find((b) => b.id === id)?.name ?? id)
      .join(';');
    const preferred = s.preferredAideIds
      .map((id) => data.aides.find((a) => a.id === id)?.name ?? id)
      .join(';');
    const cells = [
      s.name,
      s.dayType,
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

export function scheduleToCsv(data: AppData): string {
  const header = 'block,start,end,aide,student,dayType,traits';
  const rows = (data.schedule?.assignments ?? [])
    .slice()
    .sort((a, b) => {
      const ba = data.blocks.find((x) => x.id === a.blockId);
      const bb = data.blocks.find((x) => x.id === b.blockId);
      const t = (ba?.startTime ?? '').localeCompare(bb?.startTime ?? '');
      if (t !== 0) return t;
      const an = data.aides.find((x) => x.id === a.aideId)?.name ?? '';
      const bn = data.aides.find((x) => x.id === b.aideId)?.name ?? '';
      return an.localeCompare(bn);
    })
    .map((a) => {
      const block = data.blocks.find((b) => b.id === a.blockId);
      const aide = data.aides.find((x) => x.id === a.aideId);
      const student = data.students.find((x) => x.id === a.studentId);
      return [
        block?.name ?? a.blockId,
        block?.startTime ?? '',
        block?.endTime ?? '',
        aide?.name ?? a.aideId,
        student?.name ?? a.studentId,
        student?.dayType ?? '',
        (student?.traits ?? []).join(';'),
      ]
        .map(csvEscape)
        .join(',');
    });
  return [header, ...rows].join('\n');
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}
