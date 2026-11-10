import {
  isMissingRefundReservationsTable,
  REFUND_RESERVATIONS_NOT_INSTALLED,
} from "./refund-reservations";

describe("isMissingRefundReservationsTable", () => {
  test("recognises PostgREST's could-not-find-the-table answer", () => {
    expect(
      isMissingRefundReservationsTable({
        code: "PGRST205",
        message: "Could not find the table 'public.tours_refund_operations' in the schema cache",
      }),
    ).toBe(true);
  });

  test("recognises Postgres's undefined_table code", () => {
    expect(
      isMissingRefundReservationsTable({
        code: "42P01",
        message: 'relation "public.tours_refund_operations" does not exist',
      }),
    ).toBe(true);
  });

  test("reads the wording only when the code is absent", () => {
    expect(
      isMissingRefundReservationsTable({
        code: "",
        message: "Could not find the table 'public.tours_refund_operations' in the schema cache",
      }),
    ).toBe(true);
    // An unrecognised code is left to the general message; a permission
    // error with the same table name must not be read as a missing table.
    expect(
      isMissingRefundReservationsTable({
        code: "XX000",
        message: "tours_refund_operations is not available",
      }),
    ).toBe(false);
  });

  test("does not mistake a permission error for a missing table", () => {
    // This is what the dialog used to conflate. It must keep the general
    // wording rather than promise a migration that is not the problem.
    expect(
      isMissingRefundReservationsTable({
        code: "42501",
        message: "permission denied for table tours_refund_operations",
      }),
    ).toBe(false);
  });

  test("does not fire on a plain network failure", () => {
    expect(isMissingRefundReservationsTable({ code: "", message: "fetch failed" })).toBe(false);
  });

  test("no error means nothing is missing", () => {
    expect(isMissingRefundReservationsTable(null)).toBe(false);
    expect(isMissingRefundReservationsTable(undefined)).toBe(false);
  });

  test("the operator-facing message names the migration and promises no money moved", () => {
    expect(REFUND_RESERVATIONS_NOT_INSTALLED).toContain("20261130_paymongo_refund_reservations.sql");
    expect(REFUND_RESERVATIONS_NOT_INSTALLED).toContain("Nothing was sent to PayMongo");
    expect(REFUND_RESERVATIONS_NOT_INSTALLED).not.toMatch(/check the database setup/i);
  });
});
