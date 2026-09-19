export type DayType = 'full' | 'shortened';

export type BlockKind =
  | 'period'
  | 'bus-pickup'
  | 'bus-dropoff'
  | 'homeroom'
  | 'lunch'
  | 'recess'
  | 'specials'
  | 'other';

export type AppliesTo = 'all' | 'full' | 'shortened';

export type CoverageMode = 'always' | 'listed' | 'none';

export type ConflictSeverity = 'hard' | 'soft';

export type TraitConflictScope = 'aide' | 'group';

export const BUILT_IN_TRAITS = [
  'elopes',
  'aggressive',
  'sensory-sensitive',
  'needs-1to1',
  'wheelchair',
  'nonverbal',
  'medical',
  'flight-risk',
] as const;

export type BuiltInTrait = (typeof BUILT_IN_TRAITS)[number];

export interface ScheduleBlock {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  kind: BlockKind;
  appliesTo: AppliesTo;
}

export interface Student {
  id: string;
  name: string;
  dayType: DayType;
  /** Explicit blocks this student attends. Empty = infer from day type. */
  blockIds: string[];
  busPickup?: string;
  busDropoff?: string;
  needsNotes: string;
  needTags: string[];
  traits: string[];
  preferredAideIds: string[];
  coverageMode: CoverageMode;
  /** When coverageMode is 'listed', these blocks require an aide. */
  coverageBlockIds: string[];
  requiresOneToOne: boolean;
}

export interface Aide {
  id: string;
  name: string;
  /** Empty = available every block. */
  availableBlockIds: string[];
  maxCaseload: number;
  trainedTags: string[];
  notes: string;
  preferredStudentIds: string[];
}

export interface KeepApartPair {
  id: string;
  studentAId: string;
  studentBId: string;
  reason: string;
}

export interface TraitConflictRule {
  id: string;
  traitA: string;
  traitB: string;
  scope: TraitConflictScope;
  severity: ConflictSeverity;
  note: string;
}

export interface SchedulerParams {
  maxStudentsPerAide: number;
  maxGroupSize: number;
  traitConflictsAreHard: boolean;
  elopesRequiresOneToOne: boolean;
  weights: {
    preferredMatch: number;
    caseloadBalance: number;
    minimizeTransitions: number;
    trainedTagMatch: number;
  };
}

export interface Assignment {
  studentId: string;
  aideId: string;
  blockId: string;
}

export interface Schedule {
  assignments: Assignment[];
  score: number;
  generatedAt: string;
  notes: string[];
}

export type ConflictKind =
  | 'aide-unavailable'
  | 'over-caseload'
  | 'over-group-size'
  | 'keep-apart'
  | 'trait-conflict'
  | 'missing-coverage'
  | 'one-to-one-shared'
  | 'elopes-not-one-to-one'
  | 'student-not-present'
  | 'unknown-ref';

export interface Conflict {
  kind: ConflictKind;
  severity: ConflictSeverity;
  blockId?: string;
  studentIds: string[];
  aideId?: string;
  ruleId?: string;
  message: string;
}

export interface SolveSuccess {
  ok: true;
  schedule: Schedule;
}

export interface SolveFailure {
  ok: false;
  reasons: Conflict[];
  searchedNodes: number;
}

export type SolveResult = SolveSuccess | SolveFailure;

export interface AppData {
  version: 1;
  teacherName: string;
  schoolName: string;
  students: Student[];
  aides: Aide[];
  blocks: ScheduleBlock[];
  keepApart: KeepApartPair[];
  traitConflicts: TraitConflictRule[];
  params: SchedulerParams;
  schedule: Schedule | null;
}

export const STORAGE_KEY = 'aideflow.v1';
export const APP_NAME = 'AideFlow';
