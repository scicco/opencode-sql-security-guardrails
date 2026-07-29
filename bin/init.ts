#!/usr/bin/env node

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

interface ParsedCommand {
  command: "init" | "help" | "version"
  options: InitOptions
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
  opencode-sql-security-guardrails help
  opencode-sql-security-guardrails version

Commands:
  init       Install the sql-security-review skill and AGENTS.md guardrail snippet
  help       Show this help message
  version    Show package version

Options:
  --force       Overwrite existing skill and managed AGENTS.md block
  --no-agents   Install the skill but do not create or update AGENTS.md
  --help, -h    Show this help message
  --version,-v  Show package version

Examples:
  opencode-sql-security-guardrails init
  opencode-sql-security-guardrails init --force
  opencode-sql-security-guardrails init --no-agents
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

function main(): void {
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
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    console.error(`Error: ${message}`)
    console.error("")
    printHelp()
    process.exitCode = 1
  }
}

main()
