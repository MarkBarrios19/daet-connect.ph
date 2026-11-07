// Destructive, isolated PostgreSQL integration test. Run only against a disposable
// LOCAL database named operator_payment_test: PAYMENT_TEST_DATABASE_URL=postgresql://.../operator_payment_test node --test scripts/operator-payment-concurrency.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const url = process.env.PAYMENT_TEST_DATABASE_URL;
test('booking lock serializes manual and proof payments and rolls back proof failures', { skip: !url }, async () => {
  const parsed = new URL(url);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) && parsed.pathname === '/operator_payment_test' && !parsed.search, 'Use a disposable local operator_payment_test database only');
  const run = sql => {
    const p = spawnSync('psql', [url, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8' });
    assert.equal(p.status, 0, p.stderr);
    return p.stdout.trim();
  };
  const parallel = (sql, onOutput = () => {}) => new Promise((resolve, reject) => {
    const p = spawn('psql', [url, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1']);
    let out = '', err = '';
    p.stdout.on('data', x => { out += x; onOutput(out); }); p.stderr.on('data', x => err += x);
    p.on('error', reject); p.on('close', code => code ? reject(new Error(err)) : resolve(out.trim()));
    p.stdin.end(sql);
  });
  const booking = '00000000-0000-0000-0000-000000000001';
  const proof1 = '00000000-0000-0000-0000-000000000002';
  const proof2 = '00000000-0000-0000-0000-000000000003';
  const actor = '00000000-0000-0000-0000-000000000004';
  run(`DROP SCHEMA public CASCADE; CREATE SCHEMA public; CREATE SCHEMA IF NOT EXISTS auth;
    DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${actor}'::uuid $$;
    CREATE TABLE public.tours_bookings (id uuid PRIMARY KEY, total_amount numeric, package_id uuid);
    CREATE TABLE public.tours_packages (id uuid PRIMARY KEY, operator_id uuid);
    CREATE TABLE public.tours_operators (id uuid PRIMARY KEY, profile_id uuid, accreditation_status text);
    CREATE TABLE public.tours_payments (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, booking_id uuid, amount numeric, payment_method text, payment_status text, reference_number text, payment_date timestamptz, notes text, recorded_by uuid);
    CREATE TABLE public.tours_payment_proofs (id uuid PRIMARY KEY, booking_id uuid, amount numeric, payment_method text, reference_number text, submitted_at timestamptz, verification_status text, verified_by uuid, verified_at timestamptz, rejection_reason text, payment_id uuid);
    CREATE FUNCTION public.tours_is_booking_operator(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT $1 = '${booking}'::uuid $$;
    INSERT INTO public.tours_bookings VALUES ('${booking}', 100, '${proof1}');
    INSERT INTO public.tours_packages VALUES ('${proof1}', '${proof2}');
    INSERT INTO public.tours_operators VALUES ('${proof2}', '${actor}', 'approved');`);
  run(readFileSync('supabase/migrations/20261107_atomic_operator_payments.sql', 'utf8'));
  const reset = () => run(`TRUNCATE public.tours_payments, public.tours_payment_proofs;
    INSERT INTO public.tours_payment_proofs (id, booking_id, amount, payment_method, submitted_at, verification_status) VALUES
      ('${proof1}', '${booking}', 70, 'gcash', now(), 'pending'), ('${proof2}', '${booking}', 70, 'gcash', now(), 'pending');`);
  const call = proof => `SELECT public.tours_record_operator_payment('${booking}', 70, 'cash', NULL, now(), NULL, ${proof ? `'${proof}'` : 'NULL'})->>'status';`;
  for (const [a, b] of [[null, null], [proof1, proof2], [null, proof1]]) {
    reset();
    // Hold the booking row in the first transaction so the second necessarily
    // overlaps it and must wait before reading the balance.
    let locked;
    const acquired = new Promise(resolve => { locked = resolve; });
    const first = parallel(`BEGIN; SELECT id FROM public.tours_bookings WHERE id='${booking}' FOR UPDATE; SELECT pg_sleep(1); ${call(a)} COMMIT;`, output => {
      if (output.includes(booking)) locked();
    });
    await Promise.race([acquired, first.then(() => { throw new Error('Lock signal not received'); })]);
    const second = parallel(call(b));
    const [x, y] = await Promise.all([first, second]);
    assert.match(x, /recorded/); assert.equal(y, 'exceeds_balance');
    assert.equal(run(`SELECT sum(amount) FROM public.tours_payments WHERE payment_status='completed'`), '70');
    if (b) assert.equal(run(`SELECT verification_status FROM public.tours_payment_proofs WHERE id='${b}'`), 'pending');
  }
  reset();
  run(`CREATE FUNCTION public.fail_proof() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'proof failure'; END $$;
    CREATE TRIGGER fail_proof BEFORE UPDATE ON public.tours_payment_proofs FOR EACH ROW EXECUTE FUNCTION public.fail_proof();`);
  await assert.rejects(parallel(call(proof1)), /proof failure/);
  assert.equal(run(`SELECT count(*) FROM public.tours_payments`), '0');
  assert.equal(run(`SELECT verification_status FROM public.tours_payment_proofs WHERE id='${proof1}'`), 'pending');
});
