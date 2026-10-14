/**
 * Money helpers. Amounts are persisted as numeric(…,2) and travel as strings;
 * arithmetic is done in integer cents to avoid floating-point drift.
 */
export function toCents(value: string | number | null | undefined): number {
  return Math.round(Number(value ?? 0) * 100);
}

export function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Splits a total into `parts` installments: every installment is the rounded
 * per-part amount and the last one absorbs the rounding remainder.
 */
export function splitInstallments(totalCents: number, parts: number) {
  const per = Math.round(totalCents / parts);
  const last = totalCents - per * (parts - 1);
  return { per, last };
}

/** Amount of installment `k` (1-based) of `parts`. */
export function installmentAmountCents(
  totalCents: number,
  parts: number,
  k: number,
): number {
  const { per, last } = splitInstallments(totalCents, parts);
  return k === parts ? last : per;
}
