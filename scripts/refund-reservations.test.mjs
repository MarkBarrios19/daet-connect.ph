import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const sync = await readFile(new URL('../supabase/migrations/20261129_sync_refund_cancellations.sql', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261130_paymongo_refund_reservations.sql', import.meta.url), 'utf8');
const booking = '10000000-0000-4000-8000-000000000001';
const payment = '20000000-0000-4000-8000-000000000001';
const user = '30000000-0000-4000-8000-000000000001';
async function dbSetup() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${user}'::uuid $$;
    CREATE FUNCTION public.get_my_role() RETURNS text LANGUAGE sql AS $$ SELECT 'operator'::text $$;
    CREATE FUNCTION public.tours_is_booking_operator(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT COALESCE(current_setting('test.operator', true), 'true') <> 'false' $$;
    CREATE TABLE tours_bookings(id uuid PRIMARY KEY, status text);
    CREATE TABLE tours_operators(profile_id uuid, accreditation_status text);
    CREATE TABLE tours_cancellations(id uuid DEFAULT gen_random_uuid(), booking_id uuid, status text, resolved_at timestamptz, resolved_by uuid);
    CREATE TABLE tours_payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid, amount numeric, payment_method text, payment_status text,
      provider text, provider_ref text, reference_number text, payment_date timestamptz, notes text, recorded_by uuid, refund_of uuid,
      UNIQUE(provider,provider_ref));
    ALTER TABLE tours_payments ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tours_payments_insert_manual ON tours_payments FOR INSERT TO authenticated WITH CHECK (true);
    CREATE FUNCTION public.tours_refundable_amount(uuid) RETURNS numeric LANGUAGE sql AS $$
      SELECT GREATEST(0, COALESCE(SUM(amount) FILTER (WHERE payment_status='completed'),0) - COALESCE(SUM(amount) FILTER (WHERE payment_status='refunded'),0))
        FROM tours_payments WHERE booking_id = $1 $$;
    INSERT INTO tours_bookings VALUES ('${booking}', 'cancelled');
    INSERT INTO tours_operators VALUES ('${user}', 'approved');
    INSERT INTO tours_cancellations(booking_id,status) VALUES ('${booking}','requested');
    INSERT INTO tours_payments(id,booking_id,amount,payment_method,payment_status,provider,provider_ref)
      VALUES ('${payment}','${booking}',600,'gcash','completed','paymongo','pay_abc');
  `);
  await db.exec(sync);
  await db.exec(migration);
  return db;
}
async function reserve(db) { return (await db.query('SELECT tours_reserve_online_refund($1,$2,600) AS id',[booking,payment])).rows[0].id; }
async function update(db,id,state,ref=null,pay=null,amount=null) { return db.query('SELECT tours_update_refund_operation($1,$2,$3,$4,$5)',[id,state,ref,pay,amount]); }
async function state(db) { return (await db.query(`SELECT (SELECT status FROM tours_cancellations LIMIT 1) AS status, (SELECT count(*)::int FROM tours_payments WHERE payment_status='refunded') AS refunds`)).rows[0]; }

test('reservation blocks both a second automatic refund and a manual refund until settled', async () => {
  const db = await dbSetup();
  try {
    const id = await reserve(db);
    await assert.rejects(reserve(db), /already in progress/);
    await assert.rejects(db.query("SELECT tours_record_refund($1, 100, 'gcash', '')",[booking]), /in progress/);
    await update(db,id,'sending');
    await update(db,id,'pending','ref_abc','pay_abc',60000);
    assert.deepEqual(await state(db),{ status:'requested', refunds:0 });
    await assert.rejects(db.query("SELECT tours_record_refund($1, 100, 'gcash', '')",[booking]), /in progress/);
    await update(db,id,'succeeded','ref_abc','pay_abc',60000);
    assert.deepEqual(await state(db),{ status:'refund_confirmed', refunds:1 });
    await update(db,id,'succeeded','ref_abc','pay_abc',60000);
    await update(db,id,'pending','ref_abc','pay_abc',60000);
    await assert.rejects(update(db,id,'failed','ref_abc','pay_abc',60000));
    assert.deepEqual(await state(db),{ status:'refund_confirmed', refunds:1 });
  } finally { await db.close(); }
});

test('failed or mismatched provider responses do not mark the ledger refunded', async () => {
  const db = await dbSetup();
  try {
    const id = await reserve(db); await update(db,id,'sending');
    await assert.rejects(update(db,id,'succeeded','ref_abc','pay_abc',50000), /does not match/);
    assert.deepEqual(await state(db),{ status:'requested', refunds:0 });
    await update(db,id,'failed','ref_abc','pay_abc',60000);
    assert.deepEqual(await state(db),{ status:'requested', refunds:0 });
    await reserve(db);
  } finally { await db.close(); }
});

test('unapproved callers and signed-in users cannot advance provider operations', async () => {
  const db = await dbSetup();
  try {
    await db.exec("SET test.operator = 'false'");
    await assert.rejects(reserve(db), /Not authorized/);
    await db.exec("SET test.operator = 'true'");
    const id = await reserve(db);
    await db.exec('SET ROLE authenticated');
    await assert.rejects(update(db,id,'sending'), /permission denied/);
    await assert.rejects(db.query("SELECT tours_record_online_refund($1,'[]'::jsonb)",[booking]), /permission denied/);
  } finally { await db.close(); }
});
