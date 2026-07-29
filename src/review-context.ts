import { join } from "node:path"
import { existsSync, readFileSync, statSync } from "node:fs"
import {
  getGitRoot,
  runGit,
  scanSqlFiles,
  type ScanMode,
  type SqlScannerResult
} from "./scanner.js"

export interface SqlReviewFileContent {
  path: string
  content: string
}

export interface SqlSecurityReviewContext {
  mode: ScanMode
  scanner: {
    count: number
    files: SqlScannerResult[]
  }
  diff: string
  files: SqlReviewFileContent[]
  instructions: string
}

function readDetectedFile(root: string, relativePath: string): SqlReviewFileContent | null {
  const absolutePath = join(root, relativePath)

  if (!existsSync(absolutePath)) return null

  try {
    if (!statSync(absolutePath).isFile()) return null
  } catch {
    return null
  }

  try {
    return {
      path: relativePath,
      content: readFileSync(absolutePath, "utf8")
    }
  } catch {
    return null
  }
}

function buildUntrackedFileDiff(root: string, relativePath: string): string {
  const file = readDetectedFile(root, relativePath)

  if (!file) return ""

  const lines = file.content.split(/\r?\n/)

  return [
    `diff --git a/${relativePath} b/${relativePath}`,
    "new file mode 100644",
    "index 0000000..0000000",
    "--- /dev/null",
    `+++ b/${relativePath}`,
    `@@ -0,0 +1,${lines.length} @@`,
    ...lines.map((line) => `+${line}`)
  ].join("\n")
}

function getUntrackedFiles(root: string): Set<string> {
  const output = runGit(["ls-files", "--others", "--exclude-standard"], root)

  return new Set(
    output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
  )
}

function getRelevantDiff(root: string, mode: ScanMode, files: SqlScannerResult[]): string {
  if (mode === "all") {
    return runGit(["diff", "--"], root)
  }

  const paths = files.map((file) => file.path)

  if (paths.length === 0) {
    return mode === "staged" ? runGit(["diff", "--cached"], root) : runGit(["diff"], root)
  }

  if (mode === "staged") {
    return runGit(["diff", "--cached", "--", ...paths], root)
  }

  const untrackedFiles = getUntrackedFiles(root)
  const trackedPaths = paths.filter((path) => !untrackedFiles.has(path))
  const untrackedPaths = paths.filter((path) => untrackedFiles.has(path))

  const unstaged = trackedPaths.length > 0 ? runGit(["diff", "--", ...trackedPaths], root) : ""

  const staged =
    trackedPaths.length > 0 ? runGit(["diff", "--cached", "--", ...trackedPaths], root) : ""

  const untrackedDiff = untrackedPaths
    .map((path) => buildUntrackedFileDiff(root, path))
    .filter(Boolean)
    .join("\n\n")

  return [unstaged, staged, untrackedDiff].filter(Boolean).join("\n")
}

export async function buildSqlSecurityReviewContext(
  mode: ScanMode,
  cwd = process.cwd()
): Promise<SqlSecurityReviewContext> {
  const root = getGitRoot(cwd)
  const files = await scanSqlFiles(mode, root)

  const fileContents = files
    .map((file) => readDetectedFile(root, file.path))
    .filter((file): file is SqlReviewFileContent => file !== null)

  return {
    mode,
    scanner: {
      count: files.length,
      files
    },
    diff: getRelevantDiff(root, mode, files),
    files: fileContents,
    instructions:
      "Invoke the sql-security-review skill using this context. Return SQL_SECURITY_REVIEW: OK if no SQL injection, unsafe SQL construction, unsafe dynamic identifier, unsafe raw SQL execution, or sensitive SQL logging issue is found. Return SQL_SECURITY_REVIEW: KO with findings and remediation if any issue is found."
  }
}
