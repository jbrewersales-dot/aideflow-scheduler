import { createDemoData, emptyData } from './data/demo';
import { RESOURCE_ROOM_ID, defaultLocations, defaultParams, defaultTeacher } from './data/defaults';
import type { AppData, Aide, Student } from './types';
import { STORAGE_KEY } from './types';

interface UnknownRecord {
  [key: string]: unknown;
}

function looksLikeAppData(value: unknown): value is UnknownRecord {
  if (!value || typeof value !== 'object') return false;
  const v = value as UnknownRecord;
  return (
    Array.isArray(v.students) &&
    Array.isArray(v.aides) &&
    Array.isArray(v.blocks) &&
    Array.isArray(v.keepApart) &&
    Array.isArray(v.traitConflicts) &&
    Boolean(v.params)
  );
}

function migrateAide(raw: UnknownRecord, index: number): Aide {
  const role = raw.role === 'teacher' ? 'teacher' : 'aide';
  return {
    id: typeof raw.id === 'string' ? raw.id : `aide_${index}`,
    name: typeof raw.name === 'string' ? raw.name : `Aide ${index + 1}`,
    role,
    availableBlockIds: Array.isArray(raw.availableBlockIds) ? (raw.availableBlockIds as string[]) : [],
    maxCaseload: typeof raw.maxCaseload === 'number' ? raw.maxCaseload : 4,
    trainedTags: Array.isArray(raw.trainedTags) ? (raw.trainedTags as string[]) : [],
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    preferredStudentIds: Array.isArray(raw.preferredStudentIds) ? (raw.preferredStudentIds as string[]) : [],
    absent: raw.absent === true,
    canLeaveRoom: typeof raw.canLeaveRoom === 'boolean' ? raw.canLeaveRoom : role !== 'teacher',
    homeLocationId: typeof raw.homeLocationId === 'string' && raw.homeLocationId ? raw.homeLocationId : RESOURCE_ROOM_ID,
    countsAsCoverage: typeof raw.countsAsCoverage === 'boolean' ? raw.countsAsCoverage : true,
  };
}

function migrateBlock(raw: UnknownRecord, index: number): AppData['blocks'][number] {
  const applies = raw.appliesTo;
  return {
    id: typeof raw.id === 'string' ? raw.id : `blk_${index}`,
    name: typeof raw.name === 'string' ? raw.name : `Block ${index + 1}`,
    startTime: typeof raw.startTime === 'string' ? raw.startTime : '08:00',
    endTime: typeof raw.endTime === 'string' ? raw.endTime : '08:45',
    kind: (typeof raw.kind === 'string' ? raw.kind : 'period') as AppData['blocks'][number]['kind'],
    appliesTo:
      applies === 'full' || applies === 'shortened' || applies === 'listed' ? applies : 'all',
    studentIds: Array.isArray(raw.studentIds) ? (raw.studentIds as string[]) : [],
  };
}

function migrateStudent(raw: UnknownRecord, index: number): Student {
  const coverageRaw = raw.coverageMode;
  const coverageMode = coverageRaw === 'listed' || coverageRaw === 'none' ? coverageRaw : 'always';
  const plan = Array.isArray(raw.plan)
    ? (raw.plan as UnknownRecord[])
        .filter((p) => p && typeof p.blockId === 'string')
        .map((p) => ({
          blockId: p.blockId as string,
          attends: typeof p.attends === 'boolean' ? p.attends : null,
          activity: typeof p.activity === 'string' ? p.activity : '',
          locationId: typeof p.locationId === 'string' ? p.locationId : '',
          needsAide: typeof p.needsAide === 'boolean' ? p.needsAide : null,
          aideAccompanies: p.aideAccompanies === true,
          note: typeof p.note === 'string' ? p.note : '',
        }))
    : [];

  return {
    id: typeof raw.id === 'string' ? raw.id : `stu_${index}`,
    name: typeof raw.name === 'string' ? raw.name : `Student ${index + 1}`,
    dayType: raw.dayType === 'shortened' ? 'shortened' : 'full',
    blockIds: Array.isArray(raw.blockIds) ? (raw.blockIds as string[]) : [],
    arrivalTime: typeof raw.arrivalTime === 'string' ? raw.arrivalTime : undefined,
    departureTime: typeof raw.departureTime === 'string' ? raw.departureTime : undefined,
    busPickup: typeof raw.busPickup === 'string' ? raw.busPickup : undefined,
    busDropoff: typeof raw.busDropoff === 'string' ? raw.busDropoff : undefined,
    needsNotes: typeof raw.needsNotes === 'string' ? raw.needsNotes : '',
    needTags: Array.isArray(raw.needTags) ? (raw.needTags as string[]) : [],
    traits: Array.isArray(raw.traits) ? (raw.traits as string[]) : [],
    preferredAideIds: Array.isArray(raw.preferredAideIds) ? (raw.preferredAideIds as string[]) : [],
    coverageMode,
    coverageBlockIds: Array.isArray(raw.coverageBlockIds) ? (raw.coverageBlockIds as string[]) : [],
    requiresOneToOne: raw.requiresOneToOne === true,
    plan,
  };
}

/**
 * Bring any older saved file up to the current shape. Version 1 files had no
 * teacher, no rooms and no per-student plans, so those are filled in rather
 * than throwing the classroom away.
 */
export function migrate(raw: unknown): AppData {
  if (!looksLikeAppData(raw)) throw new Error('This file is not a valid AideFlow backup.');

  const aides = (raw.aides as UnknownRecord[]).map(migrateAide);
  if (!aides.some((a) => a.role === 'teacher')) {
    const teacherName = typeof raw.teacherName === 'string' && raw.teacherName ? raw.teacherName : 'Ashley Brewer';
    aides.unshift(defaultTeacher(teacherName));
  }

  const locations = Array.isArray(raw.locations) && raw.locations.length > 0
    ? (raw.locations as AppData['locations'])
    : defaultLocations();

  const baseParams = defaultParams();
  const rawParams = (raw.params ?? {}) as UnknownRecord;
  const rawWeights = (rawParams.weights ?? {}) as UnknownRecord;

  return {
    version: 2,
    teacherName: typeof raw.teacherName === 'string' ? raw.teacherName : 'Ashley Brewer',
    schoolName: typeof raw.schoolName === 'string' ? raw.schoolName : '',
    students: (raw.students as UnknownRecord[]).map(migrateStudent),
    aides,
    blocks: (raw.blocks as UnknownRecord[]).map(migrateBlock),
    locations,
    keepApart: raw.keepApart as AppData['keepApart'],
    traitConflicts: raw.traitConflicts as AppData['traitConflicts'],
    params: {
      maxStudentsPerAide:
        typeof rawParams.maxStudentsPerAide === 'number' ? rawParams.maxStudentsPerAide : baseParams.maxStudentsPerAide,
      maxGroupSize: typeof rawParams.maxGroupSize === 'number' ? rawParams.maxGroupSize : baseParams.maxGroupSize,
      maxStudentsPerTeacher:
        typeof rawParams.maxStudentsPerTeacher === 'number'
          ? rawParams.maxStudentsPerTeacher
          : baseParams.maxStudentsPerTeacher,
      traitConflictsAreHard: rawParams.traitConflictsAreHard !== false,
      elopesRequiresOneToOne: rawParams.elopesRequiresOneToOne !== false,
      weights: {
        preferredMatch:
          typeof rawWeights.preferredMatch === 'number' ? rawWeights.preferredMatch : baseParams.weights.preferredMatch,
        caseloadBalance:
          typeof rawWeights.caseloadBalance === 'number' ? rawWeights.caseloadBalance : baseParams.weights.caseloadBalance,
        minimizeTransitions:
          typeof rawWeights.minimizeTransitions === 'number'
            ? rawWeights.minimizeTransitions
            : baseParams.weights.minimizeTransitions,
        trainedTagMatch:
          typeof rawWeights.trainedTagMatch === 'number' ? rawWeights.trainedTagMatch : baseParams.weights.trainedTagMatch,
        keepWithTeacher:
          typeof rawWeights.keepWithTeacher === 'number' ? rawWeights.keepWithTeacher : baseParams.weights.keepWithTeacher,
      },
    },
    // A schedule built under older rules is dropped rather than trusted.
    schedule: null,
    backupPlans: [],
  };
}

export function loadStoredData(): AppData {
  if (typeof localStorage === 'undefined') return createDemoData();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDemoData();
    return migrate(JSON.parse(raw) as unknown);
  } catch {
    return createDemoData();
  }
}

export function saveStoredData(data: AppData): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage can be full or blocked (private windows). The app keeps working
    // in memory; the user is told to export a backup on the Data tab.
  }
}

export function exportJson(data: AppData): string {
  return JSON.stringify(data, null, 2);
}

export function importJson(text: string): AppData {
  return migrate(JSON.parse(text) as unknown);
}

export function resetDemo(): AppData {
  return createDemoData();
}

export function resetEmpty(): AppData {
  return emptyData();
}

export function downloadText(filename: string, text: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
