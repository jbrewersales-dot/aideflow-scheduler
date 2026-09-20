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

/**
 * Who is in a block. 'listed' means exactly the students named on the block,
 * which is the only honest answer when a block is neither "all full-day" nor
 * "all shortened-day" students.
 */
export type AppliesTo = 'all' | 'full' | 'shortened' | 'listed';

export type CoverageMode = 'always' | 'listed' | 'none';

export type ConflictSeverity = 'hard' | 'soft';

export type TraitConflictScope = 'aide' | 'group';

/** Teachers lead the room; aides support students and may travel with them. */
export type StaffRole = 'teacher' | 'aide';

/** Where a student physically is during a block. */
export type LocationKind = 'resource' | 'general-ed' | 'specials' | 'therapy' | 'bus' | 'other';

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
  /** Used when appliesTo is 'listed'. Empty means nobody is in this block. */
  studentIds: string[];
}

export interface SchoolLocation {
  id: string;
  name: string;
  kind: LocationKind;
  /** Free text such as a room number or teacher name. */
  note: string;
}

/**
 * One row of a student's own day: what they are doing during a block, where,
 * and whether an adult has to be with them. A student's plan is the source of
 * truth — the day grid is built from the students outward, not the reverse.
 */
export interface StudentBlockPlan {
  blockId: string;
  /** null = fall back to arrival/departure times, then the day-type pattern. */
  attends: boolean | null;
  /** What the student is doing, e.g. "Math with Mrs. Brewer" or "Gen-ed ELA". */
  activity: string;
  /** Where they are. Empty = the classroom's default location. */
  locationId: string;
  /** null = fall back to the student's coverage mode. */
  needsAide: boolean | null;
  /**
   * The assigned staff member must physically travel with the student.
   * Teachers who cannot leave the room are never chosen for these.
   */
  aideAccompanies: boolean;
  note: string;
}

export interface Student {
  id: string;
  name: string;
  dayType: DayType;
  /** Explicit blocks this student attends. Empty = infer from times / day type. */
  blockIds: string[];
  /** When the student is in the building. Blank = follow the day-type pattern. */
  arrivalTime?: string;
  departureTime?: string;
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
  /** Per-block plan rows. Blocks with no row fall back to the defaults above. */
  plan: StudentBlockPlan[];
}

export interface Aide {
  id: string;
  name: string;
  role: StaffRole;
  /** Empty = available every block. */
  availableBlockIds: string[];
  maxCaseload: number;
  trainedTags: string[];
  notes: string;
  preferredStudentIds: string[];
  /** Out today. Absent staff are never assigned, and backup plans use this. */
  absent: boolean;
  /**
   * False for a teacher who must stay with the class — they can only take
   * students whose location matches their home location.
   */
  canLeaveRoom: boolean;
  /** Where this staff member is based when not escorting a student. */
  homeLocationId: string;
  /** A teacher can be present without being counted as a student's aide. */
  countsAsCoverage: boolean;
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
  /** A teacher may supervise more students at once than an aide. */
  maxStudentsPerTeacher: number;
  weights: {
    preferredMatch: number;
    caseloadBalance: number;
    minimizeTransitions: number;
    trainedTagMatch: number;
    keepWithTeacher: number;
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
  /** Staff who were out when this schedule was built. */
  absentStaffIds: string[];
}

/** A saved "what if this person is out" schedule. */
export interface BackupPlan {
  id: string;
  absentStaffIds: string[];
  schedule: Schedule | null;
  reasons: Conflict[];
  generatedAt: string;
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
  | 'location-split'
  | 'cannot-leave-room'
  | 'staff-absent'
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
  version: 2;
  teacherName: string;
  schoolName: string;
  students: Student[];
  aides: Aide[];
  blocks: ScheduleBlock[];
  locations: SchoolLocation[];
  keepApart: KeepApartPair[];
  traitConflicts: TraitConflictRule[];
  params: SchedulerParams;
  schedule: Schedule | null;
  backupPlans: BackupPlan[];
}

export const STORAGE_KEY = 'aideflow.v1';
export const APP_NAME = 'AideFlow';
