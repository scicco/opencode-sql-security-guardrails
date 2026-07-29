import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs"
import { join, dirname } from "node:path"
import { tmpdir } from "node:os"
import { execFileSync } from "node:child_process"
import { afterEach, describe, expect, it } from "vitest"
import { buildSqlSecurityReviewContext } from "../src/review-context.js"

const tempDirs: string[] = []

function createGitRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "sql-guardrails-context-"))
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

describe("buildSqlSecurityReviewContext", () => {
  it("includes scanner output, file contents, and pseudo-diff for untracked SQL files", async () => {
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

    const context = await buildSqlSecurityReviewContext("changed", root)

    expect(context.mode).toBe("changed")
    expect(context.scanner.count).toBe(1)
    expect(context.scanner.files[0].path).toBe("tmp_sql_scan_test.js")

    expect(context.files).toHaveLength(1)
    expect(context.files[0].path).toBe("tmp_sql_scan_test.js")
    expect(context.files[0].content).toContain("SELECT * FROM users")

    expect(context.diff).toContain("diff --git a/tmp_sql_scan_test.js b/tmp_sql_scan_test.js")
    expect(context.diff).toContain("new file mode 100644")
    expect(context.diff).toContain("+  return db.query(`SELECT * FROM users WHERE id = ${userId}`)")

    expect(context.instructions).toContain("Invoke the sql-security-review skill")
  })
})
