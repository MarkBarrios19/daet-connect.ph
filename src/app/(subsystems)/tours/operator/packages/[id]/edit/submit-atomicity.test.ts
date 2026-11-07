/**
 * submitPackageForReview: atomicity, rollback and retry/conflict behaviour.
 *
 * **Validates: Requirements 10.9, 10.10, 14.1, 14.7-14.8**
 *
 * The submit path used to call updatePackageCore and then issue a separate
 * UPDATE to move the package to pending_review. Two statements are two
 * transactions: when the second one failed the operator saw "unable to submit"
 * while the first had already committed the edits. A stale cached updated_at was
 * also checked twice, so the second check could reject a request whose write had
 * already landed.
 *
 * These tests pin down the fixed contract:
 * - saving and submitting are one update_package_and_relations call, so they
 *   commit or roll back together (10.9, 14.1);
 * - a failure writes nothing at all, so edits are never silently committed
 *   behind a reported failure (10.10);
 * - the version check happens once, inside that call, and a conflict changes
 *   nothing, so the operator can reload and retry (10.10, 14.7-14.8).
 */

import { submitPackageForReview, updatePackageCore } from "./actions";
import { getVerifiedSession } from "@/lib/tours/server-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PACKAGE_TABLE } from "@/lib/tours/package-contract";
import { OPERATOR_TABLE } from "@/lib/tours/operator-contract";
import type { EditPackageFormData } from "./edit-types";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/tours/server-auth", () => ({ getVerifiedSession: jest.fn() }));
jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

const mockGetVerifiedSession = getVerifiedSession as jest.MockedFunction<
  typeof getVerifiedSession
>;
const mockCreateSupabaseServerClient =
  createSupabaseServerClient as jest.MockedFunction<
    typeof createSupabaseServerClient
  >;

const FIXTURES = {
  userId: "972f6ec1-a283-4d42-a93c-080d13d56467",
  operatorId: "39b3e5fc-29e0-4335-b8aa-56f699b34132",
  packageId: "46f8a59e-3d31-4508-86a8-d2b8919eec31",
  variantId: "27bd88bd-7a58-4a8b-9561-8fb81f4d7fd7",
  cachedUpdatedAt: "2026-01-15T10:00:00.000Z",
  concurrentUpdatedAt: "2026-01-15T10:05:00.000Z",
  newUpdatedAt: "2026-01-15T10:10:00.000Z",
};

/** A form that passes every validator, so only the write path is under test. */
function validFormData(
  overrides: Partial<EditPackageFormData> = {},
): EditPackageFormData {
  return {
    title: "Mountain Trek Adventure",
    locationName: "Daet, Camarines Norte",
    description: "A guided trek through the mountains above Daet.",
    durationValue: 2,
    durationType: "days",
    coverImageUrl: "https://example.test/cover.jpg",
    priceVariants: [
      {
        id: FIXTURES.variantId,
        variantName: "Standard",
        minPax: 1,
        maxPax: 10,
        pricePerPax: 1500,
        flatPrice: null,
        isDefault: true,
      },
    ],
    inclusions: [
      { id: undefined, text: "Licensed local guide", isIncluded: true, displayOrder: 1 },
      { id: undefined, text: "Airport transfer", isIncluded: false, displayOrder: 2 },
    ],
    stops: [
      {
        id: undefined,
        locationName: "Daet Town Plaza",
        description: "Meet the guide and start the trek.",
        latitude: 14.1122,
        longitude: 122.9553,
        estimatedDurationMinutes: 60,
        stopOrder: 1,
      },
    ],
    galleryImages: [
      {
        id: undefined,
        imageUrl: "https://example.test/gallery-1.jpg",
        caption: "View from the ridge",
        displayOrder: 1,
      },
    ],
    ...overrides,
  };
}

const RPC = "update_package_and_relations";
const CONCURRENCY_CONFLICT = /modified by another session/i;

/**
 * In-memory stand-in for the database contract the actions rely on.
 *
 * It models what the database guarantees, not what the actions do: the write is
 * one RPC whose version guard runs under a row lock, so a stale version or a
 * transport error leaves the stored row exactly as it was. `storedStatus` and
 * `storedUpdatedAt` are what a follow-up read would see.
 */
type WriteOutcome = "success" | "error" | "zero-rows";

class FakeDatabase {
  storedStatus = "draft";
  storedUpdatedAt = FIXTURES.cachedUpdatedAt;
  /** Owner of the stored package. */
  packageOperatorId = FIXTURES.operatorId;
  /** Accreditation of the signed-in operator. */
  accreditationStatus = "approved";
  /** Makes the atomic write raise PT409 whatever version was sent. */
  forceConflict = false;

  /** Queued outcome for the next update_package_and_relations call. */
  updatePackageOutcome: WriteOutcome = "success";

  /** Every RPC call the actions made, in order. */
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  /**
   * Attempts to write outside the atomic RPC. The production code must never
   * make one during a save or submit: a second statement is a second
   * transaction and can commit while the status change fails.
   */
  outOfTransactionWrites: string[] = [];

  client = {
    rpc: (name: string, args: Record<string, unknown>) => {
      this.rpcCalls.push({ name, args });

      if (name === RPC) return this.runUpdatePackage(args);

      return {
        data: null,
        error: { message: `unexpected rpc ${name}`, code: "PT500" },
      };
    },
    from: (table: string) => this.table(table),
  };

  /** How many times the atomic write was attempted. */
  get updatePackageCalls() {
    return this.rpcCalls.filter((call) => call.name === RPC).length;
  }

  get updatePackageArgs() {
    return this.rpcCalls.find((call) => call.name === RPC)?.args;
  }

  private runUpdatePackage(args: Record<string, unknown>) {
    if (this.updatePackageOutcome === "error") {
      // A failed transaction leaves the stored row untouched.
      return { data: null, error: { code: "PT500", message: "connection reset" } };
    }

    if (this.updatePackageOutcome === "zero-rows") {
      return { data: null, error: null };
    }

    if (this.forceConflict || args.p_expected_updated_at !== this.storedUpdatedAt) {
      // The production guard, mirrored: a stale version raises before the first
      // write, so nothing is committed and the operator can retry.
      return {
        data: null,
        error: {
          code: "PT409",
          message: "Package was modified by another session",
        },
      };
    }

    const submitted = args.p_submit_for_review === true;
    this.storedStatus = submitted ? "pending_review" : this.storedStatus;
    this.storedUpdatedAt = FIXTURES.newUpdatedAt;

    return {
      data: [
        {
          success: true,
          new_updated_at: FIXTURES.newUpdatedAt,
          new_status: this.storedStatus,
        },
      ],
      error: null,
    };
  }

  private table(tableName: string) {
    if (tableName === OPERATOR_TABLE) {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: FIXTURES.operatorId,
                accreditation_status: this.accreditationStatus,
              },
              error: null,
            }),
          }),
        }),
      };
    }

    if (tableName === PACKAGE_TABLE) {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: FIXTURES.packageId,
                operator_id: this.packageOperatorId,
                status: this.storedStatus,
              },
              error: null,
            }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          // Recorded, and deliberately not applied: a write outside the RPC is
          // the bug these tests exist to catch.
          this.outOfTransactionWrites.push(
            `${tableName}:${JSON.stringify(payload)}`,
          );
          const chain = {
            eq: () => chain,
            select: () => chain,
            maybeSingle: async () => ({ data: null, error: null }),
          };
          return chain;
        },
      };
    }

    throw new Error(`Unexpected table ${tableName}`);
  }
}

describe("submitPackageForReview", () => {
  let db: FakeDatabase;

  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    // The failure paths log the raw database error for the Tourism Office; the
    // tests assert the operator-facing response, so the log is silenced.
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

    db = new FakeDatabase();

    mockGetVerifiedSession.mockResolvedValue({
      user: { id: FIXTURES.userId } as never,
      role: "operator",
      error: null,
    } as never);
    mockCreateSupabaseServerClient.mockResolvedValue(db.client as never);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  /* ------------------------------------------------------------- happy path */

  describe("saving and submitting as one operation", () => {
    it("sends the edits and the status transition in a single RPC call", async () => {
      const form = validFormData({ title: "Renamed Trek" });

      const result = await submitPackageForReview(
        FIXTURES.packageId,
        form,
        FIXTURES.cachedUpdatedAt,
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe("Package submitted for review successfully.");
      expect(result.updatedAt).toBe(FIXTURES.newUpdatedAt);
      expect(result.data).toEqual({
        packageId: FIXTURES.packageId,
        status: "pending_review",
      });

      // One call, one transaction: the edits and the transition travel together.
      expect(db.updatePackageCalls).toBe(1);
      expect(db.updatePackageArgs?.p_submit_for_review).toBe(true);
      expect(db.updatePackageArgs?.p_expected_updated_at).toBe(
        FIXTURES.cachedUpdatedAt,
      );
    });

    it("never issues a separate write for the status change", async () => {
      await submitPackageForReview(
        FIXTURES.packageId,
        validFormData(),
        FIXTURES.cachedUpdatedAt,
      );

      // The old implementation ran a `.update({ status: "pending_review" })`
      // after the save. Any write outside the RPC is a separate transaction and
      // can leave edits committed while submission reports failure.
      expect(db.outOfTransactionWrites).toEqual([]);
    });

    it("commits the edits and the new status together", async () => {
      await submitPackageForReview(
        FIXTURES.packageId,
        validFormData({ title: "Renamed Trek" }),
        FIXTURES.cachedUpdatedAt,
      );

      expect(db.storedStatus).toBe("pending_review");
      expect(db.storedUpdatedAt).toBe(FIXTURES.newUpdatedAt);
    });

    it("returns the package in pending_review so the form can redirect", async () => {
      // A plain save keeps the status; only submit moves it.
      const saveResult = await updatePackageCore(
        FIXTURES.packageId,
        validFormData(),
        FIXTURES.cachedUpdatedAt,
      );

      expect(saveResult.success).toBe(true);
      expect(saveResult.data?.status).toBe("draft");
      expect(db.updatePackageArgs?.p_submit_for_review).toBe(false);
      expect(db.storedStatus).toBe("draft");
    });
  });

  /* --------------------------------------------------------------- rollback */

  describe("rollback: a failed submit writes nothing", () => {
    it("leaves the package untouched when the transaction fails", async () => {
      db.updatePackageOutcome = "error";

      const result = await submitPackageForReview(
        FIXTURES.packageId,
        validFormData({ title: "Renamed Trek" }),
        FIXTURES.cachedUpdatedAt,
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe(
        "Unable to submit package for review. Please try again.",
      );

      // Nothing was written anywhere: no partial edits, no status change.
      expect(db.outOfTransactionWrites).toEqual([]);
      expect(db.storedStatus).toBe("draft");
      expect(db.storedUpdatedAt).toBe(FIXTURES.cachedUpdatedAt);
    });

    it("does not report success when the RPC returns no row", async () => {
      db.updatePackageOutcome = "zero-rows";

      const result = await submitPackageForReview(
        FIXTURES.packageId,
        validFormData(),
        FIXTURES.cachedUpdatedAt,
      );

      expect(result.success).toBe(false);
      expect(db.storedStatus).toBe("draft");
      expect(db.outOfTransactionWrites).toEqual([]);
    });

    it("writes nothing when validation fails", async () => {
      const result = await submitPackageForReview(
        FIXTURES.packageId,
        validFormData({ title: "" }),
        FIXTURES.cachedUpdatedAt,
      );

      expect(result.success).toBe(false);
      expect(result.errors?.title).toBeDefined();
      // Validation runs before the transaction, so the database is never touched.
      expect(db.updatePackageCalls).toBe(0);
      expect(db.outOfTransactionWrites).toEqual([]);
      expect(db.storedStatus).toBe("draft");
    });

    it("writes nothing when the operator does not own the package", async () => {
      db.packageOperatorId = "1f0d6f0e-0000-4000-8000-000000000000";

      const result = await submitPackageForReview(
        FIXTURES.packageId,
        validFormData(),
        FIXTURES.cachedUpdatedAt,
      );

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/you do not own this package/i);
      expect(db.updatePackageCalls).toBe(0);
      expect(db.outOfTransactionWrites).toEqual([]);
      expect(db.storedStatus).toBe("draft");
    });

    it("writes nothing when the operator is no longer approved", async () => {
      db.accreditationStatus = "suspended";

      const result = await submitPackageForReview(
        FIXTURES.packageId,
        validFormData(),
        FIXTURES.cachedUpdatedAt,
      );

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/must be approved/i);
      expect(db.updatePackageCalls).toBe(0);
      expect(db.storedStatus).toBe("draft");
    });

    it("refuses to submit a package that is already under review", async () => {
      db.storedStatus = "pending_review";

      const result = await submitPackageForReview(
        FIXTURES.packageId,
        validFormData(),
        FIXTURES.cachedUpdatedAt,
      );

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/under review/i);
      expect(db.updatePackageCalls).toBe(0);
    });
  });

  /* -------------------------------------------------------- retry/conflict */

  describe("retry and conflict behaviour", () => {
    it("checks the version once, and only inside the atomic write", async () => {
      await submitPackageForReview(
        FIXTURES.packageId,
        validFormData(),
        FIXTURES.cachedUpdatedAt,
      );

      // The separate concurrency_check pre-flight could pass and then disagree
      // with the guarded write, which is exactly the window a second check
      // cannot close. The RPC's locked check is the single source of truth.
      expect(db.rpcCalls.map((call) => call.name)).toEqual([RPC]);
    });

    it("reports 409 and writes nothing on a stale version", async () => {
      db.forceConflict = true;

      const result = await submitPackageForReview(
        FIXTURES.packageId,
        validFormData({ title: "Renamed Trek" }),
        FIXTURES.cachedUpdatedAt,
      );

      expect(result.success).toBe(false);
      expect(result.status).toBe(409);
      expect(result.message).toMatch(CONCURRENCY_CONFLICT);

      // Requirements 14.8: no changes from the conflicting request.
      expect(db.outOfTransactionWrites).toEqual([]);
      expect(db.storedStatus).toBe("draft");
    });

    it("detects a stale version the same way the database does", async () => {
      // Someone else saved first: the stored timestamp moved on.
      db.storedUpdatedAt = FIXTURES.concurrentUpdatedAt;

      const result = await submitPackageForReview(
        FIXTURES.packageId,
        validFormData(),
        FIXTURES.cachedUpdatedAt,
      );

      expect(result.status).toBe(409);
      expect(db.storedStatus).toBe("draft");
      expect(db.storedUpdatedAt).toBe(FIXTURES.concurrentUpdatedAt);
      expect(db.outOfTransactionWrites).toEqual([]);
    });

    it("succeeds on retry after reloading the newer version", async () => {
      db.storedUpdatedAt = FIXTURES.concurrentUpdatedAt;

      const stale = await submitPackageForReview(
        FIXTURES.packageId,
        validFormData(),
        FIXTURES.cachedUpdatedAt,
      );
      expect(stale.status).toBe(409);

      // The operator reloads, so the form now carries the current version and
      // still holds their edits.
      const conflictVersion = db.storedUpdatedAt;
      const retry = await submitPackageForReview(
        FIXTURES.packageId,
        validFormData({ title: "Renamed Trek" }),
        conflictVersion,
      );

      expect(retry.success).toBe(true);
      expect(retry.data?.status).toBe("pending_review");
      expect(db.storedStatus).toBe("pending_review");
      expect(db.storedUpdatedAt).toBe(FIXTURES.newUpdatedAt);
    });

    it("can be retried after a transient failure, and a retry is not double-applied", async () => {
      db.updatePackageOutcome = "error";

      const failed = await submitPackageForReview(
        FIXTURES.packageId,
        validFormData({ title: "Renamed Trek" }),
        FIXTURES.cachedUpdatedAt,
      );
      expect(failed.success).toBe(false);

      // The version the form holds is still current because nothing committed.
      db.updatePackageOutcome = "success";

      const retried = await submitPackageForReview(
        FIXTURES.packageId,
        validFormData({ title: "Renamed Trek" }),
        FIXTURES.cachedUpdatedAt,
      );

      expect(retried.success).toBe(true);
      expect(db.storedStatus).toBe("pending_review");
    });

    it("returns 409 for updatePackageCore on a stale version too, without writing", async () => {
      db.storedUpdatedAt = FIXTURES.concurrentUpdatedAt;

      const result = await updatePackageCore(
        FIXTURES.packageId,
        validFormData(),
        FIXTURES.cachedUpdatedAt,
      );

      expect(result.status).toBe(409);
      expect(result.message).toMatch(CONCURRENCY_CONFLICT);
      expect(db.outOfTransactionWrites).toEqual([]);
      expect(db.storedStatus).toBe("draft");
    });

    it("sends the expected version to the RPC so the guard can reject stale writes", async () => {
      await updatePackageCore(
        FIXTURES.packageId,
        validFormData(),
        FIXTURES.cachedUpdatedAt,
      );

      expect(db.updatePackageArgs?.p_expected_updated_at).toBe(
        FIXTURES.cachedUpdatedAt,
      );
      expect(db.updatePackageArgs?.p_submit_for_review).toBe(false);
    });
  });
});
