/**
 * SQL predicates (QueryBuilder fragments) deciding whether a recurring record counts
 * in a month. Parameters: :periodStart / :periodEnd (half-open month, YYYY-MM-DD,
 * see monthPeriod), plus :fixedType / :oneTimeType for income.
 * Dates are calendar dates already expressed in Brazilian time.
 */
export function activeInPeriodSql(alias: string) {
  return `((${alias}.startDate IS NULL OR ${alias}.startDate < CAST(:periodEnd AS date))
    AND (${alias}.endDate IS NULL OR ${alias}.endDate >= CAST(:periodStart AS date)))`;
}

export function incomeInPeriodSql(alias: string) {
  return `((${alias}.incomeType = :fixedType AND ${activeInPeriodSql(alias)})
    OR (${alias}.incomeType = :oneTimeType
      AND ${alias}.startDate >= CAST(:periodStart AS date)
      AND ${alias}.startDate < CAST(:periodEnd AS date)))`;
}
