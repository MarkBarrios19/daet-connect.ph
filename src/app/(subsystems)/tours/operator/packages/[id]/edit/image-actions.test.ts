import { uploadPackageImage, deletePackageImage } from "./actions";
import * as serverAuth from "@/lib/tours/server-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Mock dependencies
jest.mock("@/lib/tours/server-auth");
jest.mock("@/lib/supabase/server");

describe("Image Handling Server Actions", () => {
  let mockSessionClient: any;
  let mockStorage: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock storage object
    mockStorage = {
      from: jest.fn().mockReturnThis(),
      upload: jest.fn(),
      remove: jest.fn(),
      getPublicUrl: jest.fn(),
    };

    // Mock Supabase server client
    mockSessionClient = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(),
      storage: mockStorage,
    };

    (createSupabaseServerClient as jest.Mock).mockResolvedValue(mockSessionClient);
  });

  describe("uploadPackageImage", () => {
    const PACKAGE_ID = "00000000-0000-4000-8000-000000000001";
    const OPERATOR_ID = "00000000-0000-4000-8000-000000000002";

    /** An approved operator is signed in and their operator row is returned. */
    const signInAsApprovedOperator = (accreditationStatus = "approved") => {
      jest.spyOn(serverAuth, "getAuthenticatedSession").mockResolvedValueOnce({
        user: { id: "user-123" },
        role: "operator",
        error: null,
      } as any);

      mockSessionClient.from().select().eq().maybeSingle.mockResolvedValueOnce({
        data: { id: OPERATOR_ID, accreditation_status: accreditationStatus },
        error: null,
      });
    };

    /** The ownership lookup that follows the operator row. */
    const mockPackageLookup = (status: string | null = "draft") => {
      mockSessionClient.from().select().eq().maybeSingle.mockResolvedValueOnce(
        status === null
          ? { data: null, error: null }
          : { data: { id: PACKAGE_ID, status }, error: null },
      );
    };

    const imageForm = (name = "test.jpg", type = "image/jpeg") => {
      const formData = new FormData();
      formData.append("file", new File(["fake image data"], name, { type }));
      return formData;
    };

    const mockUploadSuccess = () => {
      mockStorage.upload.mockResolvedValueOnce({ data: { path: "stored.jpg" }, error: null });
      mockStorage.getPublicUrl.mockReturnValueOnce({
        data: { publicUrl: `https://project.supabase.co/storage/v1/object/public/tours-package-media/${OPERATOR_ID}/${PACKAGE_ID}/mock-uuid.jpg` },
      });
    };

    it("uploads a cover for a draft package and returns its public URL", async () => {
      signInAsApprovedOperator();
      mockPackageLookup("draft");
      mockUploadSuccess();

      const result = await uploadPackageImage(PACKAGE_ID, imageForm(), "cover");

      expect(result.success).toBe(true);
      expect(result.imageUrl).toContain("tours-package-media");
      expect(result.error).toBeUndefined();
    });

    it("says Package not found when the package belongs to another operator", async () => {
      signInAsApprovedOperator();
      mockPackageLookup(null);

      const result = await uploadPackageImage(PACKAGE_ID, imageForm(), "cover");

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("Package not found.");
      expect(mockStorage.upload).not.toHaveBeenCalled();
    });

    it("keeps pending-review packages read-only", async () => {
      signInAsApprovedOperator();
      mockPackageLookup("pending_review");

      const result = await uploadPackageImage(PACKAGE_ID, imageForm(), "cover");

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("This package is under review and cannot be edited.");
      expect(mockStorage.upload).not.toHaveBeenCalled();
    });

    it("allows a new cover on a published package", async () => {
      signInAsApprovedOperator();
      mockPackageLookup("published");
      mockUploadSuccess();

      const result = await uploadPackageImage(PACKAGE_ID, imageForm(), "cover");

      expect(result.success).toBe(true);
      expect(result.imageUrl).toBeDefined();
    });

    it("accepts a new gallery image on a published package; review happens at save", async () => {
      signInAsApprovedOperator();
      mockPackageLookup("published");
      mockUploadSuccess();

      const result = await uploadPackageImage(PACKAGE_ID, imageForm(), "gallery");

      // The file may be uploaded; update_package_and_relations is what sends the
      // package back to pending_review when the gallery actually changes.
      expect(result.success).toBe(true);
      expect(result.imageUrl).toBeDefined();
    });

    it("still refuses a gallery image on a pending-review package", async () => {
      signInAsApprovedOperator();
      mockPackageLookup("pending_review");

      const result = await uploadPackageImage(PACKAGE_ID, imageForm(), "gallery");

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("This package is under review and cannot be edited.");
      expect(mockStorage.upload).not.toHaveBeenCalled();
    });

    it("allows a new gallery image on a draft package", async () => {
      signInAsApprovedOperator();
      mockPackageLookup("draft");
      mockUploadSuccess();

      const result = await uploadPackageImage(PACKAGE_ID, imageForm("shot.png", "image/png"), "gallery");

      expect(result.success).toBe(true);
      expect(mockStorage.upload).toHaveBeenCalledWith(
        expect.stringContaining("tours-package-media"),
        expect.anything(),
        expect.objectContaining({ contentType: "image/png" }),
      );
    });

    it("treats a missing kind as a cover upload", async () => {
      signInAsApprovedOperator();
      mockPackageLookup("published");
      mockUploadSuccess();

      const result = await uploadPackageImage(PACKAGE_ID, imageForm());

      expect(result.success).toBe(true);
    });

    it("rejects an unknown kind", async () => {
      signInAsApprovedOperator();
      mockPackageLookup("draft");

      const result = await uploadPackageImage(PACKAGE_ID, imageForm(), "avatar" as any);

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("Invalid image type.");
      expect(mockStorage.upload).not.toHaveBeenCalled();
    });

    it("validates file format (jpg, jpeg, png, webp only)", async () => {
      signInAsApprovedOperator();
      mockPackageLookup("draft");

      const result = await uploadPackageImage(PACKAGE_ID, imageForm("test.gif", "image/gif"), "cover");

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain(
        "Invalid file format. Only JPG, PNG, and WebP are allowed.",
      );
    });

    it("validates file size (max 5MB)", async () => {
      signInAsApprovedOperator();
      mockPackageLookup("draft");

      const formData = new FormData();
      formData.append("file", new File([new Uint8Array(6 * 1024 * 1024)], "large.jpg", { type: "image/jpeg" }));

      const result = await uploadPackageImage(PACKAGE_ID, formData, "cover");

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("File size too large. Maximum size is 5MB.");
    });

    it("returns 401 error if not authenticated", async () => {
      jest.spyOn(serverAuth, "getAuthenticatedSession").mockResolvedValueOnce({
        user: null,
        role: null,
        error: "Auth error",
      } as any);

      const result = await uploadPackageImage(PACKAGE_ID, imageForm(), "cover");

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("Authentication required");
    });

    it("returns 403 error if operator is not approved", async () => {
      signInAsApprovedOperator("pending");

      const result = await uploadPackageImage(PACKAGE_ID, imageForm(), "cover");

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("approved");
    });

    it("returns error if no file provided", async () => {
      signInAsApprovedOperator();
      mockPackageLookup("draft");

      const result = await uploadPackageImage(PACKAGE_ID, new FormData(), "cover");

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("No file provided");
    });

    it("builds the operator/package/uuid storage path", async () => {
      signInAsApprovedOperator();
      mockPackageLookup("draft");
      mockUploadSuccess();

      await uploadPackageImage(PACKAGE_ID, imageForm(), "cover");

      const uploadPath = mockStorage.upload.mock.calls[0][0];
      expect(uploadPath).toMatch(/tours-package-media\/.*\/.*\/[a-f0-9-]{36}\.jpg/i);
    });

    it("tells the operator when the storage bucket is missing", async () => {
      signInAsApprovedOperator();
      mockPackageLookup("draft");
      mockStorage.upload.mockResolvedValueOnce({
        data: null,
        error: { message: "Bucket not found", statusCode: 404, name: "StorageApiError" },
      });

      const result = await uploadPackageImage(PACKAGE_ID, imageForm(), "cover");

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe(
        "Photo storage isn't set up yet. Please tell the Tourism Office.",
      );
    });

    it("maps a storage policy refusal to the ownership message", async () => {
      signInAsApprovedOperator();
      mockPackageLookup("draft");
      mockStorage.upload.mockResolvedValueOnce({
        data: null,
        error: {
          message: "new row violates row-level security policy",
          statusCode: 403,
          name: "StorageApiError",
        },
      });

      const result = await uploadPackageImage(PACKAGE_ID, imageForm(), "cover");

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("You can only add photos to your own packages.");
    });

    it("keeps the generic message for any other storage failure", async () => {
      signInAsApprovedOperator();
      mockPackageLookup("draft");
      mockStorage.upload.mockResolvedValueOnce({
        data: null,
        error: { message: "Internal error", statusCode: 500, name: "StorageApiError" },
      });

      const result = await uploadPackageImage(PACKAGE_ID, imageForm(), "cover");

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("Failed to upload image. Please try again.");
    });
  });

  describe("deletePackageImage", () => {
    describe("Task 2.14: Delete Package Image", () => {
      it("should delete image from draft package successfully", async () => {
        const packageId = "00000000-0000-4000-8000-000000000001";
        const operatorId = "00000000-0000-4000-8000-000000000002";
        const imageUrl =
          "https://project.supabase.co/storage/v1/object/public/tours-package-media/op/pkg/img.jpg";

        jest
          .spyOn(serverAuth, "getAuthenticatedSession")
          .mockResolvedValueOnce({
            user: { id: "user-123" },
            role: "operator",
            error: null,
          } as any);

        mockSessionClient.from().select().eq().maybeSingle
          .mockResolvedValueOnce({
            data: { id: operatorId, accreditation_status: "approved" },
            error: null,
          })
          .mockResolvedValueOnce({
            data: {
              id: packageId,
              operator_id: operatorId,
              status: "draft",
            },
            error: null,
          });

        mockStorage.remove.mockResolvedValueOnce({ error: null });

        // Execute
        const result = await deletePackageImage(packageId, imageUrl);

        // Assert
        expect(result.success).toBe(true);
        expect(result.message).toContain("deleted successfully");
        expect(mockStorage.remove).toHaveBeenCalled();
      });

      it("should verify package ownership before deletion", async () => {
        const packageId = "00000000-0000-4000-8000-000000000001";
        const operatorId = "00000000-0000-4000-8000-000000000002";
        const differentOperatorId = "00000000-0000-4000-8000-000000000003";
        const imageUrl =
          "https://project.supabase.co/storage/v1/object/public/tours-package-media/op/pkg/img.jpg";

        jest
          .spyOn(serverAuth, "getAuthenticatedSession")
          .mockResolvedValueOnce({
            user: { id: "user-123" },
            role: "operator",
            error: null,
          } as any);

        mockSessionClient.from().select().eq().maybeSingle
          .mockResolvedValueOnce({
            data: { id: operatorId, accreditation_status: "approved" },
            error: null,
          })
          .mockResolvedValueOnce({
            data: {
              id: packageId,
              operator_id: differentOperatorId, // Different owner
              status: "draft",
            },
            error: null,
          });

        // Execute
        const result = await deletePackageImage(packageId, imageUrl);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.message).toContain("do not own this package");
      });

      it("should only allow deletion from draft packages", async () => {
        const packageId = "00000000-0000-4000-8000-000000000001";
        const operatorId = "00000000-0000-4000-8000-000000000002";
        const imageUrl =
          "https://project.supabase.co/storage/v1/object/public/tours-package-media/op/pkg/img.jpg";

        jest
          .spyOn(serverAuth, "getAuthenticatedSession")
          .mockResolvedValueOnce({
            user: { id: "user-123" },
            role: "operator",
            error: null,
          } as any);

        mockSessionClient.from().select().eq().maybeSingle
          .mockResolvedValueOnce({
            data: { id: operatorId, accreditation_status: "approved" },
            error: null,
          })
          .mockResolvedValueOnce({
            data: {
              id: packageId,
              operator_id: operatorId,
              status: "published", // Not draft
            },
            error: null,
          });

        // Execute
        const result = await deletePackageImage(packageId, imageUrl);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.message).toContain("draft packages");
      });

      it("should extract storage path from public URL", async () => {
        const packageId = "00000000-0000-4000-8000-000000000001";
        const operatorId = "00000000-0000-4000-8000-000000000002";
        const imageUrl =
          "https://project.supabase.co/storage/v1/object/public/tours-package-media/op/pkg/img.jpg";

        jest
          .spyOn(serverAuth, "getAuthenticatedSession")
          .mockResolvedValueOnce({
            user: { id: "user-123" },
            role: "operator",
            error: null,
          } as any);

        mockSessionClient.from().select().eq().maybeSingle
          .mockResolvedValueOnce({
            data: { id: operatorId, accreditation_status: "approved" },
            error: null,
          })
          .mockResolvedValueOnce({
            data: {
              id: packageId,
              operator_id: operatorId,
              status: "draft",
            },
            error: null,
          });

        mockStorage.remove.mockResolvedValueOnce({ error: null });

        // Execute
        await deletePackageImage(packageId, imageUrl);

        // Verify path extraction: everything after /public/<bucket>/
        expect(mockStorage.remove).toHaveBeenCalledWith(["op/pkg/img.jpg"]);
      });

      it("should return 401 error if not authenticated", async () => {
        const packageId = "00000000-0000-4000-8000-000000000001";
        const imageUrl =
          "https://project.supabase.co/storage/v1/object/public/tours-package-media/op/pkg/img.jpg";

        jest.spyOn(serverAuth, "getAuthenticatedSession").mockResolvedValueOnce({
          user: null,
          role: null,
          error: "Auth error",
        } as any);

        // Execute
        const result = await deletePackageImage(packageId, imageUrl);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.message).toContain("Authentication required");
      });

      it("should return 404 error if package not found", async () => {
        const packageId = "00000000-0000-4000-8000-000000000001";
        const operatorId = "00000000-0000-4000-8000-000000000002";
        const imageUrl =
          "https://project.supabase.co/storage/v1/object/public/tours-package-media/op/pkg/img.jpg";

        jest
          .spyOn(serverAuth, "getAuthenticatedSession")
          .mockResolvedValueOnce({
            user: { id: "user-123" },
            role: "operator",
            error: null,
          } as any);

        mockSessionClient.from().select().eq().maybeSingle
          .mockResolvedValueOnce({
            data: { id: operatorId, accreditation_status: "approved" },
            error: null,
          })
          .mockResolvedValueOnce({
            data: null, // Package not found
            error: null,
          });

        // Execute
        const result = await deletePackageImage(packageId, imageUrl);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.message).toContain("Package not found");
      });

      it("should handle storage deletion errors gracefully", async () => {
        const packageId = "00000000-0000-4000-8000-000000000001";
        const operatorId = "00000000-0000-4000-8000-000000000002";
        const imageUrl =
          "https://project.supabase.co/storage/v1/object/public/tours-package-media/op/pkg/img.jpg";

        jest
          .spyOn(serverAuth, "getAuthenticatedSession")
          .mockResolvedValueOnce({
            user: { id: "user-123" },
            role: "operator",
            error: null,
          } as any);

        mockSessionClient.from().select().eq().maybeSingle
          .mockResolvedValueOnce({
            data: { id: operatorId, accreditation_status: "approved" },
            error: null,
          })
          .mockResolvedValueOnce({
            data: {
              id: packageId,
              operator_id: operatorId,
              status: "draft",
            },
            error: null,
          });

        mockStorage.remove.mockResolvedValueOnce({
          error: new Error("Storage error"),
        });

        // Execute
        const result = await deletePackageImage(packageId, imageUrl);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.message).toContain("Failed to delete image");
      });
    });
  });
});
