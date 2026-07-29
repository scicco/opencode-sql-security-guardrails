---
name: sql-security-review
description: Review changed SQL-bearing files for SQL injection, unsafe dynamic identifiers, raw SQL execution, missing tenant scoping, and sensitive SQL logging. Use after sql_raw_query_scanner or sql_security_review_context returns SQL-bearing files.
compatibility: opencode
metadata:
  category: security
  topic: sql-injection
---

# SQL Security Review

## Purpose

Review changed SQL-bearing files for SQL injection, unsafe SQL construction, unsafe dynamic identifiers, unsafe raw SQL execution, missing tenant/project scoping, and sensitive SQL logging.

This skill is a semantic security review. The `sql_raw_query_scanner` and `sql_security_review_context` tools identify candidate files and gather context, but they do not decide whether the change is safe.

## When to use

Use this skill whenever:

- `sql_raw_query_scanner` returns one or more files;
- `sql_security_review_context` returns one or more files;
- a change modifies database access code, query builders, migrations, repositories, services, API endpoints, or SQL logging;
- a change adds or modifies raw SQL strings or dynamic SQL construction.

## Required inputs

Before reviewing, gather:

1. JSON output from `sql_security_review_context` if available;
2. otherwise JSON output from `sql_raw_query_scanner`;
3. the relevant git diff;
4. contents of the listed files;
5. lint/test results if already run.

If `sql_security_review_context` is available, prefer it because it includes scanner results, relevant diff, and file contents in one payload.

## Project-specific non-goals

These are intentionally out of scope unless the current change modifies them or exposes them to user-controlled input:

- `SQLBuilder` `_sql` passthrough;
- `_raw_subqueries` handling;
- patient cache key based on globally unique project name.

Do not block a task only because one of these pre-existing deferred risks exists unchanged.

## Review checklist

### 1. Parameterized values

Values derived from any of the following must not be interpolated directly into SQL:

- request body;
- query string;
- route params;
- authenticated user context;
- uploaded files;
- project/patient/job records;
- mapping/configuration content;
- generated content;
- database rows that may be user-controlled;
- environment/config values that can be modified outside trusted code.

Expected safe pattern for PostgreSQL:

- SQL text uses `$1`, `$2`, etc.;
- values are passed separately in the parameter array;
- parameter indexes match the values array.

Flag direct interpolation such as template literals or string concatenation when the interpolated value is not a trusted compile-time constant.

### 2. Dynamic identifiers

Review dynamic:

- table names;
- schema names;
- column names;
- sort fields;
- `ORDER BY` clauses;
- `GROUP BY` clauses;
- `LIMIT` and `OFFSET`;
- sort direction;
- JSON path fragments used inside SQL.

Identifiers cannot be parameterized with `$1`. They must be validated through a strict allowlist before being quoted/interpolated.

If `pg-format %I` is used, verify:

- it is used only for identifiers;
- the value is preferably allowlisted before formatting;
- `%L` is used for literals only when placeholders are not practical and the input source is understood.

### 3. Raw SQL execution

Flag execution of SQL assembled from:

- stored database fields;
- job rows;
- mapping files;
- LLM/generated content;
- uploaded files;
- request-controlled strings;
- raw passthrough fields;
- unchecked template literals;
- string concatenation.

If raw SQL execution is intentional, verify there is a validation gate that:

- rejects dangerous SQL verbs;
- rejects multi-statement SQL;
- validates target tables/columns with allowlists;
- preserves existing transaction/savepoint error handling;
- fails closed.

### 4. Query builders and helper functions

For custom SQL builders, check:

- whether values are escaped or parameterized;
- whether table/column identifiers are allowlisted;
- whether any escape hatch bypasses validation;
- whether subqueries are structured or raw text;
- whether generated SQL can be influenced by external data.

### 5. Multi-tenant and project scoping

For project/user-scoped APIs, verify that database lookups, status queries, updates, and deletes are scoped by the current user and project where appropriate.

Flag queries that return the latest global job, project, patient, or status when the API endpoint is user/project-specific.

### 6. Logging and API error exposure

Flag SQL or SQL-derived error payloads that expose sensitive literals in:

- `console.log`;
- `console.error`;
- logger calls;
- API responses;
- job error rows;
- debug output;
- slow query logs.

SQL logs should redact string literals, dates, numbers, patient identifiers, and clinical values unless an explicit development-only override is used.

### 7. Migrations and DDL

Migrations can contain raw SQL, but still verify:

- no user-controlled interpolation;
- no unsafe dynamic identifiers;
- no destructive operation outside migration intent;
- no accidental data exposure through logs.

## Severity guidance

Use severity consistently:

- Critical: attacker-controlled SQL can execute arbitrary statements, cross-tenant data access, or destructive operations.
- High: direct user-controlled interpolation into SQL values or identifiers; unsafe raw SQL execution reachable from application flows.
- Medium: missing allowlist for dynamic identifiers mitigated by quoting; sensitive SQL logging; project/user scoping ambiguity.
- Low: defensive hardening issue with no clear exploit path.
- Info: safe SQL-bearing change or non-blocking observation.

## Output format

Return exactly one verdict section.

For safe changes:

SQL_SECURITY_REVIEW: OK

Summary:

- No SQL injection, unsafe SQL construction, unsafe dynamic identifier, unsafe raw SQL execution, missing project/user scoping, or sensitive SQL logging issue was found in the reviewed changes.

Files reviewed:

- path/to/file.js

Notes:

- Mention any non-blocking observations here.

For unsafe changes:

SQL_SECURITY_REVIEW: KO

Findings:

1. File: path/to/file.js
   Line: 123
   Severity: Critical | High | Medium | Low
   Type: SQL injection | unsafe dynamic identifier | unsafe raw SQL execution | missing tenant scoping | sensitive SQL logging | other
   Problem:
   Describe the specific unsafe pattern.
   Exploit scenario:
   Explain how untrusted input could reach the SQL or how data could leak.
   Required remediation:
   Give concrete code-level guidance.
   Suggested test:
   Describe the test that should be added or updated.

Do not mark the task complete while the review is KO.

## Review discipline

- Review the diff first, then the full file context.
- Distinguish changed code from pre-existing unchanged risks.
- Do not report deferred project-specific non-goals unless the current change makes them worse.
- Prefer precise findings over generic warnings.
- If scanner output is noisy, inspect the actual code before deciding.
- If evidence is insufficient, say what is missing and avoid false certainty.
