import {
  EDITOR_SECTIONS,
  countUnsavedSections,
  firstSectionWithErrors,
  sectionIsDirty,
  statusExplanation,
} from "./editor-sections";
import type { EditPackageFormData, EditPackageStatus } from "./edit-types";

const form = (overrides: Partial<EditPackageFormData> = {}): EditPackageFormData => ({
  title: "Daet Heritage Tour",
  locationName: "Daet, Camarines Norte",
  description: "A local history tour.",
  durationValue: 1,
  durationType: "hours",
  coverImageUrl: null,
  priceVariants: [
    { id: "v1", variantName: "Standard", minPax: 1, maxPax: 8, pricePerPax: 500, flatPrice: null, isDefault: true },
  ],
  inclusions: [{ id: "i1", text: "Guide", isIncluded: true, displayOrder: 1 }],
  stops: [
    {
      id: "s1",
      locationName: "Rizal Monument",
      description: null,
      latitude: 14.1131,
      longitude: 122.9545,
      estimatedDurationMinutes: 30,
      stopOrder: 1,
    },
  ],
  galleryImages: [],
  ...overrides,
});

describe("the editor's sections", () => {
  it("are the six the operator reads, in order, with stable anchors", () => {
    expect(EDITOR_SECTIONS.map((section) => [section.label, section.anchor])).toEqual([
      ["Basics", "basics-section"],
      ["Photos", "photos-section"],
      ["Prices", "prices-section"],
      ["What's included", "included-section"],
      ["Route & stops", "stops-section"],
      ["More photos", "gallery-section"],
    ]);
  });

  it("counts a section as changed only when the fields it owns changed", () => {
    const original = form();

    expect(countUnsavedSections(original, form())).toBe(0);

    expect(countUnsavedSections(original, form({ title: "Another title" }))).toBe(1);
    expect(sectionIsDirty("basics", original, form({ title: "Another title" }))).toBe(true);
    expect(sectionIsDirty("prices", original, form({ title: "Another title" }))).toBe(false);

    // One change in each of three sections is three changes, not three keys.
    const three = form({
      title: "Another title",
      priceVariants: [{ id: "v1", variantName: "Standard", minPax: 1, maxPax: 8, pricePerPax: 750, flatPrice: null, isDefault: true }],
      inclusions: [{ id: "i1", text: "Guide and life vest", isIncluded: true, displayOrder: 1 }],
    });
    expect(countUnsavedSections(original, three)).toBe(3);
    expect(sectionIsDirty("prices", original, three)).toBe(true);
    expect(sectionIsDirty("included", original, three)).toBe(true);
    expect(sectionIsDirty("stops", original, three)).toBe(false);
  });

  it("treats an empty description and a missing one as the same", () => {
    const original = form({ description: null });
    expect(countUnsavedSections(original, form({ description: "" }))).toBe(0);
  });

  it("attaches each error to the section that owns it, in reading order", () => {
    expect(firstSectionWithErrors({})).toBeNull();
    expect(firstSectionWithErrors({ title: "Required" })?.id).toBe("basics");
    expect(firstSectionWithErrors({ coverImageUrl: "Bad" })?.id).toBe("photos");
    expect(firstSectionWithErrors({ "priceVariants.0.minPax": "Bad" })?.id).toBe("prices");
    expect(firstSectionWithErrors({ inclusions: "Add one" })?.id).toBe("included");
    expect(firstSectionWithErrors({ "stops.1.latitude": "Bad" })?.id).toBe("stops");
    expect(firstSectionWithErrors({ "galleryImages.0.caption": "Bad" })?.id).toBe("gallery");
    // More than one: the first section on the page wins, not the first key sent.
    expect(firstSectionWithErrors({ stops: "Bad", title: "Also bad" })?.id).toBe("basics");
  });

  it("says what each status allows, in plain words", () => {
    const statuses: EditPackageStatus[] = ["draft", "rejected", "published", "pending_review", "archived"];
    for (const status of statuses) {
      const text = statusExplanation(status);
      expect(text.length).toBeGreaterThan(40);
      // No jargon, and no "variant".
      expect(text).not.toMatch(/variant|RPC|status code/i);
    }
    expect(statusExplanation("published")).toMatch(/live/);
    expect(statusExplanation("pending_review")).toMatch(/not be changed|review/);
  });
});
