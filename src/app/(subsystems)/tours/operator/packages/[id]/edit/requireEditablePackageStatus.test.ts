import { requireEditablePackageStatus as requireEditablePackageStatusAction } from "./actions";
import { PackageStatus } from "@/lib/tours/package-contract";

type EditabilityResult = Awaited<ReturnType<typeof requireEditablePackageStatusAction>>;
type LooseEditabilityResult = Partial<Extract<EditabilityResult, { data: unknown }>> &
  Partial<Extract<EditabilityResult, { error: unknown }>>;

/** Widens the result union so assertions can read `.data` / `.error` directly. */
async function requireEditablePackageStatus(
  ...args: Parameters<typeof requireEditablePackageStatusAction>
): Promise<LooseEditabilityResult> {
  return requireEditablePackageStatusAction(...args);
}

/**
 * Unit tests for requireEditablePackageStatus helper
 * 
 * **Property 2: Draft Packages Allow Unrestricted Editing**
 * **Property 3: Published Packages Allow Live Editing**
 * **Property 4: Pending Review Packages Block All Edits**
 * **Property 5: Archived Packages Block All Edits**
 * **Property 6: Rejected Packages Allow Resubmission**
 * 
 * **Validates: Requirements 2.1-2.5**
 */

describe("requireEditablePackageStatus", () => {
  // Property 2: Draft status allows all edits
  describe("Draft status - allows unrestricted editing", () => {
    test("should allow editing any fields when status is draft", async () => {
      const result = await requireEditablePackageStatus("draft", [
        "title",
        "description",
        "locationName",
      ]);

      expect(result).toHaveProperty("data");
      expect(result.data?.isEditable).toBe(true);
      expect(result.data?.status).toBe("draft");
    });

    test("should allow editing with empty fields array when status is draft", async () => {
      const result = await requireEditablePackageStatus("draft", []);

      expect(result).toHaveProperty("data");
      expect(result.data?.isEditable).toBe(true);
      expect(result.data?.status).toBe("draft");
    });

    test("should allow editing without fields parameter when status is draft", async () => {
      const result = await requireEditablePackageStatus("draft");

      expect(result).toHaveProperty("data");
      expect(result.data?.isEditable).toBe(true);
      expect(result.data?.status).toBe("draft");
    });

    test("should allow restricted operations like addPriceVariant in draft status", async () => {
      const result = await requireEditablePackageStatus("draft", [
        "addPriceVariant",
        "deleteStop",
        "reorderGallery",
      ]);

      expect(result).toHaveProperty("data");
      expect(result.data?.isEditable).toBe(true);
      expect(result.data?.status).toBe("draft");
    });
  });

  // Property 6: Rejected status allows resubmission
  describe("Rejected status - allows unrestricted editing", () => {
    test("should allow editing any fields when status is rejected", async () => {
      const result = await requireEditablePackageStatus("rejected", [
        "title",
        "description",
      ]);

      expect(result).toHaveProperty("data");
      expect(result.data?.isEditable).toBe(true);
      expect(result.data?.status).toBe("rejected");
    });

    test("should allow restricted operations in rejected status", async () => {
      const result = await requireEditablePackageStatus("rejected", [
        "addPriceVariant",
        "deleteInclusion",
      ]);

      expect(result).toHaveProperty("data");
      expect(result.data?.isEditable).toBe(true);
      expect(result.data?.status).toBe("rejected");
    });
  });

  // Property 4: Pending review blocks all edits
  describe("Pending review status - blocks all edits", () => {
    test("should return 403 error when status is pending_review", async () => {
      const result = await requireEditablePackageStatus("pending_review", []);

      expect(result).toHaveProperty("error");
      expect(result.error?.status).toBe(403);
      expect(result.error?.message).toBe(
        "Package is under review and cannot be edited"
      );
    });

    test("should return same error even with allowed fields in pending_review", async () => {
      const result = await requireEditablePackageStatus("pending_review", [
        "title",
        "description",
      ]);

      expect(result).toHaveProperty("error");
      expect(result.error?.status).toBe(403);
      expect(result.error?.message).toBe(
        "Package is under review and cannot be edited"
      );
    });

    test("should return same error without fields parameter in pending_review", async () => {
      const result = await requireEditablePackageStatus("pending_review");

      expect(result).toHaveProperty("error");
      expect(result.error?.status).toBe(403);
    });
  });

  // Property 5: Archived blocks all edits
  describe("Archived status - blocks all edits", () => {
    test("should return 403 error when status is archived", async () => {
      const result = await requireEditablePackageStatus("archived", []);

      expect(result).toHaveProperty("error");
      expect(result.error?.status).toBe(403);
      expect(result.error?.message).toBe(
        "Archived packages cannot be edited"
      );
    });

    test("should return same error even with allowed fields in archived", async () => {
      const result = await requireEditablePackageStatus("archived", [
        "title",
        "galleryCaption",
      ]);

      expect(result).toHaveProperty("error");
      expect(result.error?.status).toBe(403);
      expect(result.error?.message).toBe(
        "Archived packages cannot be edited"
      );
    });
  });

  // Published packages remain live, but every field can be edited.
  describe("Published status - allows all edits live", () => {
    test("should allow text and image-caption edits", async () => {
      const result = await requireEditablePackageStatus("published", [
        "title",
        "description",
        "galleryCaption",
      ]);

      expect(result).toHaveProperty("data");
      expect(result.data?.isEditable).toBe(true);
      expect(result.data?.status).toBe("published");
    });

    test("should allow pricing and structural operations", async () => {
      const result = await requireEditablePackageStatus("published", [
        "editPricePerPax",
        "addPriceVariant",
        "deletePriceVariant",
        "addStop",
        "deleteStop",
        "reorderStops",
        "addGalleryImage",
        "deleteGalleryImage",
        "reorderGallery",
        "addInclusion",
        "deleteInclusion",
        "reorderInclusions",
      ]);

      expect(result).toHaveProperty("data");
      expect(result.data?.isEditable).toBe(true);
      expect(result.data?.status).toBe("published");
    });

    test("does not expose an obsolete per-field allowlist", async () => {
      const result = await requireEditablePackageStatus("published", []);

      expect(result).toHaveProperty("data");
      expect(result.data?.allowedFields).toBeUndefined();
      expect(result.data?.restrictedFields).toBeUndefined();
    });
  });

  // Additional edge cases
  describe("Edge cases", () => {
    test("should allow mixed descriptive and structural edits on a published package", async () => {
      const result = await requireEditablePackageStatus("published", [
        "title",
        "description",
        "addPriceVariant",
      ]);

      expect(result).toHaveProperty("data");
      expect(result.data?.isEditable).toBe(true);
    });

    test("should return consistent error type structure", async () => {
      const resultPending = await requireEditablePackageStatus("pending_review");
      const resultArchived = await requireEditablePackageStatus("archived");

      expect(resultPending).toHaveProperty("error.status");
      expect(resultPending).toHaveProperty("error.message");
      expect(resultArchived).toHaveProperty("error.status");
      expect(resultArchived).toHaveProperty("error.message");
    });

    test("should return consistent success type structure", async () => {
      const resultDraft = await requireEditablePackageStatus("draft");
      const resultRejected = await requireEditablePackageStatus("rejected");

      expect(resultDraft).toHaveProperty("data.isEditable");
      expect(resultDraft).toHaveProperty("data.status");
      expect(resultRejected).toHaveProperty("data.isEditable");
      expect(resultRejected).toHaveProperty("data.status");
    });
  });
});
