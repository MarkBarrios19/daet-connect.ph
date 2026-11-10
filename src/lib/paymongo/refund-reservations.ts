/**
 * The PayMongo refund reservations table.
 *
 * `reconcilePendingRefund` (board-actions.ts) asks this table whether a refund
 * for the booking is already in flight before it sends another one. Migration
 * 20261130_paymongo_refund_reservations.sql creates it; the code and the SQL
 * deploy separately here, because SQL is run by hand.
 *
 * When the migration has not been applied, PostgREST cannot resolve the table
 * and answers `PGRST205` ("Could not find the table 'public.X' in the schema
 * cache"), or `42P01` from Postgres itself. The dialog used to render that as
 * "Refund reservations could not be checked. Ask an administrator to check the
 * database setup." — which names the symptom and hides the cause.
 *
 * Keeping the test here means the operator reads which migration is missing
 * instead of hunting for it, and the check is unit-tested rather than inlined
 * in a server action that only Postgres can exercise.
 */

/** True when the database has not had the refund reservations migration applied. */
export function isMissingRefundReservationsTable(
  error: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  if (code === "42P01" || code === "PGRST205") return true;
  // PostgREST names the table it could not find, so that is the surest sign —
  // but a permission error names the table too, and that is a different
  // problem. Only read the wording when the code says nothing.
  if (code !== "") return false;
  return /tours_refund_operations/.test(error.message ?? "");
}

/** The operator-facing message: say what is missing and what will fix it. */
export const REFUND_RESERVATIONS_NOT_INSTALLED =
  "PayMongo refunds are not set up in the database yet: the refund reservations table "
  + "(20261130_paymongo_refund_reservations.sql) has not been applied. Ask an administrator "
  + "to apply that migration, then retry. Nothing was sent to PayMongo.";
