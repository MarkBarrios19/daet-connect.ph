# PayMongo refund rollout and reconciliation

## Rollout

1. Pause automatic refund traffic during deployment. An old app instance can
   otherwise send a refund and then fail to record it after the new migration
   revokes its old ledger RPC. Make sure old instances and in-flight refund
   requests are stopped before applying the migration.
2. Apply `20261128_operator_online_refunds.sql`, then
   `20261129_sync_refund_cancellations.sql` if not already applied, then the
   new `20261130_paymongo_refund_reservations.sql`. Do not reapply migrations
   that were already applied. The new migration does not modify old refunds.
3. Deploy this version with the Supabase service-role/secret key configured
   server-side. Configure the PayMongo webhook for
   `checkout_session.payment.paid`, `payment.refunded`, and
   `payment.refund.updated`; the sandbox setup script can add missing events.
   Verify signature checking and event delivery. Opening the refund dialog
   also rechecks a pending operation, so missed webhooks do not require a
   second refund.
4. Test with a **new sandbox payment**, starting with the read-only refund
   history check. Confirm the provider response, pagination, pending-to-success
   and pending-to-failure behavior, and webhook/poll reconciliation. Do not
   refund BK-20261109-CE5927 again: it was already refunded in test mode.
   The HTTP 400's cause remains unverified; inspect the sanitized error code
   and field without logging or sharing API keys or customer details.
5. Review existing online refund ledger entries separately against PayMongo.
   Older versions could record pending refunds as completed; this migration
   deliberately does not change historical records or cancellation statuses.

## Operations requiring attention

Only one automatic operation per booking can be active. Its UUID is also the
PayMongo idempotency key. An operation in `reserved` or `sending` without a
provider reference remains held, including after a timeout or a server crash.
**Do not send an automatic or manual refund to clear it.** Ask an authorized
administrator to compare the booking, payment, amount, timestamp, PayMongo mode,
refund history and dashboard, and obtain provider support if the outcome is
ambiguous. An external dashboard refund can also race this app; verify external
activity before any new refund.

When a specific provider refund is verified, a service-role administrator can
apply its *current, independently retrieved* provider status and matching refund
ID, payment ID, and amount in centavos through `tours_update_refund_operation`.
The function checks these against the reservation and records only a succeeded
refund. Do not fabricate a refund ID or treat a missing response as a failure.
If no provider refund can be identified, leave the hold in place until the
outcome is conclusively established and the recovery procedure is reviewed.
PayMongo idempotency keys expire, so never blindly replay an old request.

Automatic refunds spanning multiple payment rows are intentionally limited to
one payment per operation. Refund each payment separately; no multi-payment
batch is sent without durable per-payment recovery.
