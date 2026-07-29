import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const tempDirs: string[] = []

const cliPath = join(process.cwd(), "dist", "bin", "init.js")

function createTempProject(): string {
  const root = mkdtempSync(join(tmpdir(), "sql-guardrails-init-"))
  tempDirs.push(root)
  return root
}

function runCli(cwd: string, args: string[] = []): string {
  return execFileSync("node", [cliPath, ...args], {
    cwd,
    encoding: "utf8"
  })
}

function readProjectFile(root: string, relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8")
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe("opencode-sql-security-guardrails CLI", () => {
  it("prints help", () => {
    const root = createTempProject()

    const output = runCli(root, ["--help"])

    expect(output).toContain("opencode-sql-security-guardrails")
    expect(output).toContain("Usage:")
    expect(output).toContain("init")
  })

  it("prints version", () => {
    const root = createTempProject()

    const output = runCli(root, ["version"]).trim()

    expect(output).toMatch(/^\d+\.\d+\.\d+/)
  })

  it("init creates the sql-security-review skill and AGENTS.md", () => {
    const root = createTempProject()

    const output = runCli(root, ["init"])

    expect(output).toContain("opencode-sql-security-guardrails init")
    expect(output).toContain("Skill: created")
    expect(output).toContain("AGENTS.md: created")

    expect(existsSync(join(root, ".opencode", "skills", "sql-security-review", "SKILL.md"))).toBe(
      true
    )

    expect(existsSync(join(root, "AGENTS.md"))).toBe(true)

    const skill = readProjectFile(root, ".opencode/skills/sql-security-review/SKILL.md")
    expect(skill).toContain("name: sql-security-review")
    expect(skill).toContain("SQL Security Review")

    const agents = readProjectFile(root, "AGENTS.md")
    expect(agents).toContain("opencode-sql-security-guardrails:start")
    expect(agents).toContain("SQL Security Guardrail")
    expect(agents).toContain("opencode-sql-security-guardrails:end")
  })

  it("init --no-agents creates only the skill", () => {
    const root = createTempProject()

    const output = runCli(root, ["init", "--no-agents"])

    expect(output).toContain("Skill: created")
    expect(output).toContain("AGENTS.md: skipped because --no-agents was provided")

    expect(existsSync(join(root, ".opencode", "skills", "sql-security-review", "SKILL.md"))).toBe(
      true
    )

    expect(existsSync(join(root, "AGENTS.md"))).toBe(false)
  })

  it("init is idempotent and does not duplicate the AGENTS.md managed block", () => {
    const root = createTempProject()

    runCli(root, ["init"])
    const secondOutput = runCli(root, ["init"])

    expect(secondOutput).toContain("Skill: skipped")
    expect(secondOutput).toContain("AGENTS.md: skipped")

    const agents = readProjectFile(root, "AGENTS.md")

    const startMatches = agents.match(/opencode-sql-security-guardrails:start/g) ?? []
    const endMatches = agents.match(/opencode-sql-security-guardrails:end/g) ?? []

    expect(startMatches).toHaveLength(1)
    expect(endMatches).toHaveLength(1)
  })

  it("init --force updates existing managed files without duplicating AGENTS.md block", () => {
    const root = createTempProject()

    runCli(root, ["init"])
    const forceOutput = runCli(root, ["init", "--force"])

    expect(forceOutput).toContain("Skill: updated")
    expect(forceOutput).toContain("AGENTS.md: updated")

    const agents = readProjectFile(root, "AGENTS.md")

    const startMatches = agents.match(/opencode-sql-security-guardrails:start/g) ?? []
    const endMatches = agents.match(/opencode-sql-security-guardrails:end/g) ?? []

    expect(startMatches).toHaveLength(1)
    expect(endMatches).toHaveLength(1)
  })
})
