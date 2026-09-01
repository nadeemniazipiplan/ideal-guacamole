import type { ExpenditureMethod, TargetSet } from '../../types/models';
import { round } from '../validate';

export interface EnergyBalance {
  method: ExpenditureMethod;
  methodLabel: string;
  /** Baseline (Method A) or full TDEE (Method B). */
  base: number;
  /** Non-duplicated active calories; only added by Method A. */
  activeCalories: number;
  /** Whether activeCalories contributed to totalExpenditure. */
  activeCounted: boolean;
  totalExpenditure: number;
  intake: number;
  /** expenditure - intake. Positive = deficit, negative = surplus. */
  balance: number;
  label: 'estimated deficit' | 'estimated surplus' | 'estimated balance';
  magnitude: number;
}

export const METHOD_LABELS: Record<ExpenditureMethod, string> = {
  baseline_plus_exercise: 'Method A - baseline + exercise',
  full_tdee: 'Method B - full TDEE',
};

export const METHOD_EXPLANATIONS: Record<ExpenditureMethod, string> = {
  baseline_plus_exercise:
    'You enter a baseline daily expenditure that excludes the exercise you log here. Estimated total expenditure = baseline + non-duplicated active calories.',
  full_tdee:
    'You enter a full daily TDEE that already includes your usual activity. Estimated total expenditure = TDEE, and logged exercise is shown separately rather than added again.',
};

/**
 * Energy balance never uses exercise calories on their own. Method A adds
 * non-duplicated active calories to a baseline; Method B uses a full TDEE and
 * shows exercise separately.
 */
export function energyBalance(
  method: ExpenditureMethod,
  targets: TargetSet,
  intake: number,
  activeCalories: number,
): EnergyBalance {
  const activeCounted = method === 'baseline_plus_exercise';
  const base = activeCounted ? targets.baselineExpenditure : targets.tdee;
  const totalExpenditure = round(activeCounted ? base + activeCalories : base, 0);
  const balance = round(totalExpenditure - intake, 0);
  const label: EnergyBalance['label'] =
    balance > 0 ? 'estimated deficit' : balance < 0 ? 'estimated surplus' : 'estimated balance';

  return {
    method,
    methodLabel: METHOD_LABELS[method],
    base: round(base, 0),
    activeCalories: round(activeCalories, 0),
    activeCounted,
    totalExpenditure,
    intake: round(intake, 0),
    balance,
    label,
    magnitude: Math.abs(balance),
  };
}
