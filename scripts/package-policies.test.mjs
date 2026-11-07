import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

// Runs the repository's actual policy SQL against an in-memory Postgres.
// No Supabase client, credentials, network connection, or live database.
// The small schema below is a test fixture, NOT a production schema baseline.
const readSql = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const legacySql = readSql("supabase/migrations/fix_rls_policies.sql");
const historicalSql = readSql("supabase/migrations/20261113_package_edit_and_policies.sql");
const policyStart = historicalSql.indexOf("-- 5. Loose and duplicate policies");
assert.ok(policyStart >= 0, "Historical policy section marker must exist");
const historicalDrops = historicalSql.slice(policyStart);
const reconciliationSql = readSql("supabase/migrations/20261128_reconcile_package_policies.sql");
const catalogSql = readSql("supabase/tests/package_policy_catalog.sql");

const canonicalNames = [
  "Admin manages all packages",
  "Approved operator creates own draft packages",
  "Approved operator deletes own draft packages",
  "Approved operator updates own draft packages",
  "Operator views own packages",
  "Public views published packages",
].sort();
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const users = { admin: uuid(1), owner: uuid(2), other: uuid(3), pending: uuid(4), tourist: uuid(5) };
const operators = { own: uuid(11), other: uuid(12), pending: uuid(13) };
const statuses = ["draft", "pending_review", "published", "rejected", "archived"];
const packages = Object.fromEntries(statuses.map((status, i) => [status, uuid(21 + i)]));
packages.otherDraft = uuid(31);
packages.otherPublished = uuid(32);
packages.pendingDraft = uuid(33);

async function fixture(t, { reconcile = true } = {}) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
    $$;
    CREATE TYPE package_status AS ENUM ('draft', 'pending_review', 'published', 'rejected', 'archived');
    CREATE TYPE accreditation_status AS ENUM ('pending', 'approved', 'rejected');
    CREATE TABLE profiles (id uuid PRIMARY KEY, role text NOT NULL);
    CREATE TABLE tours_operators (
      id uuid PRIMARY KEY,
      profile_id uuid NOT NULL REFERENCES profiles(id),
      accreditation_status accreditation_status NOT NULL
    );
    CREATE TABLE tours_packages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      operator_id uuid NOT NULL REFERENCES tours_operators(id),
      title text NOT NULL,
      status package_status NOT NULL DEFAULT 'draft'
    );
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
    GRANT SELECT ON profiles, tours_operators TO authenticated;
    GRANT SELECT ON tours_packages TO anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON tours_packages TO authenticated;

    INSERT INTO profiles VALUES
      ('${users.admin}', 'admin'), ('${users.owner}', 'operator'),
      ('${users.other}', 'operator'), ('${users.pending}', 'operator'),
      ('${users.tourist}', 'tourist');
    INSERT INTO tours_operators VALUES
      ('${operators.own}', '${users.owner}', 'approved'),
      ('${operators.other}', '${users.other}', 'approved'),
      ('${operators.pending}', '${users.pending}', 'pending');
    INSERT INTO tours_packages (id, operator_id, title, status) VALUES
      ('${packages.draft}', '${operators.own}', 'Own draft', 'draft'),
      ('${packages.pending_review}', '${operators.own}', 'Own pending', 'pending_review'),
      ('${packages.published}', '${operators.own}', 'Own published', 'published'),
      ('${packages.rejected}', '${operators.own}', 'Own rejected', 'rejected'),
      ('${packages.archived}', '${operators.own}', 'Own archived', 'archived'),
      ('${packages.otherDraft}', '${operators.other}', 'Other draft', 'draft'),
      ('${packages.otherPublished}', '${operators.other}', 'Other published', 'published'),
      ('${packages.pendingDraft}', '${operators.pending}', 'Pending operator draft', 'draft');
  `);
  // Replay the legacy definitions and the actual historical DROP section.
  // The editor RPC's other DDL is unrelated to these direct-table RLS tests.
  await db.exec(legacySql);
  await db.exec(historicalDrops);
  if (reconcile) await db.exec(reconciliationSql);
  return db;
}

async function names(db) {
  const result = await db.query(`
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tours_packages'
    ORDER BY policyname
  `);
  return result.rows.map((row) => row.policyname);
}

async function catalog(db) {
  return (await db.query(catalogSql)).rows;
}

async function assertCatalogPass(db) {
  const rows = await catalog(db);
  assert.equal(rows.length, 7);
  assert.deepEqual(rows.filter((row) => !row.ok), []);
}

// SET LOCAL and transaction-local claims prevent identity leaking between
// probes. Only fixed, known test role names enter the SQL string.
async function asUser(db, user, sql, params = [], role = "authenticated") {
  assert.ok(role === "anon" || role === "authenticated");
  return db.transaction(async (tx) => {
    await tx.exec(`SET LOCAL ROLE ${role}`);
    await tx.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: user, role }),
    ]);
    return tx.query(sql, params);
  });
}

const privilegeError = (error) => error.code === "42501";
const visibleIds = (result) => result.rows.map((row) => row.id).sort();

async function assertNoUpdateOrDelete(db, user, packageId) {
  for (const sql of [
    "UPDATE tours_packages SET title = 'Forbidden' WHERE id = $1 RETURNING id",
    "DELETE FROM tours_packages WHERE id = $1 RETURNING id",
  ]) {
    assert.deepEqual((await asUser(db, user, sql, [packageId])).rows, []);
  }
}

test("historical DROPs reproduce the drift; reconciliation restores all six policies", async (t) => {
  const db = await fixture(t, { reconcile: false });
  assert.deepEqual(await names(db), ["Admins can update all packages", "Admins can view all packages"]);
  assert.deepEqual(visibleIds(await asUser(db, null, "SELECT id FROM tours_packages", [], "anon")), []);
  // Six missing canonical policies, two extra old admin policies; RLS passes.
  assert.equal((await catalog(db)).filter((row) => !row.ok).length, 8);

  await db.exec(reconciliationSql);
  assert.deepEqual(await names(db), canonicalNames);
  await assertCatalogPass(db);
  assert.equal((await asUser(db, null, "SELECT id FROM tours_packages", [], "anon")).rows.length, 2);
});

test("reconciles the eight live-shaped policy names and is safe to re-run", async (t) => {
  const db = await fixture(t);
  // Recreate the live name/role overlap using repository SQL: five canonical
  // operator/public rules, a PUBLIC admin ALL rule, and two old admin rules.
  await db.exec('ALTER POLICY "Admin manages all packages" ON tours_packages TO PUBLIC');
  await db.exec(legacySql);
  await db.exec(historicalDrops);
  assert.equal((await names(db)).length, 8);
  const before = await db.query("SELECT id, operator_id, title, status FROM tours_packages ORDER BY id");

  await db.exec(reconciliationSql);
  await db.exec(reconciliationSql);
  assert.deepEqual(await names(db), canonicalNames);
  await assertCatalogPass(db);
  assert.deepEqual((await db.query("SELECT id, operator_id, title, status FROM tours_packages ORDER BY id")).rows, before.rows);
});

test("anon and ordinary tourists read only published packages and cannot write", async (t) => {
  const db = await fixture(t);
  for (const [user, role] of [[null, "anon"], [users.tourist, "authenticated"]]) {
    assert.deepEqual(
      visibleIds(await asUser(db, user, "SELECT id FROM tours_packages", [], role)),
      [packages.published, packages.otherPublished].sort(),
    );
    await assert.rejects(
      asUser(db, user, "INSERT INTO tours_packages (operator_id, title) VALUES ($1, 'Forbidden')", [operators.own], role),
      privilegeError,
    );
    if (role === "anon") {
      for (const sql of [
        "UPDATE tours_packages SET title = 'Forbidden' WHERE id = $1 RETURNING id",
        "DELETE FROM tours_packages WHERE id = $1 RETURNING id",
      ]) {
        await assert.rejects(asUser(db, user, sql, [packages.published], role), privilegeError);
      }
    } else {
      await assertNoUpdateOrDelete(db, user, packages.published);
    }
  }
});

test("operators read their own packages in every status, but not another operator's draft", async (t) => {
  const db = await fixture(t);
  assert.deepEqual(
    visibleIds(await asUser(db, users.owner, "SELECT id FROM tours_packages WHERE operator_id = $1", [operators.own])),
    statuses.map((status) => packages[status]).sort(),
  );
  assert.deepEqual(visibleIds(await asUser(db, users.owner, "SELECT id FROM tours_packages WHERE id = $1", [packages.otherDraft])), []);
});

test("operator INSERT requires own approved operator and draft status", async (t) => {
  const db = await fixture(t);
  const inserted = await asUser(db, users.owner,
    "INSERT INTO tours_packages (operator_id, title, status) VALUES ($1, 'Allowed', 'draft') RETURNING id",
    [operators.own],
  );
  assert.equal(inserted.rows.length, 1);
  for (const status of statuses.filter((status) => status !== "draft")) {
    await assert.rejects(asUser(db, users.owner,
      "INSERT INTO tours_packages (operator_id, title, status) VALUES ($1, 'Forbidden', $2)",
      [operators.own, status],
    ), privilegeError);
  }
  for (const operator of [operators.other, operators.pending]) {
    await assert.rejects(asUser(db, users.owner,
      "INSERT INTO tours_packages (operator_id, title) VALUES ($1, 'Forbidden')", [operator],
    ), privilegeError);
  }
});

test("operator UPDATE starts only at an own draft and permits only draft/pending_review destinations", async (t) => {
  const db = await fixture(t);
  for (const status of ["draft", "pending_review"]) {
    const result = await asUser(db, users.owner,
      "UPDATE tours_packages SET title = 'Allowed', status = $2 WHERE id = $1 RETURNING id",
      [packages.draft, status],
    );
    assert.equal(result.rows.length, 1);
    await db.query("UPDATE tours_packages SET status = 'draft' WHERE id = $1", [packages.draft]);
  }
  for (const status of ["pending_review", "published", "rejected", "archived"]) {
    await assertNoUpdateOrDelete(db, users.owner, packages[status]);
  }
  await assertNoUpdateOrDelete(db, users.owner, packages.otherDraft);
  for (const status of ["published", "rejected", "archived"]) {
    await assert.rejects(asUser(db, users.owner,
      "UPDATE tours_packages SET status = $2 WHERE id = $1 RETURNING id", [packages.draft, status],
    ), privilegeError);
  }
  await assert.rejects(asUser(db, users.owner,
    "UPDATE tours_packages SET operator_id = $2 WHERE id = $1 RETURNING id", [packages.draft, operators.other],
  ), privilegeError);
});

test("operator DELETE is limited to own drafts", async (t) => {
  const db = await fixture(t);
  for (const status of ["pending_review", "published", "rejected", "archived"]) {
    assert.deepEqual((await asUser(db, users.owner, "DELETE FROM tours_packages WHERE id = $1 RETURNING id", [packages[status]])).rows, []);
  }
  assert.deepEqual((await asUser(db, users.owner, "DELETE FROM tours_packages WHERE id = $1 RETURNING id", [packages.otherDraft])).rows, []);
  assert.equal((await asUser(db, users.owner, "DELETE FROM tours_packages WHERE id = $1 RETURNING id", [packages.draft])).rows.length, 1);
});

test("unapproved operators retain own-package visibility but cannot insert, update, or delete", async (t) => {
  const db = await fixture(t);
  assert.deepEqual(visibleIds(await asUser(db, users.pending, "SELECT id FROM tours_packages WHERE operator_id = $1", [operators.pending])), [packages.pendingDraft]);
  await assert.rejects(asUser(db, users.pending,
    "INSERT INTO tours_packages (operator_id, title) VALUES ($1, 'Forbidden')", [operators.pending],
  ), privilegeError);
  await assertNoUpdateOrDelete(db, users.pending, packages.pendingDraft);
});

test("authenticated admins retain full CRUD without granting admin access to anon", async (t) => {
  const db = await fixture(t);
  assert.equal((await asUser(db, users.admin, "SELECT id FROM tours_packages")).rows.length, 8);
  const inserted = await asUser(db, users.admin,
    "INSERT INTO tours_packages (operator_id, title, status) VALUES ($1, 'Admin created', 'rejected') RETURNING id",
    [operators.other],
  );
  assert.equal(inserted.rows.length, 1);
  assert.equal((await asUser(db, users.admin,
    "UPDATE tours_packages SET status = 'published' WHERE id = $1 RETURNING id", [packages.pending_review],
  )).rows.length, 1);
  assert.equal((await asUser(db, users.admin, "DELETE FROM tours_packages WHERE id = $1 RETURNING id", [inserted.rows[0].id])).rows.length, 1);
  // The admin's pending_review -> published change is now publicly visible.
  assert.deepEqual(
    visibleIds(await asUser(db, users.admin, "SELECT id FROM tours_packages", [], "anon")),
    [packages.published, packages.otherPublished, packages.pending_review].sort(),
  );
});

test("catalog check detects changed predicates, role targets, extra policies, and disabled RLS", async (t) => {
  const db = await fixture(t);
  const scenarios = [
    { sql: 'ALTER POLICY "Approved operator creates own draft packages" ON tours_packages TO authenticated WITH CHECK (true)', failure: "Approved operator creates own draft packages" },
    { sql: 'ALTER POLICY "Public views published packages" ON tours_packages TO authenticated', failure: "Public views published packages" },
    { sql: 'CREATE POLICY "Unexpected package access" ON tours_packages FOR SELECT TO authenticated USING (true)', failure: "Unexpected package access", cleanup: 'DROP POLICY "Unexpected package access" ON tours_packages' },
    { sql: "ALTER TABLE tours_packages DISABLE ROW LEVEL SECURITY", failure: "RLS enabled on public.tours_packages" },
  ];
  for (const scenario of scenarios) {
    await db.exec(scenario.sql);
    const failures = (await catalog(db)).filter((row) => !row.ok);
    assert.deepEqual(failures.map((row) => row.check_name), [scenario.failure]);
    if (scenario.cleanup) await db.exec(scenario.cleanup);
    await db.exec(reconciliationSql);
    await assertCatalogPass(db);
  }
});

test("a failed reconciliation rolls back its DROPs instead of leaving a policy gap", async (t) => {
  const db = await fixture(t);
  const brokenSql = reconciliationSql.replace("TO authenticated", "TO missing_test_role");
  await assert.rejects(db.exec(brokenSql));
  await db.exec("ROLLBACK");
  assert.deepEqual(await names(db), canonicalNames);
  await assertCatalogPass(db);
});
