import { execFileSync } from "node:child_process"
import { basename, join } from "node:path"
import { existsSync, readFileSync, statSync } from "node:fs"

export type ScanMode = "changed" | "all"

export interface SqlScannerLocation {
  line: number
  kind: string
  severity: "info" | "low" | "medium" | "high"
  preview: string
}

export interface SqlScannerResult {
  name: string
  path: string
  reasons: string[]
  locations: SqlScannerLocation[]
}

interface PatternRule {
  kind: string
  reason: string
  pattern: RegExp
}

const SOURCE_FILE_PATTERN = /\.(js|jsx|ts|tsx|mjs|cjs)$/

const IGNORED_PATH_PARTS = [
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".git",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache"
]

const SQL_RULES: PatternRule[] = [
  {
    kind: "sql-template-interpolation",
    reason: "SQL-like template literal contains interpolation",
    pattern:
      /`[^`]*(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|WHERE|ORDER\s+BY|LIMIT|OFFSET)[^`]*\$\{[^`]*`/i
  },
  {
    kind: "sql-string-concatenation",
    reason: "SQL-like string appears to use concatenation",
    pattern:
      /(['"`])[^'"`]*(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|WHERE|ORDER\s+BY|LIMIT|OFFSET)[^'"`]*\1\s*\+/i
  },
  {
    kind: "query-template-argument",
    reason: "query call receives a template literal",
    pattern: /\.(query)\s*\(\s*`/i
  },
  {
    kind: "query-string-concat-argument",
    reason: "query call receives concatenated SQL string",
    pattern: /\.(query)\s*\(\s*(['"`])[\s\S]*\2\s*\+/i
  },
  {
    kind: "db-query-call",
    reason: "database query execution call",
    pattern: /\b(db|client|pool|userDbPool|database|connection|sequelize)\.query\s*\(/i
  },
  {
    kind: "copy-from-stream",
    reason: "PostgreSQL COPY execution call",
    pattern: /\bcopyFromStream\s*\(/i
  },
  {
    kind: "knex-raw",
    reason: "Knex raw SQL call",
    pattern: /\bknex\.raw\s*\(/i
  },
  {
    kind: "sql-template-tag",
    reason: "SQL tagged template",
    pattern: /\bsql\s*`/
  },
  {
    kind: "select-statement",
    reason: "SQL SELECT statement",
    pattern: /\bSELECT\b[\s\S]*\bFROM\b/i
  },
  {
    kind: "insert-statement",
    reason: "SQL INSERT statement",
    pattern: /\bINSERT\s+INTO\b/i
  },
  {
    kind: "update-statement",
    reason: "SQL UPDATE statement",
    pattern: /\bUPDATE\b[\s\S]*\bSET\b/i
  },
  {
    kind: "delete-statement",
    reason: "SQL DELETE statement",
    pattern: /\bDELETE\s+FROM\b/i
  },
  {
    kind: "ddl-statement",
    reason: "SQL DDL statement",
    pattern: /\b(CREATE|ALTER|DROP)\s+(TABLE|INDEX|VIEW|SCHEMA)\b/i
  },
  {
    kind: "truncate-statement",
    reason: "SQL TRUNCATE statement",
    pattern: /\bTRUNCATE\b/i
  },
  {
    kind: "where-clause",
    reason: "SQL WHERE clause",
    pattern: /\bWHERE\b/i
  },
  {
    kind: "order-by-clause",
    reason: "SQL ORDER BY clause",
    pattern: /\bORDER\s+BY\b/i
  },
  {
    kind: "returning-clause",
    reason: "SQL RETURNING clause",
    pattern: /\bRETURNING\b/i
  }
]

export function runGit(args: string[], cwd: string): string {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    })
  } catch {
    return ""
  }
}

export function getGitRoot(cwd: string): string {
  const root = runGit(["rev-parse", "--show-toplevel"], cwd).trim()
  return root || cwd
}

function normalizeGitPath(path: string): string {
  return path.trim().replace(/^"|"$/g, "")
}

function isIgnoredPath(path: string): boolean {
  const parts = path.split(/[\\/]+/)
  return parts.some((part) => IGNORED_PATH_PARTS.includes(part))
}

function isSourceFile(path: string): boolean {
  return SOURCE_FILE_PATTERN.test(path)
}

function getChangedFiles(root: string): string[] {
  const unstaged = runGit(["diff", "--name-only"], root)
  const staged = runGit(["diff", "--name-only", "--cached"], root)
  const untracked = runGit(["ls-files", "--others", "--exclude-standard"], root)

  return Array.from(
    new Set(
      `${unstaged}\n${staged}\n${untracked}`.split("\n").map(normalizeGitPath).filter(Boolean)
    )
  )
}

function getAllFiles(root: string): string[] {
  const tracked = runGit(["ls-files"], root)

  return Array.from(new Set(tracked.split("\n").map(normalizeGitPath).filter(Boolean)))
}

function stripLineCommentNoise(line: string): string {
  const trimmed = line.trim()

  if (trimmed.startsWith("//")) return ""
  if (trimmed.startsWith("*")) return ""
  if (trimmed.startsWith("/*")) return ""

  return line
}

function severityForKind(kind: string): "info" | "low" | "medium" | "high" {
  switch (kind) {
    case "sql-template-interpolation":
    case "sql-string-concatenation":
    case "query-template-argument":
    case "query-string-concat-argument":
      return "high"

    case "db-query-call":
    case "copy-from-stream":
    case "knex-raw":
    case "sql-template-tag":
      return "medium"

    case "ddl-statement":
    case "truncate-statement":
      return "medium"

    default:
      return "info"
  }
}

function classifyLine(line: string): Array<{ kind: string; reason: string }> {
  const normalized = stripLineCommentNoise(line)
  if (!normalized.trim()) return []

  const matches: Array<{ kind: string; reason: string }> = []

  for (const rule of SQL_RULES) {
    if (rule.pattern.test(normalized)) {
      matches.push({
        kind: rule.kind,
        reason: rule.reason
      })
    }
  }

  return matches
}

function shouldIncludeFile(path: string): boolean {
  if (!isSourceFile(path)) return false
  if (isIgnoredPath(path)) return false
  return true
}

function scanFile(root: string, relativePath: string): SqlScannerResult | null {
  const absolutePath = join(root, relativePath)

  if (!existsSync(absolutePath)) return null

  try {
    if (!statSync(absolutePath).isFile()) return null
  } catch {
    return null
  }

  let text: string
  try {
    text = readFileSync(absolutePath, "utf8")
  } catch {
    return null
  }

  const lines = text.split(/\r?\n/)
  const locations: SqlScannerLocation[] = []
  const reasons = new Set<string>()

  lines.forEach((line, index) => {
    const matches = classifyLine(line)

    for (const match of matches) {
      reasons.add(match.reason)

      locations.push({
        line: index + 1,
        kind: match.kind,
        severity: severityForKind(match.kind),
        preview: line.trim().slice(0, 180)
      })
    }
  })

  if (locations.length === 0) return null

  return {
    name: basename(relativePath),
    path: relativePath,
    reasons: Array.from(reasons),
    locations
  }
}

export async function scanSqlFiles(
  mode: ScanMode,
  cwd = process.cwd()
): Promise<SqlScannerResult[]> {
  const root = getGitRoot(cwd)

  const files = mode === "all" ? getAllFiles(root) : getChangedFiles(root)

  const candidates = files.filter(shouldIncludeFile)
  const results: SqlScannerResult[] = []

  for (const file of candidates) {
    const result = scanFile(root, file)
    if (result) results.push(result)
  }

  return results
}
