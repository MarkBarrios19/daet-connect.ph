# Tour package policy reconciliation

## What drifted

`supabase/migrations/20261113_package_edit_and_policies.sql` ends by dropping four package policies. The replacement policies were created in the live project under different names, but that DDL was not saved in the repository. Replaying the repository's historical policy path therefore removed public/operator access instead of replacing the loose rules.

A **read-only** inspection of the live catalog on 2026-11-07 found eight policies: five operator/public replacements, `Admin manages all packages` (an ALL policy targeting PUBLIC), and the older `Admins can view all packages` / `Admins can update all packages`. No migration was applied to the live project.

The historical migration is retained, with a pointer to the required follow-up:

**`supabase/migrations/20261128_reconcile_package_policies.sql`**

This forward migration enables RLS and explicitly creates six canonical policies. It drops the known old names and canonical names before recreating the canonical definitions, so it works on a clean policy path, a database that already ran the historical DROPs, or the live-shaped eight-policy state. It is transaction-wrapped and safe to re-run. It does not drop unrelated/unknown policies; the catalog check flags those for review.

## Intended access

These are **direct table access** rules. Table privileges and the core schema are prerequisites; this migration does not grant table permissions or create tables.

| Caller | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| Anonymous visitor | Published only | No | No | No |
| Authenticated user without an operator record | Published only | No | No | No |
| Approved operator | Own packages in every status, plus published packages | Own operator ID, draft only | Own drafts; destination draft or pending_review only | Own drafts only |
| Operator not currently approved | Own packages in every status, plus published packages | No | No | No |
| Authenticated Tourism Office admin | All | All | All | All |

The canonical names are:

- `Approved operator creates own draft packages` — INSERT, authenticated.
- `Approved operator updates own draft packages` — UPDATE, authenticated.
- `Approved operator deletes own draft packages` — DELETE, authenticated.
- `Operator views own packages` — SELECT, authenticated.
- `Public views published packages` — SELECT, PUBLIC (including anon and authenticated).
- `Admin manages all packages` — ALL, authenticated, with both USING and WITH CHECK.

Ownership and approval are repeated in the update policy's old-row and new-row checks. An operator cannot reassign a package to another operator or use a draft to introduce a published/rejected/archived row. The draft-to-pending_review destination is retained from the live contract for the legacy submit path. Prefer `submit_package_for_review`, which validates required prices/stops before submission.

Published and rejected package edits use `update_package_and_relations`; that SECURITY DEFINER RPC checks ownership/approval and the package lifecycle. The later `20261127_live_published_package_edits.sql` behavior is unchanged. This reconciliation does not restore its removed published-field allowlist.

The admin ALL policy preserves the live admin's CRUD capability. It now explicitly targets authenticated users and checks `profiles.role = 'admin'` directly. The two narrower admin policies are redundant with ALL and are removed by the forward migration. This is an intentional canonicalization, not a byte-for-byte copy of the live admin policy expressions. RLS is enabled, not forced; privileged service-role/owner access is outside these client policies.

## Clean-install scope and order

The repository still lacks a complete core-schema baseline (tracked in `docs/AUDIT_AND_ROADMAP.md`, item 18). **These files are not a complete empty-database rebuild.** In particular, the Supabase roles/auth helper and the `profiles`, `tours_operators`, `tours_packages`, and related package tables must already be provisioned.

For a clean database with those prerequisites, apply the supported schema migrations in version order and include `20261128_reconcile_package_policies.sql` as the final package-policy step. Do not stop after the `20261113` DROPs. The new migration does not require the ad-hoc `fix_rls_policies.sql` to have run: it creates all six policies itself. Do not alphabetically replay the directory's `APPLY_THIS_*`, `FIX_*`, `DEBUG_*`, or test-account scripts as a migration runner.

For an existing project, the owner can apply the new forward migration separately; there is no need to replay the historical migration. **This change does not authorize or perform a live deployment.** Until the owner applies it, live will retain its eight-policy shape.

## Verification

### Automated, offline regression test

```sh
npm ci
node --test scripts/package-policies.test.mjs
```

The test also runs as part of `npm run test:scripts` in CI. It uses the pinned PGlite dev dependency (real PostgreSQL 18 in WebAssembly, in memory), a minimal core-schema/auth fixture, and the actual repository SQL. It never reads Supabase environment variables or contacts a hosted database.

Coverage includes:

- reproducing the historical missing-policy bug, then repairing it;
- reconciling the eight live-shaped names and re-running without changing package rows;
- public, tourist, operator, unapproved-operator and admin access;
- ownership, accreditation, old/new status checks, and rejection of owner reassignment;
- the exact catalog check, including extra policies and disabled RLS;
- rollback of the entire reconciliation if replacement creation fails.

This is a policy-level clean-path test, not a claim that the missing full-schema baseline has been solved or that every application RPC was exercised.

### Read-only database policy check

After the reconciliation migration has been applied to a **clean/staging database**, run:

```sh
psql "$DATABASE_URL" -f supabase/tests/package_policy_catalog.sql
```

The query can also be pasted into the SQL editor. It only reads catalogs: no fixtures, writes, role changes, or migrations. **All seven rows must have `ok = true`.** The output includes expected/actual definitions so missing, extra, renamed, widened, restrictive, or differently targeted policies are visible. A false row is a reported failure; the query itself does not raise an exception or change anything.

The check compares policy commands, role targets, permissive mode, and exact predicates after removing whitespace and optional `public.` qualification. It expects the PostgreSQL 17/18 deparser and the optimized `(SELECT auth.uid())` form. If the contract intentionally changes, update the migration, catalog check, access matrix and regression test together.

On the inspected live project **before** deployment, the five operator/public definitions and RLS match; the admin ALL definition differs and the two redundant admin policies are extra. Those three catalog failures are expected until the owner applies the forward migration. Running this check is not permission to apply that migration automatically.
