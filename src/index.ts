import { tool, type Plugin } from "@opencode-ai/plugin"
import { Plugin as PluginV2 } from "@opencode/plugin"
import { scanSqlFiles, type ScanMode } from "./scanner.js"
import { buildSqlSecurityReviewContext } from "./review-context.js"

export const SqlSecurityGuardrailsPlugin: Plugin = async () => {
  return {
    tool: {
      sql_raw_query_scanner: tool({
        description:
          "Return a JSON list of changed or all project files that contain likely raw SQL queries or SQL execution calls.",
        args: {
          mode: tool.schema
            .enum(["changed", "staged", "all"])
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
            .enum(["changed", "staged", "all"])
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

export default {
  ...PluginV2.define({
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
  }),
  async server(input: Parameters<Plugin>[0]) {
    return SqlSecurityGuardrailsPlugin(input)
  }
}
