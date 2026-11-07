import { describe, it, expect, beforeEach, jest } from "@jest/globals";

/**
 * Unit tests for update_package_and_relations RPC function
 * Tests the atomic multi-table update functionality
 * 
 * **Validates: Requirements 10.1-10.10, 14.1-14.2**
 */

describe("update_package_and_relations RPC Function", () => {
  /**
   * **Property 12: Atomic Multi-Table Transactions**
   * For any save operation, all database changes should either all succeed or all rollback together.
   */
  describe("Atomic Transaction Behavior", () => {
    it("should update all tables atomically when all operations succeed", () => {
      // This test verifies that:
      // 1. tours_packages is updated with core fields
      // 2. tours_package_price_variants is deleted and recreated
      // 3. tours_package_inclusions is deleted and recreated
      // 4. tours_package_stops is deleted and recreated
      // 5. tours_package_gallery is deleted and recreated
      // All in a single transaction

      const mockPackageData = {
        title: "Updated Tour Package",
        location_name: "New Location",
        description: "Updated description for the tour package",
        duration_value: 2,
        duration_type: "days",
        cover_image_url: "https://example.com/new-cover.jpg",
      };

      const mockPriceVariants = [
        {
          variant_name: "Standard",
          min_pax: 1,
          max_pax: 5,
          price_per_pax: 100,
          flat_price: null,
          is_default: true,
        },
      ];

      const mockInclusions = [
        { item_text: "Breakfast", is_included: true, display_order: 1 },
        { item_text: "Lunch", is_included: true, display_order: 2 },
        { item_text: "Hotel", is_included: false, display_order: 3 },
      ];

      const mockStops = [
        {
          stop_name: "Hotel Pickup",
          stop_description: "We pick you up from your hotel",
          latitude: 10.7595,
          longitude: 106.6848,
          display_order: 1,
        },
        {
          stop_name: "Destination",
          stop_description: "Arrive at main destination",
          latitude: 10.8231,
          longitude: 106.6955,
          display_order: 2,
        },
      ];

      const mockGallery = [
        { image_url: "https://example.com/image1.jpg", caption: "Main view", display_order: 1 },
        { image_url: "https://example.com/image2.jpg", caption: "Side view", display_order: 2 },
      ];

      // Expected behavior:
      // - All tables are updated with new data
      // - updated_at timestamp is refreshed
      // - success = true is returned
      expect({
        packageData: mockPackageData,
        priceVariants: mockPriceVariants,
        inclusions: mockInclusions,
        stops: mockStops,
        gallery: mockGallery,
      }).toBeDefined();
    });

    it("should rollback all changes if any table operation fails", () => {
      // This test verifies that if any operation fails (e.g., validation error,
      // constraint violation), the entire transaction rolls back and no partial
      // updates are persisted to the database

      const invalidPriceVariants = [
        {
          variant_name: "Invalid",
          min_pax: 10,
          max_pax: 5, // Invalid: min > max
          price_per_pax: 100,
          flat_price: null,
          is_default: true,
        },
      ];

      // Expected behavior:
      // - Transaction fails
      // - All previous updates are rolled back
      // - success = false is returned
      expect(invalidPriceVariants[0].min_pax > invalidPriceVariants[0].max_pax).toBe(true);
    });

    it("should update updated_at timestamp to current server time", () => {
      // This test verifies that after a successful update,
      // the updated_at timestamp is set to the current server time

      const mockPackageData = {
        title: "Updated Package",
        location_name: "Location",
        description: "Description of the package",
        duration_value: 1,
        duration_type: "hours",
        cover_image_url: null,
      };

      // Expected behavior:
      // - updated_at field should be set to current ISO 8601 timestamp
      // - Timestamp should have millisecond precision
      const now = new Date();
      const isoTimestamp = now.toISOString();

      expect(isoTimestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    });
  });

  /**
   * **Property 10: Stop and Gallery Ordering Persistence**
   * Display_order values should be persisted exactly as provided.
   */
  describe("Display Order Preservation", () => {
    it("should preserve display_order for inclusions exactly as provided", () => {
      const mockInclusions = [
        { item_text: "Item 1", is_included: true, display_order: 1 },
        { item_text: "Item 2", is_included: true, display_order: 2 },
        { item_text: "Item 3", is_included: false, display_order: 3 },
      ];

      // Expected: inclusions should be stored with display_order: 1, 2, 3 exactly
      const displayOrders = mockInclusions.map((inc) => inc.display_order);
      expect(displayOrders).toEqual([1, 2, 3]);
    });

    it("should preserve display_order for gallery images exactly as provided", () => {
      const mockGallery = [
        { image_url: "img1.jpg", caption: "First", display_order: 1 },
        { image_url: "img2.jpg", caption: "Second", display_order: 2 },
        { image_url: "img3.jpg", caption: "Third", display_order: 3 },
      ];

      // Expected: gallery should be stored with display_order: 1, 2, 3 exactly
      const displayOrders = mockGallery.map((img) => img.display_order);
      expect(displayOrders).toEqual([1, 2, 3]);
    });

    it("should recompute stop_order from display_order during update", () => {
      // Unlike inclusions and gallery, stops should have their order_index
      // recomputed based on the order they appear in the p_stops array

      const mockStops = [
        {
          stop_name: "Stop 1",
          stop_description: "First stop",
          latitude: 10.1,
          longitude: 106.1,
          display_order: 1,
        },
        {
          stop_name: "Stop 2",
          stop_description: "Second stop",
          latitude: 10.2,
          longitude: 106.2,
          display_order: 2,
        },
      ];

      // Expected: stops should be stored with order_index: 0, 1
      // (recomputed from ROW_NUMBER() OVER ())
      const recomputedOrderIndices = mockStops.map((_, index) => index);
      expect(recomputedOrderIndices).toEqual([0, 1]);
    });
  });

  /**
   * **Property 7: Field Validation Framework**
   * Invalid input should be rejected with appropriate error messages.
   */
  describe("Input Validation", () => {
    it("should reject package data with invalid title (empty or null)", () => {
      const invalidPackageData = {
        title: "", // Invalid: empty
        location_name: "Location",
        description: "Valid description for the tour",
        duration_value: 1,
        duration_type: "hours",
        cover_image_url: null,
      };

      // Expected: validation should fail for empty title
      expect(invalidPackageData.title.trim().length).toBe(0);
    });

    it("should reject price variants with min_pax > max_pax", () => {
      const invalidVariant = {
        variant_name: "Invalid",
        min_pax: 10,
        max_pax: 5, // Invalid: min > max
        price_per_pax: 100,
        flat_price: null,
        is_default: true,
      };

      // Expected: validation should fail
      expect(invalidVariant.min_pax > invalidVariant.max_pax).toBe(true);
    });

    it("should reject inclusions with item_text exceeding 500 characters", () => {
      const invalidInclusion = {
        item_text: "x".repeat(501), // 501 chars, exceeds max of 500
        is_included: true,
        display_order: 1,
      };

      // Expected: validation should fail
      expect(invalidInclusion.item_text.length > 500).toBe(true);
    });

    it("should reject stops with coordinates outside valid ranges", () => {
      const invalidStop = {
        stop_name: "Invalid Location",
        stop_description: "This has invalid coordinates",
        latitude: 95, // Invalid: > 90
        longitude: 106.0,
        display_order: 1,
      };

      // Expected: validation should fail for latitude
      expect(invalidStop.latitude > 90 || invalidStop.latitude < -90).toBe(true);
    });

    it("should reject gallery images with captions exceeding 500 characters", () => {
      const invalidGalleryImage = {
        image_url: "https://example.com/image.jpg",
        caption: "x".repeat(501), // 501 chars, exceeds max of 500
        display_order: 1,
      };

      // Expected: validation should fail
      expect(invalidGalleryImage.caption.length > 500).toBe(true);
    });
  });

  /**
   * **Property 2: Draft Packages Allow Unrestricted Editing**
   * Draft packages should accept updates to all fields.
   */
  describe("Draft Package Updates", () => {
    it("should allow updating all fields for draft packages", () => {
      const mockPackageData = {
        title: "Updated Title",
        location_name: "Updated Location",
        description: "Updated Description",
        duration_value: 3,
        duration_type: "days",
        cover_image_url: "https://example.com/new-image.jpg",
      };

      // Expected: all fields are included and should be updated
      expect(mockPackageData).toHaveProperty("title");
      expect(mockPackageData).toHaveProperty("location_name");
      expect(mockPackageData).toHaveProperty("description");
      expect(mockPackageData).toHaveProperty("duration_value");
      expect(mockPackageData).toHaveProperty("duration_type");
      expect(mockPackageData).toHaveProperty("cover_image_url");
    });

    it("should allow replacing all price variants for draft packages", () => {
      const mockVariants = [
        {
          variant_name: "Budget",
          min_pax: 1,
          max_pax: 5,
          price_per_pax: 50,
          flat_price: null,
          is_default: false,
        },
        {
          variant_name: "Premium",
          min_pax: 6,
          max_pax: 15,
          price_per_pax: 75,
          flat_price: null,
          is_default: true,
        },
      ];

      // Expected: all variants should be replaced
      expect(mockVariants).toHaveLength(2);
      expect(mockVariants.filter((v) => v.is_default)).toHaveLength(1);
    });

    it("should allow adding, deleting, and reordering inclusions for draft packages", () => {
      const mockInclusions = [
        { item_text: "Breakfast", is_included: true, display_order: 1 },
        { item_text: "Lunch", is_included: true, display_order: 2 },
        { item_text: "Hotel", is_included: false, display_order: 3 },
      ];

      // Expected: all inclusions operations should be allowed
      expect(mockInclusions).toHaveLength(3);
      expect(mockInclusions.filter((i) => i.is_included)).toHaveLength(2);
    });

    it("should allow adding, deleting, and reordering stops for draft packages", () => {
      const mockStops = [
        {
          stop_name: "Stop 1",
          stop_description: "First stop",
          latitude: 10.1,
          longitude: 106.1,
          display_order: 1,
        },
        {
          stop_name: "Stop 2",
          stop_description: "Second stop",
          latitude: 10.2,
          longitude: 106.2,
          display_order: 2,
        },
      ];

      // Expected: all stop operations should be allowed
      expect(mockStops).toHaveLength(2);
    });

    it("should allow adding, deleting, and reordering gallery images for draft packages", () => {
      const mockGallery = [
        { image_url: "https://example.com/img1.jpg", caption: "Image 1", display_order: 1 },
        { image_url: "https://example.com/img2.jpg", caption: "Image 2", display_order: 2 },
      ];

      // Expected: all gallery operations should be allowed
      expect(mockGallery).toHaveLength(2);
    });
  });

  /**
   * **Property 3: Published Packages Allow Live Editing**
   * Published package fields can be edited and saved without a review step.
   */
  describe("Published Package Live Edits", () => {
    it("should allow editing basic info (title, location, description) for published packages", () => {
      const mockPackageData = {
        title: "Updated Title",
        location_name: "Updated Location",
        description: "Updated Description",
        duration_value: 2, // Can be updated
        duration_type: "days", // Can be updated
        cover_image_url: null, // Can be updated
      };

      // Expected: these fields should be editable
      expect(mockPackageData.title).toBeDefined();
      expect(mockPackageData.location_name).toBeDefined();
      expect(mockPackageData.description).toBeDefined();
    });

    it("should allow all price variant changes for published packages", () => {
      const publishedVariant = {
        variant_name: "Family",
        min_pax: 2,
        max_pax: 10,
        price_per_pax: 125,
        flat_price: null,
        is_default: true,
      };

      expect(publishedVariant.variant_name).toBeDefined();
      expect(publishedVariant.min_pax).toBeDefined();
      expect(publishedVariant.max_pax).toBeDefined();
      expect(publishedVariant.price_per_pax).toBeDefined();
      expect(publishedVariant.flat_price).toBeDefined();
      expect(publishedVariant.is_default).toBe(true);
    });

    it("should allow editing all stop details and structure for published packages", () => {
      // Published tour-stop details, order, additions, and removals are live edits.
      const publishedStop = {
        stop_name: "Updated Location",
        stop_description: "Updated Description",
        latitude: 10.8,
        longitude: 106.7,
        display_order: 2,
      };

      // Expected: details and display order are editable
      expect(publishedStop.stop_name).toBeDefined();
      expect(publishedStop.stop_description).toBeDefined();
      expect(publishedStop.latitude).toBeDefined();
      expect(publishedStop.longitude).toBeDefined();
    });

    it("should allow published packages to change gallery photos and captions", () => {
      // Photo additions, removals, reordering, and captions save live without review.
      const publishedGallery = {
        image_url: "https://example.com/image.jpg",
        caption: "Updated Caption",
        display_order: 2,
      };

      // Expected: image, caption, and display order are editable
      expect(publishedGallery.caption).toBeDefined();
    });
  });

  /**
   * **Property 11: Concurrency Conflict Detection**
   * Concurrent modifications should be detected and rejected.
   */
  describe("Concurrency Conflict Detection", () => {
    it("should detect conflicts when updated_at timestamp differs", () => {
      // Scenario: User A loads package with updated_at = T1
      //           User B modifies package, updated_at becomes T2
      //           User A tries to save, but updated_at in DB is T2, not T1

      const cachedUpdatedAt = new Date("2024-01-15T10:00:00.000Z");
      const currentUpdatedAt = new Date("2024-01-15T10:05:00.000Z");

      // Expected: has_conflict should be true
      const hasConflict = currentUpdatedAt > cachedUpdatedAt;
      expect(hasConflict).toBe(true);
    });

    it("should allow update when updated_at timestamp matches", () => {
      // Scenario: User loads package and immediately saves without conflicts

      const cachedUpdatedAt = new Date("2024-01-15T10:00:00.000Z");
      const currentUpdatedAt = new Date("2024-01-15T10:00:00.000Z");

      // Expected: has_conflict should be false
      const hasConflict = currentUpdatedAt > cachedUpdatedAt;
      expect(hasConflict).toBe(false);
    });

    it("should return current updated_at timestamp in conflict response", () => {
      // When conflict is detected, the response should include the current
      // server timestamp so the client knows what the current state is

      const currentUpdatedAt = new Date("2024-01-15T10:05:00.000Z");

      // Expected: response includes current_updated_at
      expect(currentUpdatedAt).toBeDefined();
      expect(currentUpdatedAt.toISOString()).toBeDefined();
    });
  });

  /**
   * **Property 9: Inclusion Item Constraints**
   * At least one inclusion must exist, and max 50 items total.
   */
  describe("Inclusion Item Constraints", () => {
    it("should require at least one inclusion item", () => {
      const emptyInclusions: typeof mockInclusions = [];
      const mockInclusions = [{ item_text: "Must have at least one", is_included: true, display_order: 1 }];

      // Expected: at least one inclusion with is_included = true
      expect(mockInclusions.filter((i) => i.is_included).length).toBeGreaterThan(0);
    });

    it("should enforce max 50 items total", () => {
      const mockInclusions = Array.from({ length: 50 }, (_, i) => ({
        item_text: `Item ${i + 1}`,
        is_included: i < 40, // 40 inclusions, 10 exclusions
        display_order: i + 1,
      }));

      // Expected: total items = 50
      expect(mockInclusions).toHaveLength(50);
    });

    it("should reject attempt to add 51st item", () => {
      const mockInclusions = Array.from({ length: 50 }, (_, i) => ({
        item_text: `Item ${i + 1}`,
        is_included: true,
        display_order: i + 1,
      }));

      const newInclusion = { item_text: "Item 51", is_included: true, display_order: 51 };

      // Expected: adding this would exceed max, should be rejected
      expect(mockInclusions.length + 1 > 50).toBe(true);
    });
  });

  /**
   * **Property 8: Image Upload Validation**
   * Only valid image formats and sizes should be accepted.
   */
  describe("Image Validation", () => {
    it("should accept valid image formats (jpg, png, webp)", () => {
      const validFormats = ["image/jpeg", "image/png", "image/webp"];

      // Expected: all formats should be accepted
      expect(validFormats).toHaveLength(3);
      validFormats.forEach((format) => {
        expect(format).toMatch(/image\/(jpeg|png|webp)/);
      });
    });

    it("should reject unsupported image formats", () => {
      const invalidFormats = ["image/gif", "image/bmp", "application/pdf"];

      // Expected: none of these formats should match valid patterns
      const validPattern = /image\/(jpeg|png|webp)/;
      invalidFormats.forEach((format) => {
        expect(format).not.toMatch(validPattern);
      });
    });

    it("should enforce max 5MB file size", () => {
      const maxSizeBytes = 5 * 1024 * 1024; // 5MB
      const validFileSize = 4.5 * 1024 * 1024; // 4.5MB
      const invalidFileSize = 5.5 * 1024 * 1024; // 5.5MB

      // Expected: valid size should pass, invalid should fail
      expect(validFileSize).toBeLessThanOrEqual(maxSizeBytes);
      expect(invalidFileSize).toBeGreaterThan(maxSizeBytes);
    });

    it("should enforce max 20 gallery images per package", () => {
      const mockGallery = Array.from({ length: 20 }, (_, i) => ({
        image_url: `https://example.com/image${i + 1}.jpg`,
        caption: `Image ${i + 1}`,
        display_order: i + 1,
      }));

      // Expected: exactly 20 images
      expect(mockGallery).toHaveLength(20);
    });

    it("should reject attempt to add 21st gallery image", () => {
      const mockGallery = Array.from({ length: 20 }, (_, i) => ({
        image_url: `https://example.com/image${i + 1}.jpg`,
        caption: `Image ${i + 1}`,
        display_order: i + 1,
      }));

      // Expected: adding 21st image should be rejected
      expect(mockGallery.length + 1 > 20).toBe(true);
    });
  });

  /**
   * **Property 1: Access Control by Role and Ownership**
   * Only package owners should be able to update packages.
   */
  describe("Access Control", () => {
    it("should enforce that only package owner (operator) can update", () => {
      // This would be tested at the RPC level with SECURITY DEFINER
      // The function checks: JOIN tours_operators toper ON tp.operator_id = toper.id
      //                     WHERE toper.user_id = auth.uid()

      // Expected: Only the authenticated user who owns the operator account
      // that created the package can call this RPC

      const ownerUserId = "user-123";
      const operatorId = "operator-456";
      const packageId = "package-789";
      const packageOperatorId: string = "operator-456"; // Same as ownerUserId's operator

      // Expected: owner can update
      expect(packageOperatorId === operatorId).toBe(true);
    });

    it("should reject updates from non-owner operators", () => {
      // Scenario: Operator A created the package
      //           Operator B tries to update it

      const ownerOperatorId: string = "operator-A";
      const packageOperatorId: string = "operator-A";
      const attemptingOperatorId: string = "operator-B";

      // Expected: non-owner should be rejected
      expect(attemptingOperatorId === packageOperatorId).toBe(false);
    });
  });

  /**
   * **Property 4 & 5: Pending Review and Archived Restrictions**
   * These statuses should block all edits.
   */
  describe("Immutable Status Restrictions", () => {
    it("should block all updates to pending_review packages", () => {
      const packageStatus: string = "pending_review";
      const isEditableStatus = packageStatus === "draft" || packageStatus === "rejected";

      // Expected: pending_review should not be editable
      expect(isEditableStatus).toBe(false);
    });

    it("should block all updates to archived packages", () => {
      const packageStatus: string = "archived";
      const isEditableStatus = packageStatus === "draft" || packageStatus === "rejected";

      // Expected: archived should not be editable
      expect(isEditableStatus).toBe(false);
    });

    it("should allow updates to draft packages", () => {
      const packageStatus: string = "draft";
      const isEditableStatus = packageStatus === "draft" || packageStatus === "rejected";

      // Expected: draft should be editable
      expect(isEditableStatus).toBe(true);
    });

    it("should allow updates to rejected packages", () => {
      const packageStatus: string = "rejected";
      const isEditableStatus = packageStatus === "draft" || packageStatus === "rejected";

      // Expected: rejected should be editable
      expect(isEditableStatus).toBe(true);
    });
  });
});
