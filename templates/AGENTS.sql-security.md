## SQL Security Guardrail

Whenever code changes touch files that may contain database access, SQL strings, query builders, migrations, repositories, services, API endpoints, or SQL logging, run this guardrail before completing the task.

Required sequence:

1. Run the relevant lint command.
2. Run the relevant tests.
3. Invoke the `sql_raw_query_scanner` OpenCode tool with `mode=changed`.
4. If the scanner returns one or more files, invoke the `sql-security-review` skill.
5. If the review returns `SQL_SECURITY_REVIEW: KO`, fix the issue and repeat the guardrail.
6. Do not mark the task complete while SQL security review is KO.

The SQL review must inspect:

- changed files;
- relevant git diff;
- raw SQL strings;
- database query calls such as `db.query`, `client.query`, `pool.query`, `userDbPool.query`;
- dynamic identifiers such as table names, column names, sort fields, `ORDER BY`, `LIMIT`, `OFFSET`;
- raw SQL stored in database fields;
- SQL logging and API error payloads.

Expected safe patterns:

- Use PostgreSQL placeholders such as `$1`, `$2`, etc. for values.
- Pass values separately in parameter arrays.
- Validate dynamic identifiers through strict allowlists before interpolation.
- Use `pg-format` `%I` only for identifiers and preferably after allowlist validation.
- Redact SQL literals in logs and API-visible errors.

Do not complete a task that changes SQL-bearing files until the SQL security review has returned:

```text
SQL_SECURITY_REVIEW: OK
```
