import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type Dispatch,
  type ReactNode,
} from 'react';
import { createId } from './ids';
import { evaluateData, solveSchedule } from './scheduler/solver';
import { hardConflicts } from './scheduler/evaluate';
import { loadStoredData, saveStoredData } from './storage';
import type {
  Aide,
  AppData,
  Assignment,
  Conflict,
  KeepApartPair,
  ScheduleBlock,
  SchedulerParams,
  SolveResult,
  Student,
  TraitConflictRule,
} from './types';

export type AppView =
  | 'schedule'
  | 'students'
  | 'aides'
  | 'blocks'
  | 'rules'
  | 'params'
  | 'data'
  | 'strips'
  | 'conflicts'
  | 'print';

type Action =
  | { type: 'replace'; data: AppData }
  | { type: 'patch'; data: Partial<AppData> }
  | { type: 'upsertStudent'; student: Student }
  | { type: 'deleteStudent'; id: string }
  | { type: 'upsertAide'; aide: Aide }
  | { type: 'deleteAide'; id: string }
  | { type: 'upsertBlock'; block: ScheduleBlock }
  | { type: 'deleteBlock'; id: string }
  | { type: 'upsertKeepApart'; pair: KeepApartPair }
  | { type: 'deleteKeepApart'; id: string }
  | { type: 'upsertTraitRule'; rule: TraitConflictRule }
  | { type: 'deleteTraitRule'; id: string }
  | { type: 'setParams'; params: SchedulerParams }
  | { type: 'setSchedule'; assignments: Assignment[] | null; generatedAt?: string; score?: number; notes?: string[] }
  | { type: 'reassign'; assignment: Assignment };

function stripSchedule(data: AppData): AppData {
  if (!data.schedule) return data;
  return { ...data, schedule: null };
}

function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'replace':
      return action.data;
    case 'patch':
      return { ...state, ...action.data };
    case 'upsertStudent': {
      const exists = state.students.some((s) => s.id === action.student.id);
      const students = exists
        ? state.students.map((s) => (s.id === action.student.id ? action.student : s))
        : [...state.students, action.student];
      return stripSchedule({ ...state, students });
    }
    case 'deleteStudent':
      return stripSchedule({
        ...state,
        students: state.students.filter((s) => s.id !== action.id),
        keepApart: state.keepApart.filter((p) => p.studentAId !== action.id && p.studentBId !== action.id),
        aides: state.aides.map((a) => ({
          ...a,
          preferredStudentIds: a.preferredStudentIds.filter((id) => id !== action.id),
        })),
      });
    case 'upsertAide': {
      const exists = state.aides.some((a) => a.id === action.aide.id);
      const aides = exists
        ? state.aides.map((a) => (a.id === action.aide.id ? action.aide : a))
        : [...state.aides, action.aide];
      return stripSchedule({ ...state, aides });
    }
    case 'deleteAide':
      return stripSchedule({
        ...state,
        aides: state.aides.filter((a) => a.id !== action.id),
        students: state.students.map((s) => ({
          ...s,
          preferredAideIds: s.preferredAideIds.filter((id) => id !== action.id),
        })),
      });
    case 'upsertBlock': {
      const exists = state.blocks.some((b) => b.id === action.block.id);
      const blocks = exists
        ? state.blocks.map((b) => (b.id === action.block.id ? action.block : b))
        : [...state.blocks, action.block];
      return stripSchedule({ ...state, blocks });
    }
    case 'deleteBlock':
      return stripSchedule({
        ...state,
        blocks: state.blocks.filter((b) => b.id !== action.id),
        students: state.students.map((s) => ({
          ...s,
          blockIds: s.blockIds.filter((id) => id !== action.id),
          coverageBlockIds: s.coverageBlockIds.filter((id) => id !== action.id),
        })),
        aides: state.aides.map((a) => ({
          ...a,
          availableBlockIds: a.availableBlockIds.filter((id) => id !== action.id),
        })),
      });
    case 'upsertKeepApart': {
      const exists = state.keepApart.some((p) => p.id === action.pair.id);
      const keepApart = exists
        ? state.keepApart.map((p) => (p.id === action.pair.id ? action.pair : p))
        : [...state.keepApart, action.pair];
      return stripSchedule({ ...state, keepApart });
    }
    case 'deleteKeepApart':
      return stripSchedule({ ...state, keepApart: state.keepApart.filter((p) => p.id !== action.id) });
    case 'upsertTraitRule': {
      const exists = state.traitConflicts.some((r) => r.id === action.rule.id);
      const traitConflicts = exists
        ? state.traitConflicts.map((r) => (r.id === action.rule.id ? action.rule : r))
        : [...state.traitConflicts, action.rule];
      return stripSchedule({ ...state, traitConflicts });
    }
    case 'deleteTraitRule':
      return stripSchedule({ ...state, traitConflicts: state.traitConflicts.filter((r) => r.id !== action.id) });
    case 'setParams':
      return stripSchedule({ ...state, params: action.params });
    case 'setSchedule':
      if (!action.assignments) return { ...state, schedule: null };
      return {
        ...state,
        schedule: {
          assignments: action.assignments,
          score: action.score ?? 0,
          generatedAt: action.generatedAt ?? new Date().toISOString(),
          notes: action.notes ?? [],
        },
      };
    case 'reassign': {
      if (!state.schedule) return state;
      const rest = state.schedule.assignments.filter(
        (a) => !(a.studentId === action.assignment.studentId && a.blockId === action.assignment.blockId),
      );
      return {
        ...state,
        schedule: {
          ...state.schedule,
          assignments: [...rest, action.assignment],
        },
      };
    }
    default:
      return state;
  }
}

interface Store {
  data: AppData;
  view: AppView;
  setView: (view: AppView) => void;
  dispatch: Dispatch<Action>;
  solve: () => void;
  solving: boolean;
  lastResult: SolveResult | null;
  conflicts: Conflict[];
  hard: Conflict[];
  scheduleLegal: boolean;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, dispatch] = useReducer(reducer, undefined, loadStoredData);
  const [view, setView] = useState<AppView>('schedule');
  const [solving, setSolving] = useState(false);
  const [lastResult, setLastResult] = useState<SolveResult | null>(null);

  useEffect(() => {
    saveStoredData(data);
  }, [data]);

  const conflicts = useMemo(
    () => evaluateData(data, data.schedule?.assignments ?? []),
    [data],
  );
  const hard = useMemo(() => hardConflicts(conflicts), [conflicts]);
  const scheduleLegal = Boolean(data.schedule) && hard.length === 0;

  const solve = (): void => {
    setSolving(true);
    window.setTimeout(() => {
      const result = solveSchedule(data);
      setLastResult(result);
      if (result.ok) {
        dispatch({
          type: 'setSchedule',
          assignments: result.schedule.assignments,
          score: result.schedule.score,
          generatedAt: result.schedule.generatedAt,
          notes: result.schedule.notes,
        });
        setView('schedule');
      } else {
        dispatch({ type: 'setSchedule', assignments: null });
        setView('conflicts');
      }
      setSolving(false);
    }, 40);
  };

  const value: Store = {
    data,
    view,
    setView,
    dispatch,
    solve,
    solving,
    lastResult,
    conflicts,
    hard,
    scheduleLegal,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}

export function blankStudent(): Student {
  return {
    id: createId('stu'),
    name: '',
    dayType: 'full',
    blockIds: [],
    needsNotes: '',
    needTags: [],
    traits: [],
    preferredAideIds: [],
    coverageMode: 'always',
    coverageBlockIds: [],
    requiresOneToOne: false,
  };
}

export function blankAide(): Aide {
  return {
    id: createId('aide'),
    name: '',
    availableBlockIds: [],
    maxCaseload: 4,
    trainedTags: [],
    notes: '',
    preferredStudentIds: [],
  };
}

export function blankBlock(): ScheduleBlock {
  return {
    id: createId('blk'),
    name: '',
    startTime: '08:00',
    endTime: '08:45',
    kind: 'period',
    appliesTo: 'all',
  };
}
