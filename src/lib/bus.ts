import type { PageKey } from '../types/models';

export type QuickAddKind = 'task' | 'food' | 'gym' | 'run' | 'steps' | 'study' | 'note';

export const QUICK_ADD_TARGET: Record<QuickAddKind, PageKey> = {
  task: 'tasks',
  food: 'nutrition',
  gym: 'fitness',
  run: 'fitness',
  steps: 'fitness',
  study: 'study',
  note: 'calendar',
};

/**
 * One-shot intent handed from the global quick-add control to the page that
 * owns the form. Kept module-level so no page has to subscribe to a context it
 * does not otherwise need.
 */
let pending: QuickAddKind | null = null;

export function setIntent(kind: QuickAddKind): void {
  pending = kind;
}

export function consumeIntent(kinds: QuickAddKind[]): QuickAddKind | null {
  if (pending && kinds.includes(pending)) {
    const value = pending;
    pending = null;
    return value;
  }
  return null;
}
