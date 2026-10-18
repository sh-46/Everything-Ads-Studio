import type { SceneDocument } from "@/domain/scene";

export interface SceneSnapshot {
  name: string;
  document: SceneDocument;
}

export interface HistoryEntry {
  sceneId: string;
  before: SceneSnapshot;
  after: SceneSnapshot;
  /** Consecutive edits with the same key (e.g. typing in one field) merge into one step. */
  coalesceKey?: string;
  at: number;
}

export interface HistoryState {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

export const HISTORY_LIMIT = 200;
export const COALESCE_WINDOW_MS = 1000;

export function emptyHistory(): HistoryState {
  return { past: [], future: [] };
}

export function pushHistory(history: HistoryState, entry: HistoryEntry): HistoryState {
  const last = history.past[history.past.length - 1];
  if (
    last &&
    entry.coalesceKey &&
    last.coalesceKey === entry.coalesceKey &&
    last.sceneId === entry.sceneId &&
    entry.at - last.at <= COALESCE_WINDOW_MS
  ) {
    const merged: HistoryEntry = { ...last, after: entry.after, at: entry.at };
    return { past: [...history.past.slice(0, -1), merged], future: [] };
  }
  const past = [...history.past, entry];
  return { past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past, future: [] };
}

export function undo(history: HistoryState): { history: HistoryState; entry: HistoryEntry } | null {
  const entry = history.past[history.past.length - 1];
  if (!entry) return null;
  return { history: { past: history.past.slice(0, -1), future: [entry, ...history.future] }, entry };
}

export function redo(history: HistoryState): { history: HistoryState; entry: HistoryEntry } | null {
  const [entry, ...rest] = history.future;
  if (!entry) return null;
  return { history: { past: [...history.past, entry], future: rest }, entry };
}

/** Drops all steps for a scene, e.g. after replacing it with the server copy. */
export function forgetScene(history: HistoryState, sceneId: string): HistoryState {
  return {
    past: history.past.filter((e) => e.sceneId !== sceneId),
    future: history.future.filter((e) => e.sceneId !== sceneId),
  };
}
