import { tool, type Plugin } from "@opencode-ai/plugin"
import { scanSqlFiles } from "./scanner.js"
import { buildSqlSecurityReviewContext } from "./review-context.js"

export const SqlSecurityGuardrailsPlugin: Plugin = async () => {
  return {
    tool: {
      sql_raw_query_scanner: tool({
        description:
          "Return a JSON list of changed or all project files that contain likely raw SQL queries or SQL execution calls.",
        args: {
          mode: tool.schema
            .enum(["changed", "all"])
            .default("changed")
            .describe("Scan changed files or all repository files")
        },
        async execute(args, context) {
          const files = await scanSqlFiles(args.mode, context.worktree)

          return JSON.stringify(
            {
              mode: args.mode,
              count: files.length,
              files
            },
            null,
            2
          )
        }
      }),

      sql_security_review_context: tool({
        description:
          "Build a SQL security review context containing scanner results, relevant git diff, and detected file contents.",
        args: {
          mode: tool.schema
            .enum(["changed", "all"])
            .default("changed")
            .describe("Build review context from changed files or all repository files")
        },
        async execute(args, context) {
          const reviewContext = await buildSqlSecurityReviewContext(args.mode, context.worktree)
          return JSON.stringify(reviewContext, null, 2)
        }
      })
    }
  }
}

export default SqlSecurityGuardrailsPlugin
