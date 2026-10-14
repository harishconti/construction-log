export type BudgetStatus = 'green' | 'yellow' | 'red';

export type BudgetVariance = {
  planned: number;
  actual: number;
  variance: number; // planned - actual (positive = under budget)
  percentUsed: number | null; // actual/planned * 100, null when no plan
  status: BudgetStatus | null;
};

/** Variance from planned vs actual (actual is always derived from transactions). */
export function computeVariance(planned: number, actual: number): BudgetVariance {
  const variance = planned - actual;
  if (planned <= 0) {
    return { planned, actual, variance, percentUsed: null, status: null };
  }
  const percentUsed = (actual / planned) * 100;
  return { planned, actual, variance, percentUsed, status: statusFor(percentUsed) };
}

/** green < 80%, yellow 80-100% inclusive, red > 100%. */
export function statusFor(percentUsed: number): BudgetStatus {
  if (percentUsed > 100) return 'red';
  if (percentUsed >= 80) return 'yellow';
  return 'green';
}
