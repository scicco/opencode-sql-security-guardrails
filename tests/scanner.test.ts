import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs"
import { join, dirname } from "node:path"
import { tmpdir } from "node:os"
import { execFileSync } from "node:child_process"
import { afterEach, describe, expect, it } from "vitest"
import { scanSqlFiles } from "../src/scanner.js"

const tempDirs: string[] = []

function createGitRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "sql-guardrails-scanner-"))
  tempDirs.push(root)

  execFileSync("git", ["init"], { cwd: root, stdio: "ignore" })
  execFileSync("git", ["config", "user.email", "test@example.com"], {
    cwd: root,
    stdio: "ignore"
  })
  execFileSync("git", ["config", "user.name", "Test User"], {
    cwd: root,
    stdio: "ignore"
  })

  return root
}

function writeProjectFile(root: string, relativePath: string, content: string): void {
  const absolutePath = join(root, relativePath)
  mkdirSync(dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, content, "utf8")
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe("scanSqlFiles", () => {
  it("respects ignoredPaths from project config", async () => {
    const root = createGitRepo()

    writeProjectFile(
      root,
      ".sql-security-guardrails.json",
      JSON.stringify(
        {
          ignoredPaths: ["fixtures/**"]
        },
        null,
        2
      )
    )

    writeProjectFile(
      root,
      "fixtures/unsafe.js",
      "db.query(`SELECT * FROM users WHERE id = ${userId}`)\n"
    )

    const results = await scanSqlFiles("changed", root)

    expect(results).toEqual([])
  })

  it("respects recursive ignoredPaths from project config", async () => {
    const root = createGitRepo()

    writeProjectFile(
      root,
      ".sql-security-guardrails.json",
      JSON.stringify(
        {
          ignoredPaths: ["frontend/**", "tests/**", "playwright/**"]
        },
        null,
        2
      )
    )

    writeProjectFile(
      root,
      "frontend/src/components/UnsafeComponent.js",
      "db.query(`SELECT * FROM users WHERE id = ${userId}`)\n"
    )

    writeProjectFile(
      root,
      "tests/backend/unit/unsafe.test.js",
      "db.query(`SELECT * FROM users WHERE id = ${userId}`)\n"
    )

    writeProjectFile(
      root,
      "playwright/tests/unsafe.spec.js",
      "db.query(`SELECT * FROM users WHERE id = ${userId}`)\n"
    )

    const results = await scanSqlFiles("changed", root)

    expect(results).toEqual([])
  })

  it("detects extra query call patterns from project config", async () => {
    const root = createGitRepo()

    writeProjectFile(
      root,
      ".sql-security-guardrails.json",
      JSON.stringify(
        {
          extraQueryCallPatterns: ["analyticsDb.query"]
        },
        null,
        2
      )
    )

    writeProjectFile(
      root,
      "src/analytics.js",
      "analyticsDb.query(`SELECT * FROM events WHERE user_id = ${userId}`)\n"
    )

    const results = await scanSqlFiles("changed", root)

    expect(results).toHaveLength(1)
    expect(results[0].path).toBe("src/analytics.js")
    expect(results[0].reasons).toContain("custom query execution call: analyticsDb.query")
  })

  it("filters findings below minimumSeverity", async () => {
    const root = createGitRepo()

    writeProjectFile(
      root,
      ".sql-security-guardrails.json",
      JSON.stringify(
        {
          minimumSeverity: "high"
        },
        null,
        2
      )
    )

    writeProjectFile(
      root,
      "src/repository.js",
      'db.query("SELECT * FROM users WHERE id = $1", [userId])\n'
    )

    const results = await scanSqlFiles("changed", root)

    expect(results).toEqual([])
  })

  it("detects untracked files with interpolated SQL template literals", async () => {
    const root = createGitRepo()

    writeProjectFile(
      root,
      "tmp_sql_scan_test.js",
      [
        "async function test(db, userId) {",
        "  return db.query(`SELECT * FROM users WHERE id = ${userId}`)",
        "}",
        ""
      ].join("\n")
    )

    const results = await scanSqlFiles("changed", root)

    expect(results).toHaveLength(1)
    expect(results[0].path).toBe("tmp_sql_scan_test.js")
    expect(results[0].reasons).toContain("SQL-like template literal contains interpolation")
    expect(results[0].reasons).toContain("query call receives a template literal")

    const highSeverityKinds = results[0].locations
      .filter((location) => location.severity === "high")
      .map((location) => location.kind)

    expect(highSeverityKinds).toContain("sql-template-interpolation")
    expect(highSeverityKinds).toContain("query-template-argument")
  })

  it("does not report files without SQL-like content", async () => {
    const root = createGitRepo()

    writeProjectFile(
      root,
      "src/no-sql.ts",
      ["export function add(a: number, b: number): number {", "  return a + b", "}", ""].join("\n")
    )

    const results = await scanSqlFiles("changed", root)

    expect(results).toEqual([])
  })

  it("ignores node_modules", async () => {
    const root = createGitRepo()

    writeProjectFile(
      root,
      "node_modules/pkg/index.js",
      "db.query(`SELECT * FROM users WHERE id = ${userId}`)\n"
    )

    const results = await scanSqlFiles("changed", root)

    expect(results).toEqual([])
  })
})
