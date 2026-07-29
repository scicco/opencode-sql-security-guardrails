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

```bash
npm link opencode-sql-security-guardrails
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
```

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

Build:

```bash
npm run build
```

Full local verification:

```bash
npm run format
npm run lint
npm run check
npm run build
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
    index.ts
    scanner.ts
    review-context.ts
  templates/
    AGENTS.sql-security.md
    skills/
      sql-security-review/
        SKILL.md
  package.json
  tsconfig.json
  eslint.config.js
  README.md
```

## Publishing later

When ready to publish:

1. ensure `package.json` has the desired package name;
2. ensure `files` includes `dist`, `templates`, and `README.md`;
3. run:

```bash
npm run format
npm run lint
npm run check
npm run build
```

4. publish:

```bash
npm publish
```

Then users can install via OpenCode by adding the package to `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-sql-security-guardrails"]
}
```

For scoped packages:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@your-scope/opencode-sql-security-guardrails"]
}
```

## License

MIT
