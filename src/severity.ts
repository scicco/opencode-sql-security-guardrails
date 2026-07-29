import type { SqlFindingSeverity } from "./config.js"

export const SEVERITY_RANK: Record<SqlFindingSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3
}

export const VALID_SEVERITIES = new Set<SqlFindingSeverity>(["info", "low", "medium", "high"])

export function isSqlFindingSeverity(value: string): value is SqlFindingSeverity {
  return VALID_SEVERITIES.has(value as SqlFindingSeverity)
}

export function severityAtLeast(
  severity: SqlFindingSeverity,
  minimum: SqlFindingSeverity
): boolean {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[minimum]
}
