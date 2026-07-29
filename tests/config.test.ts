import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { loadSqlGuardrailsConfig } from "../src/config.js"

const tempDirs: string[] = []

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "sql-guardrails-config-"))
  tempDirs.push(root)
  return root
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe("loadSqlGuardrailsConfig", () => {
  it("returns defaults when config file does not exist", () => {
    const root = createTempRoot()

    const config = loadSqlGuardrailsConfig(root)

    expect(config).toEqual({
      ignoredPaths: [],
      extraQueryCallPatterns: [],
      minimumSeverity: "info"
    })
  })

  it("loads valid config values", () => {
    const root = createTempRoot()

    writeFileSync(
      join(root, ".sql-security-guardrails.json"),
      JSON.stringify(
        {
          ignoredPaths: ["fixtures/**"],
          extraQueryCallPatterns: ["analyticsDb.query"],
          minimumSeverity: "medium"
        },
        null,
        2
      ),
      "utf8"
    )

    const config = loadSqlGuardrailsConfig(root)

    expect(config).toEqual({
      ignoredPaths: ["fixtures/**"],
      extraQueryCallPatterns: ["analyticsDb.query"],
      minimumSeverity: "medium"
    })
  })

  it("falls back to defaults for invalid values", () => {
    const root = createTempRoot()

    writeFileSync(
      join(root, ".sql-security-guardrails.json"),
      JSON.stringify(
        {
          ignoredPaths: "fixtures/**",
          extraQueryCallPatterns: [123],
          minimumSeverity: "critical"
        },
        null,
        2
      ),
      "utf8"
    )

    const config = loadSqlGuardrailsConfig(root)

    expect(config).toEqual({
      ignoredPaths: [],
      extraQueryCallPatterns: [],
      minimumSeverity: "info"
    })
  })
})
