# Refund reservations could not be checked

What the operator saw, why it happened, what fixed it, and what is still owed
to the repository.

## The symptom

In the operator dashboard at `/tours/operator/bookings`, opening **Process
Refund** showed a red notice before any refund was submitted:

> Refund reservations could not be checked. Ask an administrator to check the
> database setup.

The dialog had already read the ledger correctly (`Remaining in booking
ledger: ₱1,100.00`) and the PayMongo sandbox badge was lit, so PayMongo
configuration and the money rules were not the problem. The failure was the
dialog's preflight call to `tours_sync_refund_cancellation`.

## Root cause: two defects in one function

`public.tours_sync_refund_cancellation(p_booking_id uuid)` exists on the live
project but is created by **no migration in this repository**. It was checked
with the catalogue rather than guessed:

| Check | Result |
|---|---|
| `has_function_privilege('authenticated', …, 'execute')` | `false` |
| `prosecdef` (`SECURITY DEFINER`) | `true` |
| body mentions `get_my_role()` | `false` |
| body mentions `tours_is_booking_operator` | `false` |
| body raises `insufficient_privilege` | `false` |

1. **No `EXECUTE` for `authenticated`.** The RPC was refused before it ran, and
   the dialog turned that refusal into the notice above.
2. **No authorization check of its own.** The function is `SECURITY DEFINER`,
   so it runs with the owner's privileges, and nothing inside it asked who was
   calling. Granting `EXECUTE` on it as it stood would have let any signed-in
   user — a tourist included — settle the cancellation ledger of any booking by
   id.

Either defect alone is a bug. Together they are a trap: the obvious fix (grant
`EXECUTE`) opens a hole, and the safe state (no `EXECUTE`) leaves refunds
broken.

## The fix

`supabase/migrations/20261110_refund_sync_authorization.sql` splits the two
concerns without touching the original body:

```
app  →  tours_sync_refund_cancellation   gatekeeper: who is asking?
             ↓
        tours_sync_refund_cancellation_inner   the original, verbatim
```

- The original keeps its logic; only its name changes, once.
- The gatekeeper keeps the original name and signature, allows admins, the
  booking's operator and the booking's tourist, and raises
  `insufficient_privilege` for anyone else.
- Only the gatekeeper is reachable: `EXECUTE` is revoked from `PUBLIC` and
  `anon`, the inner body is owner-only, and `authenticated` may call the
  gatekeeper.
- The return type is read from `pg_proc`, so the wrapper matches whatever the
  body returns (`void`, `numeric`, `TABLE(...)`). The live function returns
  `void`.

The migration is idempotent and a no-op on a database that never had the
function, so a project built from these migrations alone still applies cleanly.

## What was applied by hand, and why that matters

The fix was applied to the production project through the Supabase SQL editor
before this migration existed. The migration is the record of that change, not
the change itself: applying it again is safe but unnecessary.

Two consequences worth keeping in view:

- **The repository is behind the live project.** `tours_sync_refund_cancellation`
  is referenced by the deployed dialog but is defined nowhere in `supabase/`.
  A staging project, a restored backup, or a fresh database will not have it,
  and the dialog will report the same notice there. The migration says so in a
  `NOTICE` instead of pretending to fix it.
- **Advisors will not flag this.** A missing grant and a missing in-body check
  are both invisible to the app's type-checking and its tests.

## Verification

Run after applying the migration:

```sql
select p.proname,
       pg_get_function_result(p.oid) as returns_type,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('tours_sync_refund_cancellation',
                    'tours_sync_refund_cancellation_inner')
order by p.proname;
```

Expected — the gatekeeper callable, the body not:

| proname | returns_type | authenticated_can_execute |
|---|---|---|
| `tours_sync_refund_cancellation` | `void` | `true` |
| `tours_sync_refund_cancellation_inner` | `void` | `false` |

Then `supabase/tests/refund_sync_authorization.sql` in the SQL editor; read the
report from the raised error (`REPORT pass=N fail=M [failures]`). It checks the
grants, that the body survived, that the gatekeeper is hardened, and that an
unrelated tourist and an anonymous visitor are both refused while the booking's
own tourist and operator are let through.

Finally, hard-reload `/tours/operator/bookings` and reopen **Process Refund**:
the notice should be gone.

## Related, still open

`invalid column for filter profile_id` (`P0001`) repeats in the Postgres log.
It does not come from `tours_notifications`: that table does have `profile_id`,
and the live column list matches `20261029_f5_notifications.sql` exactly. The
only `postgres_changes` filter on that column in the app is
`src/components/live/live-provider.tsx:118`, which is consistent with the
schema. The message is raised by Supabase's internal
`realtime.subscription_check_filters`, so it belongs to a subscription whose
table does not carry that column — most likely an older channel config or a
session that predates the current schema. It is not on the refund path and does
not block it.
