"use client";

import { useState } from "react";
import { useFeedback } from "@/components/ui/feedback";
import { useRouter } from "next/navigation";
import { BUSY_LABELS, type BusyReason } from "@/lib/tours/guide-swap";
import { assignGuideToBooking } from "./actions";

type GuideAssignmentProps = {
  bookingId: string;
  currentGuideId: string | null;
  availableGuides: Array<{ id: string; full_name: string; contact_phone: string }>;
  /** Guide id → marked available (true) / unavailable (false) on the tour date; missing = not set. */
  availability?: Record<string, boolean>;
  /** R6: why each guide can't take the tour date (from tours_guides_free_on); null = free, missing = unknown. */
  busy?: Record<string, BusyReason | null>;
};

export function GuideAssignment({
  bookingId,
  currentGuideId,
  availableGuides,
  availability = {},
  busy = {},
}: GuideAssignmentProps) {
  const blocked = (id: string) => id !== currentGuideId && Boolean(busy[id]);
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [selectedGuideId, setSelectedGuideId] = useState(currentGuideId || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAssign = async () => {
    if (!selectedGuideId) {
      setError("Please select a guide");
      return;
    }

    if (selectedGuideId === currentGuideId) {
      setError("This guide is already assigned");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const result = await assignGuideToBooking(bookingId, selectedGuideId);

    if (!result.success) {
      setError(result.error || "Failed to assign guide");
      setIsSubmitting(false);
    } else {
      router.refresh();
    }
  };

  const handleUnassign = async () => {
    if (!(await confirm({ title: "Unassign this guide?", confirmLabel: "Unassign" }))) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const result = await assignGuideToBooking(bookingId, null);

    if (!result.success) {
      setError(result.error || "Failed to unassign guide");
      setIsSubmitting(false);
    } else {
      setSelectedGuideId("");
      router.refresh();
    }
  };

  if (availableGuides.length === 0) {
    return (
      <div className="rounded-2xl bg-yellow-50 dark:bg-yellow-950/40 p-3 text-sm text-yellow-800 dark:text-yellow-200">
        No approved guides available. Guides must be approved before assignment.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-2xl bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label="Guide for this booking"
          value={selectedGuideId}
          onChange={(e) => setSelectedGuideId(e.target.value)}
          disabled={isSubmitting}
          className="min-w-0 max-w-full flex-1 basis-48 rounded-2xl border border-daet-ink/20 min-h-11 px-4 py-2 text-base focus:border-daet-forest focus:outline-none focus:ring-2 focus:ring-daet-forest/20"
        >
          <option value="">Select a guide...</option>
          {[...availableGuides]
            .sort((a, b) => Number(blocked(a.id)) - Number(blocked(b.id)) || rank(availability[a.id]) - rank(availability[b.id]))
            .map((guide) => {
              const reason = guide.id === currentGuideId ? null : busy[guide.id];
              return (
                <option key={guide.id} value={guide.id} disabled={Boolean(reason)}>
                  {reason ? "✕ " : availability[guide.id] === true ? "✓ " : availability[guide.id] === false ? "✕ " : ""}
                  {guide.full_name} - {guide.contact_phone}
                  {reason ? ` (${BUSY_LABELS[reason]})` : availability[guide.id] === false ? " (not available)" : ""}
                </option>
              );
            })}
        </select>

        {currentGuideId ? (
          <button
            onClick={handleUnassign}
            disabled={isSubmitting}
            className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full bg-muted px-4 text-sm font-bold text-daet-ink transition hover:bg-muted-strong disabled:opacity-50"
          >
            {isSubmitting ? "Unassigning..." : "Unassign"}
          </button>
        ) : (
          <button
            onClick={handleAssign}
            disabled={isSubmitting || !selectedGuideId}
            className="inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-daet-forest px-6 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? "Assigning..." : "Assign"}
          </button>
        )}
      </div>

      {selectedGuideId && availability[selectedGuideId] === false && selectedGuideId !== currentGuideId ? (
        <p className="text-sm font-bold text-yellow-800 dark:text-yellow-200">This guide marked the tour date as not available. Message them before assigning.</p>
      ) : null}

      {currentGuideId && (
        <div className="flex flex-wrap items-center gap-x-2 text-sm">
          <span className="text-daet-ink/70">Currently assigned:</span>
          <span className="min-w-0 break-words font-bold text-daet-forest dark:text-blue-300">
            {availableGuides.find((g) => g.id === currentGuideId)?.full_name || "Unknown"}
          </span>
        </div>
      )}
    </div>
  );
}

/** Available first, then not set, then not available. */
function rank(value: boolean | undefined): number {
  return value === true ? 0 : value === undefined ? 1 : 2;
}
