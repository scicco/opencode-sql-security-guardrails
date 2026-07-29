#!/usr/bin/env node
import { isScanMode, scanSqlFiles, type ScanMode, type SqlScannerResult } from "../src/scanner.js"
import type { SqlFindingSeverity } from "../src/config.js"
import { isSqlFindingSeverity, severityAtLeast } from "../src/severity.js"
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const INIT_MARKER_START = "<!-- opencode-sql-security-guardrails:start -->"
const INIT_MARKER_END = "<!-- opencode-sql-security-guardrails:end -->"

interface InitOptions {
  cwd: string
  force: boolean
  updateAgents: boolean
}

interface ScanOptions {
  cwd: string
  mode: ScanMode
  failOn: SqlFindingSeverity
  json: boolean
}

interface ParsedCommand {
  command: "init" | "scan" | "help" | "version"
  options: InitOptions
  scanOptions?: ScanOptions
}

function parseArgs(argv: string[]): ParsedCommand {
  const rawArgs = argv.slice(2)

  if (rawArgs.length === 0) {
    return {
      command: "help",
      options: defaultOptions(rawArgs)
    }
  }

  const firstArg = rawArgs[0]

  if (firstArg === "--help" || firstArg === "-h" || firstArg === "help") {
    return {
      command: "help",
      options: defaultOptions(rawArgs)
    }
  }

  if (firstArg === "--version" || firstArg === "-v" || firstArg === "version") {
    return {
      command: "version",
      options: defaultOptions(rawArgs)
    }
  }

  if (firstArg === "scan") {
    return {
      command: "scan",
      options: defaultOptions([]),
      scanOptions: parseScanOptions(rawArgs.slice(1))
    }
  }

  if (firstArg !== "init") {
    throw new Error(`Unknown command: ${firstArg}`)
  }

  return {
    command: "init",
    options: defaultOptions(rawArgs.slice(1))
  }
}

function defaultOptions(args: string[]): InitOptions {
  const argSet = new Set(args)

  return {
    cwd: process.cwd(),
    force: argSet.has("--force"),
    updateAgents: !argSet.has("--no-agents")
  }
}

function parseScanOptions(args: string[]): ScanOptions {
  let mode: ScanMode = "changed"
  let failOn: SqlFindingSeverity = "high"
  let json = false

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === "--changed") {
      mode = "changed"
      continue
    }

    if (arg === "--staged") {
      mode = "staged"
      continue
    }

    if (arg === "--all") {
      mode = "all"
      continue
    }

    if (arg === "--json") {
      json = true
      continue
    }

    if (arg === "--fail-on") {
      const value = args[index + 1]

      if (!value || !isSqlFindingSeverity(value)) {
        throw new Error(`Invalid --fail-on value: ${value ?? "<missing>"}`)
      }

      failOn = value
      index += 1
      continue
    }

    if (arg.startsWith("--fail-on=")) {
      const value = arg.slice("--fail-on=".length)

      if (!isSqlFindingSeverity(value)) {
        throw new Error(`Invalid --fail-on value: ${value}`)
      }

      failOn = value
      continue
    }

    if (arg.startsWith("--mode=")) {
      const value = arg.slice("--mode=".length)

      if (!isScanMode(value)) {
        throw new Error(`Invalid --mode value: ${value}`)
      }

      mode = value
      continue
    }

    throw new Error(`Unknown scan option: ${arg}`)
  }

  return {
    cwd: process.cwd(),
    mode,
    failOn,
    json
  }
}

function getPackageRoot(): string {
  const currentFile = fileURLToPath(import.meta.url)
  const currentDir = dirname(currentFile)

  // dist/bin/init.js -> package root
  return resolve(currentDir, "../..")
}

function getPackageVersion(packageRoot: string): string {
  const packageJsonPath = join(packageRoot, "package.json")

  if (!existsSync(packageJsonPath)) {
    return "unknown"
  }

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      version?: string
    }

    return packageJson.version || "unknown"
  } catch {
    return "unknown"
  }
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true })
}

function copyTemplateFile(
  source: string,
  destination: string,
  force: boolean
): "created" | "updated" | "skipped" {
  if (existsSync(destination) && !force) {
    return "skipped"
  }

  const existedBefore = existsSync(destination)

  ensureDir(dirname(destination))
  copyFileSync(source, destination)

  return existedBefore ? "updated" : "created"
}

function readText(path: string): string {
  return readFileSync(path, "utf8")
}

function writeText(path: string, content: string): void {
  ensureDir(dirname(path))
  writeFileSync(path, content, "utf8")
}

function appendAgentsSnippet(
  projectRoot: string,
  snippetPath: string,
  force: boolean
): "created" | "updated" | "skipped" {
  const agentsPath = join(projectRoot, "AGENTS.md")
  const snippet = readText(snippetPath).trim()

  if (!snippet) {
    throw new Error(`AGENTS snippet template is empty: ${snippetPath}`)
  }

  const wrappedSnippet = [INIT_MARKER_START, "", snippet, "", INIT_MARKER_END, ""].join("\n")

  if (!existsSync(agentsPath)) {
    writeText(agentsPath, `${wrappedSnippet}\n`)
    return "created"
  }

  const existing = readText(agentsPath)

  const hasManagedBlock = existing.includes(INIT_MARKER_START) && existing.includes(INIT_MARKER_END)

  if (hasManagedBlock) {
    if (!force) {
      return "skipped"
    }

    const pattern = new RegExp(
      `${escapeRegExp(INIT_MARKER_START)}[\\s\\S]*?${escapeRegExp(INIT_MARKER_END)}\\n?`,
      "m"
    )

    const updated = existing.replace(pattern, `${wrappedSnippet}\n`)
    writeText(agentsPath, updated)

    return "updated"
  }

  const separator = existing.endsWith("\n") ? "\n" : "\n\n"
  writeText(agentsPath, `${existing}${separator}${wrappedSnippet}\n`)

  return "updated"
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function printResult(label: string, result: string, target: string): void {
  console.log(`${label}: ${result} -> ${target}`)
}

function printHelp(): void {
  console.log(`opencode-sql-security-guardrails

Usage:
  opencode-sql-security-guardrails init [options]
  opencode-sql-security-guardrails scan [options]
  opencode-sql-security-guardrails help
  opencode-sql-security-guardrails version

Commands:
  init       Install the sql-security-review skill and AGENTS.md guardrail snippet
  scan       Scan SQL-bearing files from the command line
  help       Show this help message
  version    Show package version

Init options:
  --force       Overwrite existing skill and managed AGENTS.md block
  --no-agents   Install the skill but do not create or update AGENTS.md

Scan options:
  --changed          Scan staged, unstaged, and untracked files
  --staged           Scan only staged files
  --all              Scan all tracked files
  --mode=<mode>      Alternative mode syntax: changed, staged, all
  --fail-on <level>  Fail when findings are at or above: info, low, medium, high
  --json             Print machine-readable JSON output

Global options:
  --help, -h     Show this help message
  --version, -v  Show package version

Examples:
  opencode-sql-security-guardrails init
  opencode-sql-security-guardrails init --force
  opencode-sql-security-guardrails scan --staged --fail-on high
  opencode-sql-security-guardrails scan --changed --fail-on medium --json
`)
}

function runInit(options: InitOptions): void {
  const packageRoot = getPackageRoot()

  const skillSource = join(packageRoot, "templates", "skills", "sql-security-review", "SKILL.md")
  const agentsSnippetSource = join(packageRoot, "templates", "AGENTS.sql-security.md")

  const skillTarget = join(options.cwd, ".opencode", "skills", "sql-security-review", "SKILL.md")

  if (!existsSync(skillSource)) {
    throw new Error(`Missing template: ${skillSource}`)
  }

  if (!existsSync(agentsSnippetSource)) {
    throw new Error(`Missing template: ${agentsSnippetSource}`)
  }

  console.log("opencode-sql-security-guardrails init")
  console.log(`Project root: ${options.cwd}`)
  console.log("")

  const skillResult = copyTemplateFile(skillSource, skillTarget, options.force)
  printResult("Skill", skillResult, skillTarget)

  if (options.updateAgents) {
    const agentsResult = appendAgentsSnippet(options.cwd, agentsSnippetSource, options.force)
    printResult("AGENTS.md", agentsResult, join(options.cwd, "AGENTS.md"))
  } else {
    console.log("AGENTS.md: skipped because --no-agents was provided")
  }

  console.log("")
  console.log("Next steps:")
  console.log("1. Restart OpenCode from this project root.")
  console.log("2. Ensure the plugin is loaded via opencode.json or a local proxy plugin.")
  console.log("3. Ask OpenCode to invoke sql_raw_query_scanner with mode changed.")
  console.log("4. If SQL-bearing files are found, invoke the sql-security-review skill.")
}

function getBlockingFindings(
  files: SqlScannerResult[],
  failOn: SqlFindingSeverity
): Array<{
  path: string
  line: number
  kind: string
  severity: SqlFindingSeverity
  preview: string
}> {
  return files.flatMap((file) =>
    file.locations
      .filter((location) => severityAtLeast(location.severity, failOn))
      .map((location) => ({
        path: file.path,
        line: location.line,
        kind: location.kind,
        severity: location.severity,
        preview: location.preview
      }))
  )
}

async function runScan(options: ScanOptions): Promise<void> {
  const files = await scanSqlFiles(options.mode, options.cwd)
  const blockingFindings = getBlockingFindings(files, options.failOn)

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          mode: options.mode,
          failOn: options.failOn,
          count: files.length,
          blockingCount: blockingFindings.length,
          files,
          blockingFindings
        },
        null,
        2
      )
    )
  } else {
    printScanReport(options, files, blockingFindings)
  }

  if (blockingFindings.length > 0) {
    process.exitCode = 1
  }
}

function printScanReport(
  options: ScanOptions,
  files: SqlScannerResult[],
  blockingFindings: ReturnType<typeof getBlockingFindings>
): void {
  console.log("SQL security guardrail scan")
  console.log(`Mode: ${options.mode}`)
  console.log(`Fail on: ${options.failOn}`)
  console.log(`SQL-bearing files: ${files.length}`)
  console.log(`Blocking findings: ${blockingFindings.length}`)
  console.log("")

  if (files.length === 0) {
    console.log("No SQL-bearing files detected.")
    return
  }

  if (blockingFindings.length === 0) {
    console.log(`No findings at or above severity '${options.failOn}'.`)
    return
  }

  console.error("SQL guardrail failed.")
  console.error("")
  console.error(`Findings at or above severity '${options.failOn}' were detected:`)
  console.error("")

  for (const finding of blockingFindings) {
    console.error(`- ${finding.path}:${finding.line}`)
    console.error(`  severity: ${finding.severity}`)
    console.error(`  kind: ${finding.kind}`)
    console.error(`  preview: ${finding.preview}`)
    console.error("")
  }

  console.error("Recommended remediation:")
  console.error("1. Run OpenCode from the repository root.")
  console.error("2. Use sql_security_review_context with mode changed or staged.")
  console.error("3. Invoke the sql-security-review skill using that context.")
  console.error("4. Fix the finding or document why it is safe.")
}

async function main(): Promise<void> {
  try {
    const parsed = parseArgs(process.argv)
    const packageRoot = getPackageRoot()

    switch (parsed.command) {
      case "help":
        printHelp()
        return

      case "version":
        console.log(getPackageVersion(packageRoot))
        return

      case "init":
        runInit(parsed.options)
        return
      case "scan":
        if (!parsed.scanOptions) {
          throw new Error("Missing scan options")
        }

        await runScan(parsed.scanOptions)
        return
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    console.error(`Error: ${message}`)
    console.error("")
    printHelp()
    process.exitCode = 1
  }
}

void main()
