import { Plugin as PluginV2 } from "@opencode/plugin"
import { scanSqlFiles, type ScanMode } from "./scanner.js"
import { buildSqlSecurityReviewContext } from "./review-context.js"

const modeInput = {
  type: "object",
  properties: {
    mode: {
      type: "string",
      enum: ["changed", "staged", "all"],
      default: "changed",
      description: "Scan changed files or all repository files"
    }
  },
  additionalProperties: false
}

export default PluginV2.define({
  id: "sql-security-guardrails",
  async setup(ctx) {
    const cwd = ctx.location.directory

    await ctx.tool.transform((editor) => {
      editor.add({
        name: "sql_raw_query_scanner",
        description:
          "Return a JSON list of changed or all project files that contain likely raw SQL queries or SQL execution calls.",
        input: modeInput,
        execute: async (input) => {
          const mode = (input as { mode?: ScanMode }).mode ?? "changed"
          const files = await scanSqlFiles(mode, cwd)
          return { content: JSON.stringify({ mode, count: files.length, files }, null, 2) }
        }
      })

      editor.add({
        name: "sql_security_review_context",
        description:
          "Build a SQL security review context containing scanner results, relevant git diff, and detected file contents.",
        input: modeInput,
        execute: async (input) => {
          const mode = (input as { mode?: ScanMode }).mode ?? "changed"
          const reviewContext = await buildSqlSecurityReviewContext(mode, cwd)
          return { content: JSON.stringify(reviewContext, null, 2) }
        }
      })
    })
  }
})
