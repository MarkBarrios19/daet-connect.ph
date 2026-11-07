import type { EditPackageFormData, EditPackageStatus, ValidationErrors } from "./edit-types";
import { countErrors, parseValidationErrors } from "./validation";
import { sectionChanged } from "./change-detection";

/**
 * The editor's sections, in the order the operator reads them, with the shape of
 * the change in each one. The sidebar, the phone's dropdown, the Unsaved badges
 * and the save bar's count all come from here, so they can never disagree.
 */
export type EditorSectionId = "basics" | "photos" | "prices" | "included" | "stops" | "gallery";

export type EditorSectionDefinition = {
  id: EditorSectionId;
  /** The DOM id, also its anchor target. */
  anchor: string;
  /** What the operator calls it. */
  label: string;
  /** What this section is about, in one line. */
  description: string;
  /** The part of the form this section edits. */
  changed: (original: EditPackageFormData, current: EditPackageFormData) => boolean;
  /**
   * Does this section own any of these errors? Keys are either the section's own
   * name ("priceVariants") or a field inside it ("priceVariants.0.minPax").
   */
  hasErrors: (errors: ValidationErrors) => boolean;
};

/** "", null and undefined all mean "nothing here" for an optional text field. */
function normalizeOptionalText(value: string | null | undefined): string | null {
  return value === undefined || value === null || value === "" ? null : value;
}

const ERRORS_BY_SECTION: Record<EditorSectionId, string[]> = {
  basics: ["title", "locationName", "description", "durationValue", "durationType"],
  photos: ["coverImageUrl"],
  prices: ["priceVariants"],
  included: ["inclusions"],
  stops: ["stops"],
  gallery: ["galleryImages"],
};

/** A server key names its section, or a field inside it with a dot. */
function errorBelongs(key: string, roots: string[]): boolean {
  return roots.some((root) => key === root || key.startsWith(`${root}.`));
}

export const EDITOR_SECTIONS: EditorSectionDefinition[] = [
  {
    id: "basics",
    anchor: "basics-section",
    label: "Basics",
    description: "Title, place, how long",
    changed: (original, current) =>
      sectionChanged(
        {
          title: original.title,
          locationName: original.locationName,
          // A cleared description and one that was never set are the same thing.
          description: normalizeOptionalText(original.description),
          durationValue: original.durationValue,
          durationType: original.durationType,
        },
        {
          title: current.title,
          locationName: current.locationName,
          description: normalizeOptionalText(current.description),
          durationValue: current.durationValue,
          durationType: current.durationType,
        },
      ),
    hasErrors: (errors) => Object.keys(errors).some((key) => errorBelongs(key, ERRORS_BY_SECTION.basics)),
  },
  {
    id: "photos",
    anchor: "photos-section",
    label: "Photos",
    description: "The cover photo",
    changed: (original, current) => sectionChanged(original.coverImageUrl ?? null, current.coverImageUrl ?? null),
    hasErrors: (errors) => Object.keys(errors).some((key) => errorBelongs(key, ERRORS_BY_SECTION.photos)),
  },
  {
    id: "prices",
    anchor: "prices-section",
    label: "Prices",
    description: "What guests pay",
    changed: (original, current) => sectionChanged(original.priceVariants ?? [], current.priceVariants ?? []),
    hasErrors: (errors) => Object.keys(errors).some((key) => errorBelongs(key, ERRORS_BY_SECTION.prices)),
  },
  {
    id: "included",
    anchor: "included-section",
    label: "What's included",
    description: "In the price, and not",
    changed: (original, current) => sectionChanged(original.inclusions ?? [], current.inclusions ?? []),
    hasErrors: (errors) => Object.keys(errors).some((key) => errorBelongs(key, ERRORS_BY_SECTION.included)),
  },
  {
    id: "stops",
    anchor: "stops-section",
    label: "Route & stops",
    description: "Where the tour goes",
    changed: (original, current) => sectionChanged(original.stops ?? [], current.stops ?? []),
    hasErrors: (errors) => Object.keys(errors).some((key) => errorBelongs(key, ERRORS_BY_SECTION.stops)),
  },
  {
    id: "gallery",
    anchor: "gallery-section",
    label: "More photos",
    description: "The rest of the gallery",
    changed: (original, current) => sectionChanged(original.galleryImages ?? [], current.galleryImages ?? []),
    hasErrors: (errors) => Object.keys(errors).some((key) => errorBelongs(key, ERRORS_BY_SECTION.gallery)),
  },
];

/**
 * How many changes are unsaved: one per section that differs from what was
 * loaded. A count of sections, not of keystrokes, so "3 unsaved changes" is a
 * number the person can act on.
 */
export function countUnsavedSections(original: EditPackageFormData, current: EditPackageFormData): number {
  return EDITOR_SECTIONS.filter((section) => section.changed(original, current)).length;
}

export function sectionIsDirty(
  id: EditorSectionId,
  original: EditPackageFormData,
  current: EditPackageFormData,
): boolean {
  const section = EDITOR_SECTIONS.find((entry) => entry.id === id);
  return section ? section.changed(original, current) : false;
}

/**
 * When saving fails, which section should the page scroll to? The first one the
 * error map names, in reading order, so the person starts at the top and works
 * down rather than being dropped at the first key the server happened to send.
 */
export function firstSectionWithErrors(errors: ValidationErrors): EditorSectionDefinition | null {
  if (countErrors(errors) === 0) return null;
  return EDITOR_SECTIONS.find((section) => section.hasErrors(errors)) ?? null;
}

/** The server's messages, grouped the way the editor draws them. */
export function groupErrors(errors: ValidationErrors) {
  return parseValidationErrors(errors);
}

/**
 * What the package's status allows, in one line, said up front rather than in
 * notes after each field.
 */
export function statusExplanation(status: EditPackageStatus): string {
  switch (status) {
    case "published":
      return "Text, cover photo and captions save straight away, and the package stays live. Price, inclusions and stops also go live as you save them, so check them before you press Save — existing bookings are not changed.";
    case "draft":
      return "This draft is yours alone. Nothing is shown to tourists until you submit it and the Tourism Office approves it.";
    case "rejected":
      return "The Tourism Office sent this one back. Fix what they asked for, then submit it again.";
    case "pending_review":
      return "This package is with the Tourism Office for review. It can be read here, but not changed until they decide.";
    case "archived":
    default:
      return "This package is archived. It can be read here, but not changed.";
  }
}
