import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

export type SqlFindingSeverity = "info" | "low" | "medium" | "high"

export interface SqlGuardrailsConfig {
  ignoredPaths: string[]
  extraQueryCallPatterns: string[]
  minimumSeverity: SqlFindingSeverity
}

const DEFAULT_CONFIG: SqlGuardrailsConfig = {
  ignoredPaths: [],
  extraQueryCallPatterns: [],
  minimumSeverity: "info"
}

const VALID_SEVERITIES = new Set(["info", "low", "medium", "high"])

interface RawSqlGuardrailsConfig {
  ignoredPaths?: unknown
  extraQueryCallPatterns?: unknown
  minimumSeverity?: unknown
}

export function loadSqlGuardrailsConfig(root: string): SqlGuardrailsConfig {
  const configPath = join(root, ".sql-security-guardrails.json")

  if (!existsSync(configPath)) {
    return DEFAULT_CONFIG
  }

  let raw: RawSqlGuardrailsConfig

  try {
    raw = JSON.parse(readFileSync(configPath, "utf8")) as RawSqlGuardrailsConfig
  } catch {
    return DEFAULT_CONFIG
  }

  return {
    ignoredPaths: readStringArray(raw.ignoredPaths),
    extraQueryCallPatterns: readStringArray(raw.extraQueryCallPatterns),
    minimumSeverity: readSeverity(raw.minimumSeverity)
  }
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "")
}

function readSeverity(value: unknown): SqlFindingSeverity {
  if (typeof value !== "string") return DEFAULT_CONFIG.minimumSeverity

  return VALID_SEVERITIES.has(value)
    ? (value as SqlFindingSeverity)
    : DEFAULT_CONFIG.minimumSeverity
}
