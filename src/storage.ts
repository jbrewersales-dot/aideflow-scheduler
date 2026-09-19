import { createDemoData, emptyData } from './data/demo';
import type { AppData } from './types';
import { STORAGE_KEY } from './types';

function isAppData(value: unknown): value is AppData {
  if (!value || typeof value !== 'object') return false;
  const v = value as AppData;
  return (
    v.version === 1 &&
    Array.isArray(v.students) &&
    Array.isArray(v.aides) &&
    Array.isArray(v.blocks) &&
    Array.isArray(v.keepApart) &&
    Array.isArray(v.traitConflicts) &&
    Boolean(v.params)
  );
}

export function loadStoredData(): AppData {
  if (typeof localStorage === 'undefined') return createDemoData();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDemoData();
    const parsed: unknown = JSON.parse(raw);
    if (!isAppData(parsed)) return createDemoData();
    return parsed;
  } catch {
    return createDemoData();
  }
}

export function saveStoredData(data: AppData): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function exportJson(data: AppData): string {
  return JSON.stringify(data, null, 2);
}

export function importJson(text: string): AppData {
  const parsed: unknown = JSON.parse(text);
  if (!isAppData(parsed)) {
    throw new Error('This file is not a valid AideFlow backup.');
  }
  return parsed;
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
