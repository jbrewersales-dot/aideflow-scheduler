import type { Aide, SchedulerParams, ScheduleBlock, SchoolLocation, TraitConflictRule } from '../types';
import { createId } from '../ids';

export const RESOURCE_ROOM_ID = 'loc_resource';

export function defaultParams(): SchedulerParams {
  return {
    maxStudentsPerAide: 4,
    // A ceiling on any one group. The teacher leads a whole class, so this is
    // class-sized; aides are held to the smaller per-aide limit above.
    maxGroupSize: 10,
    maxStudentsPerTeacher: 10,
    traitConflictsAreHard: true,
    elopesRequiresOneToOne: true,
    weights: {
      preferredMatch: 8,
      caseloadBalance: 5,
      minimizeTransitions: 6,
      trainedTagMatch: 3,
      keepWithTeacher: 4,
    },
  };
}

export function defaultLocations(): SchoolLocation[] {
  return [
    { id: RESOURCE_ROOM_ID, name: 'Resource room', kind: 'resource', note: 'Ashley’s room' },
    { id: 'loc_gened_a', name: 'Gen-ed classroom A', kind: 'general-ed', note: '' },
    { id: 'loc_gened_b', name: 'Gen-ed classroom B', kind: 'general-ed', note: '' },
    { id: 'loc_specials', name: 'Specials (art / music / PE)', kind: 'specials', note: '' },
    { id: 'loc_therapy', name: 'Speech / OT room', kind: 'therapy', note: '' },
    { id: 'loc_cafeteria', name: 'Cafeteria', kind: 'other', note: '' },
    { id: 'loc_playground', name: 'Playground', kind: 'other', note: '' },
    { id: 'loc_bus', name: 'Bus loop', kind: 'bus', note: '' },
  ];
}

/** Ashley is on the schedule like anyone else, but she cannot leave her room. */
export function defaultTeacher(name = 'Ashley Brewer'): Aide {
  return {
    id: 'staff_teacher',
    name,
    role: 'teacher',
    availableBlockIds: [],
    maxCaseload: 10,
    trainedTags: [],
    notes: 'Classroom teacher. Stays in the resource room, so students who leave need an aide.',
    preferredStudentIds: [],
    absent: false,
    canLeaveRoom: false,
    homeLocationId: RESOURCE_ROOM_ID,
    countsAsCoverage: true,
  };
}

export function blankAideRecord(id: string, name: string): Aide {
  return {
    id,
    name,
    role: 'aide',
    availableBlockIds: [],
    maxCaseload: 4,
    trainedTags: [],
    notes: '',
    preferredStudentIds: [],
    absent: false,
    canLeaveRoom: true,
    homeLocationId: RESOURCE_ROOM_ID,
    countsAsCoverage: true,
  };
}

export function defaultBlocks(): ScheduleBlock[] {
  return [
    { id: 'blk_bus_am', name: 'AM bus / arrival', startTime: '07:45', endTime: '08:00', kind: 'bus-dropoff', appliesTo: 'all', studentIds: [] },
    { id: 'blk_hr', name: 'Homeroom', startTime: '08:00', endTime: '08:15', kind: 'homeroom', appliesTo: 'all', studentIds: [] },
    { id: 'blk_p1', name: 'Period 1 · ELA', startTime: '08:15', endTime: '09:00', kind: 'period', appliesTo: 'all', studentIds: [] },
    { id: 'blk_p2', name: 'Period 2 · Math', startTime: '09:00', endTime: '09:45', kind: 'period', appliesTo: 'all', studentIds: [] },
    { id: 'blk_recess', name: 'Morning recess', startTime: '09:45', endTime: '10:00', kind: 'recess', appliesTo: 'all', studentIds: [] },
    { id: 'blk_p3', name: 'Period 3 · Science / SS', startTime: '10:00', endTime: '10:45', kind: 'period', appliesTo: 'all', studentIds: [] },
    { id: 'blk_p4', name: 'Period 4 · Groups', startTime: '10:45', endTime: '11:30', kind: 'period', appliesTo: 'all', studentIds: [] },
    { id: 'blk_lunch', name: 'Lunch', startTime: '11:30', endTime: '12:00', kind: 'lunch', appliesTo: 'all', studentIds: [] },
    { id: 'blk_bus_short', name: 'Midday bus (shortened day)', startTime: '12:00', endTime: '12:15', kind: 'bus-pickup', appliesTo: 'shortened', studentIds: [] },
    { id: 'blk_p5', name: 'Period 5 · ELA 2', startTime: '12:15', endTime: '13:00', kind: 'period', appliesTo: 'full', studentIds: [] },
    { id: 'blk_p6', name: 'Period 6 · Math 2', startTime: '13:00', endTime: '13:45', kind: 'period', appliesTo: 'full', studentIds: [] },
    { id: 'blk_specials', name: 'Specials / wrap-up', startTime: '13:45', endTime: '14:15', kind: 'specials', appliesTo: 'full', studentIds: [] },
    { id: 'blk_bus_pm', name: 'PM bus / dismissal', startTime: '14:15', endTime: '14:30', kind: 'bus-pickup', appliesTo: 'full', studentIds: [] },
  ];
}

export function defaultTraitConflicts(): TraitConflictRule[] {
  return [
    {
      id: createId('tc'),
      traitA: 'aggressive',
      traitB: 'aggressive',
      scope: 'aide',
      severity: 'hard',
      note: 'Two students tagged aggressive cannot share an adult.',
    },
    {
      id: createId('tc'),
      traitA: 'elopes',
      traitB: 'aggressive',
      scope: 'aide',
      severity: 'hard',
      note: 'An eloper should not share an adult with an aggressive peer.',
    },
    {
      id: createId('tc'),
      traitA: 'sensory-sensitive',
      traitB: 'aggressive',
      scope: 'group',
      severity: 'soft',
      note: 'Prefer not to group sensory-sensitive students with aggressive peers.',
    },
  ];
}
