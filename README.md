# opencode-sql-security-guardrails

OpenCode plugin and skill templates for SQL security guardrails.

This package adds tools and project instructions that help OpenCode detect and review SQL-bearing code changes for:

- SQL injection;
- unsafe dynamic identifiers;
- unsafe raw SQL execution;
- missing user/project scoping;
- sensitive SQL logging and API error exposure.

The intended workflow is:

1. run lint and tests;
2. run the SQL scanner tool;
3. if SQL-bearing files are detected, run the `sql-security-review` skill;
4. block task completion if the review returns `SQL_SECURITY_REVIEW: KO`.

## What this package provides

### OpenCode plugin tools

The plugin exposes these tools:

#### `sql_raw_query_scanner`

Scans changed or all project files and returns a JSON list of files that likely contain raw SQL, database query calls, SQL strings, or SQL-building patterns.

Example output:

```json
{
  "mode": "changed",
  "count": 1,
  "files": [
    {
      "name": "example.js",
      "path": "src/example.js",
      "reasons": [
        "SQL-like template literal contains interpolation",
        "database query execution call"
      ],
      "locations": [
        {
          "line": 12,
          "kind": "sql-template-interpolation",
          "severity": "high",
          "preview": "return db.query(`SELECT * FROM users WHERE id = ${userId}`)"
        }
      ]
    }
  ]
}
```

#### `sql_security_review_context`

Builds a review context containing:

- scanner output;
- relevant git diff;
- contents of detected files;
- instructions for the `sql-security-review` skill.

Use this tool before invoking the review skill.

### Skill template

The package includes:

```text
templates/skills/sql-security-review/SKILL.md
```

The init command installs it to:

```text
.opencode/skills/sql-security-review/SKILL.md
```

### AGENTS.md guardrail snippet

The package includes:

```text
templates/AGENTS.sql-security.md
```

The init command appends it to:

```text
AGENTS.md
```

inside a managed block:

```md
<!-- opencode-sql-security-guardrails:start -->

...
<!-- opencode-sql-security-guardrails:end -->
```

This makes the guardrail visible to OpenCode in future sessions.

## Installation during local development

From this plugin repository:

```bash
npm install
npm run build
npm link
```

In the target project:

````bash
npm link @scicco/opencode-sql-security-guardrails
```

Then configure OpenCode.

## Configure OpenCode

### Option A: npm plugin configuration

Add this to the target project's root `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-sql-security-guardrails"]
}
````

Restart OpenCode after changing plugin configuration.

### Option B: local proxy plugin for development

If OpenCode does not resolve the linked package during development, create:

```text
.opencode/plugins/sql-security-guardrails.js
```

with:

```js
import SqlSecurityGuardrailsPlugin from "/absolute/path/to/opencode-sql-security-guardrails/dist/src/index.js"

export { SqlSecurityGuardrailsPlugin }
```

Then restart OpenCode.

This proxy approach is useful while developing the plugin locally.

## Install the skill and AGENTS.md guardrail

In the target project:

```bash
opencode-sql-security-guardrails init
```

This creates or updates:

```text
.opencode/skills/sql-security-review/SKILL.md
AGENTS.md
```

### Options

Overwrite existing managed files/block:

```bash
opencode-sql-security-guardrails init --force
```

Install the skill but do not modify `AGENTS.md`:

```bash
opencode-sql-security-guardrails init --no-agents
```

Show help:

```bash
opencode-sql-security-guardrails --help
```

Show version:

```bash
opencode-sql-security-guardrails version
```

## Recommended OpenCode workflow

After changing code that may contain SQL, ask OpenCode to run:

```text
Use the sql_raw_query_scanner tool with mode changed. Then print the exact tool output verbatim, without summarizing it.
```

If the scanner returns one or more files, ask:

```text
Use the sql_security_review_context tool with mode changed. Then invoke the sql-security-review skill using that context.
```

Expected safe result:

```text
SQL_SECURITY_REVIEW: OK
```

Expected unsafe result:

```text
SQL_SECURITY_REVIEW: KO
```

When the result is `KO`, OpenCode should fix the findings and repeat:

1. lint;
2. tests;
3. scanner;
4. review context;
5. SQL security review.

Do not mark the task complete while SQL security review is `KO`.

## Scanner modes

### Changed files

```text
mode=changed
```

Scans:

- unstaged changes;
- staged changes;
- untracked files.

This is the recommended mode during normal development.

### All tracked files

```text
mode=all
```

Scans all tracked source files in the repository.

This is useful for baseline audits.

## Project configuration

Projects can optionally add:

```text
.sql-security-guardrails.json
```

If you want to start from the example configuration shipped with this repository, copy it with:

```bash
cp .sql-security-guardrails.example.json .sql-security-guardrails.json
```

Example:

```json
{
  "ignoredPaths": ["fixtures/**", "testdata/**"],
  "extraQueryCallPatterns": ["analyticsDb.query", "tenantDb.raw"],
  "minimumSeverity": "info"
}
```

### `ignoredPaths`

Additional project-specific paths to ignore.

Supports simple glob-like patterns:

- `fixtures/**`
- `testdata/*.js`
- `generated`

A pattern without `*` matches the exact path or anything below that directory. For example, `generated` matches both `generated` and `generated/file.js`.

### `extraQueryCallPatterns`

Additional query execution call names to detect.

Example:

```json
{
  "extraQueryCallPatterns": ["analyticsDb.query", "tenantDb.raw"]
}
```

A pattern such as `analyticsDb.query` detects calls like:

```js
analyticsDb.query("SELECT * FROM events")
```

This is useful for project-specific database wrappers that are not covered by the default scanner rules.

### `minimumSeverity`

Minimum finding severity to include in scanner output.

Allowed values:

```text
info
low
medium
high
```

Default:

```text
info
```

For example, this configuration reports only high-severity scanner findings:

```json
{
  "minimumSeverity": "high"
}
```

Use this carefully. The scanner is a candidate detector, not the final security reviewer. Filtering out lower-severity findings can reduce noise, but it may also hide useful context from the `sql-security-review` skill.

## Detection behavior

The scanner looks for patterns such as:

- `db.query(...)`;
- `client.query(...)`;
- `pool.query(...)`;
- `userDbPool.query(...)`;
- `copyFromStream(...)`;
- `knex.raw(...)`;
- SQL template tags;
- SQL keywords such as `SELECT`, `INSERT INTO`, `UPDATE`, `DELETE FROM`;
- dynamic template interpolation inside SQL-like strings;
- SQL-like string concatenation;
- `ORDER BY`, `LIMIT`, `OFFSET`, `RETURNING`.

The scanner is intentionally conservative. It identifies candidate files for semantic review; it does not decide whether the code is safe.

The `sql-security-review` skill is responsible for deciding `OK` or `KO`.

## Development

Install dependencies:

```bash
npm install
```

Run formatter:

```bash
npm run format
```

Run linter:

```bash
npm run lint
```

Run TypeScript check:

```bash
npm run check
```

Run tests:

```bash
npm run test:all
```

Build:

```bash
npm run build
```

Full local verification:

```bash
npm run format
npm run lint
npm run check
npm run test:all
npm run build
npm pack --dry-run
```

## VS Code setup

This repository is intended to be used with:

- Prettier for formatting;
- ESLint for linting;
- format on save enabled.

Recommended VS Code extensions:

```text
esbenp.prettier-vscode
dbaeumer.vscode-eslint
```

## Repository structure

```text
opencode-sql-security-guardrails/
  bin/
    init.ts
  src/
    config.ts
    index.ts
    scanner.ts
    review-context.ts
  templates/
    AGENTS.sql-security.md
    skills/
      sql-security-review/
        SKILL.md
  tests/
    config.test.ts
    init-cli.test.ts
    review-context.test.ts
    scanner.test.ts
  package.json
  tsconfig.json
  tsconfig.build.json
  eslint.config.js
  README.md
```

## License

MIT
