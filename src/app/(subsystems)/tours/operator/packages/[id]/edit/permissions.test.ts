import { findRestrictedChanges } from "./permissions";
import type { EditInclusion, EditPackageFormData } from "./edit-types";

const basePackage = (inclusions: EditInclusion[]): EditPackageFormData => ({
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

describe("findRestrictedChanges for published inclusions", () => {
  it("allows appending the first included item when a legacy package has none", () => {
    const original = basePackage([]);
    const next = basePackage([inclusion("new-1", true, 1)]);

    expect(findRestrictedChanges(original, next, "published")).toEqual([]);
  });

  it("allows the first included item after preserving existing exclusions", () => {
    const original = basePackage([inclusion("excluded-1", false, 1)]);
    const next = basePackage([
      inclusion("excluded-1", false, 1),
      inclusion("new-1", true, 2),
    ]);

    expect(findRestrictedChanges(original, next, "published")).toEqual([]);
  });

  it("still blocks adding inclusions when one is already present", () => {
    const original = basePackage([inclusion("included-1", true, 1)]);
    const next = basePackage([
      inclusion("included-1", true, 1),
      inclusion("new-2", true, 2),
    ]);

    expect(findRestrictedChanges(original, next, "published")).toContain(
      "Inclusions cannot be added or removed on a published package.",
    );
  });

  it("does not treat an excluded-only addition as a repair", () => {
    const original = basePackage([]);
    const next = basePackage([inclusion("excluded-1", false, 1)]);

    expect(findRestrictedChanges(original, next, "published")).toContain(
      "Inclusions cannot be added or removed on a published package.",
    );
  });

  it("only allows one new item in the repair", () => {
    const original = basePackage([]);
    const next = basePackage([
      inclusion("new-1", true, 1),
      inclusion("new-2", false, 2),
    ]);

    expect(findRestrictedChanges(original, next, "published")).toContain(
      "Inclusions cannot be added or removed on a published package.",
    );
  });

  it("does not allow removing existing exclusions while adding the first included item", () => {
    const original = basePackage([inclusion("excluded-1", false, 1)]);
    const next = basePackage([inclusion("new-1", true, 1)]);

    expect(findRestrictedChanges(original, next, "published")).toContain(
      "Only inclusion text can change on a published package.",
    );
  });
});
