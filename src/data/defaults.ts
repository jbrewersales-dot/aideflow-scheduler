import type { SchedulerParams, ScheduleBlock, TraitConflictRule } from '../types';
import { createId } from '../ids';

export function defaultParams(): SchedulerParams {
  return {
    maxStudentsPerAide: 4,
    maxGroupSize: 4,
    traitConflictsAreHard: true,
    elopesRequiresOneToOne: true,
    weights: {
      preferredMatch: 8,
      caseloadBalance: 5,
      minimizeTransitions: 6,
      trainedTagMatch: 3,
    },
  };
}

export function defaultBlocks(): ScheduleBlock[] {
  return [
    { id: 'blk_bus_am', name: 'AM bus / arrival', startTime: '07:45', endTime: '08:00', kind: 'bus-dropoff', appliesTo: 'all' },
    { id: 'blk_hr', name: 'Homeroom', startTime: '08:00', endTime: '08:15', kind: 'homeroom', appliesTo: 'all' },
    { id: 'blk_p1', name: 'Period 1 · ELA', startTime: '08:15', endTime: '09:00', kind: 'period', appliesTo: 'all' },
    { id: 'blk_p2', name: 'Period 2 · Math', startTime: '09:00', endTime: '09:45', kind: 'period', appliesTo: 'all' },
    { id: 'blk_recess', name: 'Morning recess', startTime: '09:45', endTime: '10:00', kind: 'recess', appliesTo: 'all' },
    { id: 'blk_p3', name: 'Period 3 · Science / SS', startTime: '10:00', endTime: '10:45', kind: 'period', appliesTo: 'all' },
    { id: 'blk_p4', name: 'Period 4 · Groups', startTime: '10:45', endTime: '11:30', kind: 'period', appliesTo: 'all' },
    { id: 'blk_lunch', name: 'Lunch', startTime: '11:30', endTime: '12:00', kind: 'lunch', appliesTo: 'all' },
    { id: 'blk_bus_short', name: 'Shortened-day bus', startTime: '12:00', endTime: '12:15', kind: 'bus-pickup', appliesTo: 'shortened' },
    { id: 'blk_p5', name: 'Period 5 · ELA 2', startTime: '12:15', endTime: '13:00', kind: 'period', appliesTo: 'full' },
    { id: 'blk_p6', name: 'Period 6 · Math 2', startTime: '13:00', endTime: '13:45', kind: 'period', appliesTo: 'full' },
    { id: 'blk_specials', name: 'Specials / wrap-up', startTime: '13:45', endTime: '14:15', kind: 'specials', appliesTo: 'full' },
    { id: 'blk_bus_pm', name: 'PM bus / dismissal', startTime: '14:15', endTime: '14:30', kind: 'bus-pickup', appliesTo: 'full' },
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
      note: 'Two students tagged aggressive cannot share an aide.',
    },
    {
      id: createId('tc'),
      traitA: 'elopes',
      traitB: 'aggressive',
      scope: 'aide',
      severity: 'hard',
      note: 'An eloper should not share an aide with an aggressive peer.',
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
