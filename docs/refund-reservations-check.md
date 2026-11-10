# "Refund reservations could not be checked"

What the operator saw, which migration is missing, and what this repository
does about it.

## The symptom

In the operator dashboard at `/tours/operator/bookings`, opening **Process
Refund** showed a red notice before anything was submitted:

> Refund reservations could not be checked. Ask an administrator to check the
> database setup.

Nothing had been sent to PayMongo at that point — the dialog failed its
preflight. The ledger figure above the notice was correct (`Remaining in
booking ledger: ₱1,100.00`), so the payments were readable; the reservations
table was not.

## Where the message comes from

`reconcilePendingRefund` in `board-actions.ts` asks `tours_refund_operations`
whether a refund for this booking is already in flight, so a retry cannot pay
twice:

```ts
const { data: operation, error } = await supabase.from("tours_refund_operations")
  .select("id, state, provider_ref").eq("booking_id", bookingId)
  .in("state", ["reserved", "sending", "pending"]).maybeSingle();
```

Every error from that query became the same sentence. A missing table, a
permission problem, a network failure and a schema-cache miss were all reported
as "check the database setup", which points at the symptom and hides the cause.

The table is created by **`20261130_paymongo_refund_reservations.sql`**. Where
that migration has not been applied, PostgREST answers `PGRST205`:

```
Could not find the table 'public.tours_refund_operations' in the schema cache
```

or Postgres answers `42P01` (`relation … does not exist`). Both are reported
by the new check as:

> PayMongo refunds are not set up in the database yet: the refund reservations
> table (20261130_paymongo_refund_reservations.sql) has not been applied. Ask
> an administrator to apply that migration, then retry. Nothing was sent to
> PayMongo.

That names the file to run and states that no money moved, which is what an
operator actually needs to know before retrying.

## What is *not* the cause

Two tempting suspects, both ruled out by reading the migrations rather than
guessing:

- **`tours_sync_refund_cancellation`.** `20261129_sync_refund_cancellations.sql`
  deliberately revokes `EXECUTE` from `PUBLIC, anon, authenticated`. It is an
  internal helper, called only from `tours_record_refund` and the refund RPCs —
  never from the app. Granting `EXECUTE` to `authenticated` to "fix" the
  notice would have exposed a `SECURITY DEFINER` function that carries no
  authorization check of its own.
- **`tours_notifications` / `profile_id`.** The `P0001 invalid column for
  filter profile_id` lines in the Postgres log are unrelated. That table does
  have `profile_id`, and its live columns match `20261029_f5_notifications.sql`
  exactly. The message is raised by Supabase's internal
  `realtime.subscription_check_filters` for some subscription whose table lacks
  the column.

## The change here

- `src/lib/paymongo/refund-reservations.ts` — `isMissingRefundReservationsTable()`
  and `REFUND_RESERVATIONS_NOT_INSTALLED`, in the style of
  `src/lib/tours/guide-not-needed.ts`. The ordering matters: the error **code**
  decides first, and only a missing code falls back to reading the wording,
  because `permission denied for table tours_refund_operations` also names the
  table and must not be read as a missing migration.
- `board-actions.ts` logs the real error (`code`, `message`) and returns the
  specific message for a missing table, the general one otherwise.
- `src/lib/supabase/database.types.ts` gains `tours_refund_operations` and the
  four refund RPCs the code calls (`tours_record_online_refund`,
  `tours_reserve_online_refund`, `tours_sync_refund_cancellation`,
  `tours_update_refund_operation`). They were absent; the client is untyped, so
  nothing failed — the schema simply did not describe what the code uses.
- `e2e/mock-supabase.cjs` serves an empty `tours_refund_operations`, so the
  preflight finds no operation in flight on a fixture booking.

The migration itself is not changed. `20261130` is already in the tree; this
change only makes its absence legible.

## Verification

Unit tests: `npm test -- refund-reservations board-refunds` (25 tests, covering
both codes, the empty-message fallback, and the permission error that must stay
general).

On the project, the fix is to **apply the missing migration**, which is a
database change and therefore the operator's to run:

```sql
-- Confirm before applying anything:
select to_regclass('public.tours_refund_operations') as table_exists;
```

`null` means the migration is missing. `20261130_paymongo_refund_reservations.sql`
is written to be applied as-is; it creates the table, the one-active-refund
index, the read policy, and the reservation RPCs. It also revokes `EXECUTE` on
`tours_record_online_refund` from `PUBLIC, anon, authenticated`, which is
deliberate: only the service-side reservation path may write online refund rows.

After applying it, hard-reload `/tours/operator/bookings` and reopen **Process
Refund**. If the notice persists, read the server log line the new
`console.error` writes — it carries the PostgREST code and message instead of a
sentence that names nothing.
