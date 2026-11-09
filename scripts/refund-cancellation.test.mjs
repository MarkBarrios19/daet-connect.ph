import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(new URL("../supabase/migrations/20261129_sync_refund_cancellations.sql", import.meta.url), "utf8");
const repair = await readFile(new URL("../supabase/manual/reconcile_ce5927_cancellation.sql", import.meta.url), "utf8");
const bookingId = "10000000-0000-4000-8000-000000000001";
const paymentId = "20000000-0000-4000-8000-000000000001";
const profileId = "30000000-0000-4000-8000-000000000001";

// A small isolated PostgreSQL database. No PayMongo calls and no live data.
async function database({ bookingStatus = "cancelled", cancellationStatus = "requested", onlinePaid = 600, manualPaid = 0 } = {}) {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '${profileId}'::uuid $$;
    CREATE FUNCTION public.get_my_role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'operator'::text $$;
    CREATE FUNCTION public.tours_is_booking_operator(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT COALESCE(current_setting('test.operator', true), 'true') <> 'false' $$;
    CREATE TYPE cancellation_status AS ENUM ('requested', 'approved', 'rejected', 'refund_confirmed');
    CREATE TABLE public.tours_bookings (id uuid PRIMARY KEY, booking_reference text UNIQUE, status text);
    CREATE TABLE public.tours_operators (profile_id uuid, accreditation_status text);
    CREATE TABLE public.tours_cancellations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid, status cancellation_status, resolved_at timestamptz, resolved_by uuid);
    CREATE TABLE public.tours_payments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid, amount numeric, payment_method text,
      payment_status text, provider text, provider_ref text, provider_method text, reference_number text,
      payment_date timestamptz, notes text, recorded_by uuid, refund_of uuid
    );
    CREATE FUNCTION public.tours_refundable_amount(p_booking_id uuid) RETURNS numeric LANGUAGE sql STABLE AS $$
      SELECT GREATEST(0, COALESCE(SUM(amount) FILTER (WHERE payment_status = 'completed'), 0) - COALESCE(SUM(amount) FILTER (WHERE payment_status = 'refunded'), 0))
      FROM public.tours_payments WHERE booking_id = p_booking_id
    $$;
    INSERT INTO tours_operators VALUES ('${profileId}', 'approved');
    INSERT INTO tours_bookings VALUES ('${bookingId}', 'BK-20261109-CE5927', '${bookingStatus}');
    INSERT INTO tours_cancellations (booking_id, status) VALUES ('${bookingId}', '${cancellationStatus}');
    INSERT INTO tours_payments (id, booking_id, amount, payment_method, payment_status, provider, provider_ref)
      VALUES ('${paymentId}', '${bookingId}', ${onlinePaid}, 'gcash', 'completed', 'paymongo', 'pay_aDDxtAJoUPdZvACVNLmhSne7');
    ${manualPaid ? `INSERT INTO tours_payments (booking_id, amount, payment_method, payment_status, provider) VALUES ('${bookingId}', ${manualPaid}, 'cash', 'completed', 'manual');` : ""}
  `);
  await db.exec(migration);
  return db;
}
async function cancellation(db) {
  return (await db.query(`SELECT status::text, resolved_by FROM tours_cancellations WHERE booking_id = '${bookingId}'`)).rows[0];
}
const recordOnline = (db, amount, ref) => db.query("SELECT tours_record_online_refund($1, $2::jsonb) AS remaining", [bookingId, JSON.stringify([{ payment_id: paymentId, provider_ref: ref, amount }])]);
const recordManual = (db, amount) => db.query("SELECT tours_record_refund($1, $2, 'gcash', '123') AS remaining", [bookingId, amount]);

test("a full manual refund closes a pending request in the same transaction", async () => {
  const db = await database();
  try {
    const result = await recordManual(db, 600);
    assert.equal(Number(result.rows[0].remaining), 0);
    assert.deepEqual(await cancellation(db), { status: "refund_confirmed", resolved_by: profileId });
  } finally { await db.close(); }
});

test("partial then full online refunds advance the request without double recording on replay", async () => {
  const db = await database();
  try {
    assert.equal(Number((await recordOnline(db, 200, "ref_partial")).rows[0].remaining), 400);
    assert.equal((await cancellation(db)).status, "approved");
    assert.equal(Number((await recordOnline(db, 400, "ref_full")).rows[0].remaining), 0);
    assert.equal((await cancellation(db)).status, "refund_confirmed");
    await recordOnline(db, 400, "ref_full");
    assert.equal(Number((await db.query("SELECT count(*) AS count FROM tours_payments WHERE payment_status = 'refunded'")).rows[0].count), 2);
  } finally { await db.close(); }
});

test("mixed payments are not marked fully refunded until the whole ledger balance is returned", async () => {
  const db = await database({ onlinePaid: 600, manualPaid: 400 });
  try {
    assert.equal(Number((await recordOnline(db, 600, "ref_online")).rows[0].remaining), 400);
    assert.equal((await cancellation(db)).status, "approved");
    await recordManual(db, 400);
    assert.equal((await cancellation(db)).status, "refund_confirmed");
  } finally { await db.close(); }
});

test("declined cancellation requests are not revived", async () => {
  const db = await database({ cancellationStatus: "rejected" });
  try {
    await recordManual(db, 600);
    assert.equal((await cancellation(db)).status, "rejected");
  } finally { await db.close(); }
});

test("failed recording and active bookings do not alter the request", async () => {
  const db = await database({ bookingStatus: "confirmed" });
  try {
    await assert.rejects(recordManual(db, 600), /Cancel or decline/);
    await db.query("SELECT public.tours_sync_refund_cancellation($1)", [bookingId]);
    assert.equal((await cancellation(db)).status, "requested");
    assert.equal(Number((await db.query("SELECT count(*) AS count FROM tours_payments WHERE payment_status = 'refunded'")).rows[0].count), 0);
  } finally { await db.close(); }
});

test("the one-time repair changes only the checked cancellation and never writes a second refund", async () => {
  const db = await database();
  try {
    await db.query(`INSERT INTO tours_payments (booking_id, amount, payment_method, payment_status, provider, reference_number) VALUES ($1, 600, 'gcash', 'refunded', 'manual', '124123')`, [bookingId]);
    await db.exec(repair);
    assert.equal((await cancellation(db)).status, "refund_confirmed");
    assert.equal(Number((await db.query("SELECT count(*) AS count FROM tours_payments WHERE payment_status = 'refunded'")).rows[0].count), 1);
    await db.exec(repair);
    assert.equal(Number((await db.query("SELECT count(*) AS count FROM tours_payments WHERE payment_status = 'refunded'")).rows[0].count), 1);
  } finally { await db.close(); }
});

test("the repair refuses mismatched or incomplete evidence", async () => {
  const db = await database();
  try {
    await assert.rejects(db.exec(repair), /no longer matches/);
    assert.equal((await cancellation(db)).status, "requested");
  } finally { await db.close(); }
});


test("refund RPCs remain operator-only and the synchronization helper is not public", async () => {
  const db = await database();
  try {
    const grants = (await db.query(`SELECT
      has_function_privilege('anon', 'public.tours_record_refund(uuid,numeric,text,text)', 'EXECUTE') AS anon_manual,
      has_function_privilege('anon', 'public.tours_record_online_refund(uuid,jsonb)', 'EXECUTE') AS anon_online,
      has_function_privilege('authenticated', 'public.tours_sync_refund_cancellation(uuid)', 'EXECUTE') AS helper_public,
      has_function_privilege('authenticated', 'public.tours_record_refund(uuid,numeric,text,text)', 'EXECUTE') AS authenticated_manual
    `)).rows[0];
    assert.deepEqual(grants, { anon_manual: false, anon_online: false, helper_public: false, authenticated_manual: true });
    await db.query("SELECT set_config('test.operator', 'false', false)");
    await assert.rejects(recordManual(db, 600), /Only the approved operator/);
    await assert.rejects(recordOnline(db, 600, "ref_forbidden"), /Only the approved operator/);
    assert.equal((await cancellation(db)).status, "requested");
  } finally { await db.close(); }
});
