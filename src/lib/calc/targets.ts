import type { ISODate, TargetSet, TargetVersion } from '../../types/models';
import { DEFAULT_TARGETS } from '../../db/defaults';

/**
 * Targets are versioned by effective date. The target set that applies to a
 * given day is the newest version whose `effectiveFrom` is on or before it, so
 * editing a future target can never rewrite a historical result.
 */
export function targetsForDate(versions: TargetVersion[], date: ISODate): TargetSet {
  const applicable = versions
    .filter((version) => version.effectiveFrom <= date)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : a.effectiveFrom > b.effectiveFrom ? 1 : a.createdAt < b.createdAt ? -1 : 1));

  if (applicable.length > 0) return applicable[applicable.length - 1].targets;

  // Before the first version exists, fall back to the earliest one so that
  // back-dated entries still compare against something meaningful.
  const earliest = [...versions].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1))[0];
  return earliest ? earliest.targets : { ...DEFAULT_TARGETS };
}

export function sortedVersions(versions: TargetVersion[]): TargetVersion[] {
  return [...versions].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : a.effectiveFrom > b.effectiveFrom ? -1 : 0));
}

/** Average of a target field across a date range, honouring version changes. */
export function averageTarget(
  versions: TargetVersion[],
  dates: ISODate[],
  field: keyof TargetSet,
): number {
  if (dates.length === 0) return 0;
  const total = dates.reduce((sum, date) => sum + targetsForDate(versions, date)[field], 0);
  return total / dates.length;
}
