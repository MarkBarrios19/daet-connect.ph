import { findRestrictedChanges, getEditPermissions, requireEditablePackageStatus } from "./permissions";
import type { EditInclusion, EditPackageFormData } from "./edit-types";

const basePackage = (inclusions: EditInclusion[] = []): EditPackageFormData => ({
  title: "Daet Heritage Tour",
  locationName: "Daet, Camarines Norte",
  description: "A short local history tour.",
  durationValue: 1,
  durationType: "days",
  coverImageUrl: null,
  priceVariants: [
    {
      id: "variant-1",
      variantName: "Standard",
      minPax: 1,
      maxPax: null,
      pricePerPax: 250,
      flatPrice: null,
      isDefault: true,
    },
  ],
  inclusions,
  stops: [
    {
      id: "stop-1",
      locationName: "Jose Rizal Monument",
      description: null,
      latitude: 14.1122,
      longitude: 122.9553,
      estimatedDurationMinutes: null,
      stopOrder: 1,
    },
  ],
  galleryImages: [],
});

const inclusion = (id: string, isIncluded: boolean, displayOrder: number): EditInclusion => ({
  id,
  text: isIncluded ? "Licensed local guide" : "Meals not included",
  isIncluded,
  displayOrder,
});

describe("published package permissions", () => {
  it("enables every published-package field and structural control", () => {
    const permissions = getEditPermissions("published");

    expect(permissions.canEdit).toBe(true);
    expect(permissions.canSubmitForReview).toBe(false);
    expect(permissions.readOnlyReason).toBeNull();
    expect(permissions.basic).toEqual({
      title: true,
      locationName: true,
      description: true,
      durationValue: true,
      durationType: true,
    });
    expect(permissions.coverImage).toBe(true);
    expect(Object.values(permissions.pricing).every(Boolean)).toBe(true);
    expect(Object.values(permissions.inclusions).every(Boolean)).toBe(true);
    expect(Object.values(permissions.stops).every(Boolean)).toBe(true);
    expect(Object.values(permissions.gallery).every(Boolean)).toBe(true);
  });

  it("accepts live price, inclusion, stop, and gallery changes", () => {
    const original = basePackage([inclusion("included-1", true, 1)]);
    const next = basePackage([
      inclusion("included-1", true, 2),
      inclusion("excluded-1", false, 1),
    ]);
    next.priceVariants[0].pricePerPax = 300;
    next.priceVariants.push({
      id: "new-variant",
      variantName: "Family",
      minPax: 2,
      maxPax: 6,
      pricePerPax: null,
      flatPrice: 1200,
      isDefault: false,
    });
    next.stops.push({
      id: "new-stop",
      locationName: "Daet Cathedral",
      description: "Historic church stop.",
      latitude: 14.1123,
      longitude: 122.9554,
      estimatedDurationMinutes: 30,
      stopOrder: 2,
    });
    next.galleryImages.push({
      id: "new-photo",
      imageUrl: "https://example.test/package.jpg",
      caption: "Daet tour stop",
      displayOrder: 1,
    });

    expect(findRestrictedChanges(original, next, "published")).toEqual([]);
    expect(requireEditablePackageStatus("published", { original, next })).toHaveProperty("data");
  });

  it("keeps pending-review and archived packages read-only", () => {
    for (const status of ["pending_review", "archived"] as const) {
      const permissions = getEditPermissions(status);
      expect(permissions.canEdit).toBe(false);
      expect(requireEditablePackageStatus(status)).toHaveProperty("error");
    }
  });
});
