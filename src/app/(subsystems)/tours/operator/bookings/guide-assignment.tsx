"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";
import { useFeedback } from "@/components/ui/feedback";
import { BUSY_LABELS, type BusyReason } from "@/lib/tours/guide-swap";
import { GUIDE_NOT_NEEDED_NOTE_MAX, guideNotNeededDay } from "@/lib/tours/guide-not-needed";
import { assignGuideToBooking, setGuideNotNeeded } from "./actions";

/** The guest's "we don't need a tour guide", as recorded on the booking. */
export type GuideNotNeeded = { at: string; note: string | null };

type GuideAssignmentProps = {
  bookingId: string;
  currentGuideId: string | null;
  availableGuides: Array<{ id: string; full_name: string; contact_phone: string }>;
  /** Guide id → marked available (true) / unavailable (false) on the tour date; missing = not set. */
  availability?: Record<string, boolean>;
  /** R6: why each guide can't take the tour date (from tours_guides_free_on); null = free, missing = unknown. */
  busy?: Record<string, BusyReason | null>;
  /** Set when the guest asked for this tour to go ahead without a guide. */
  guideNotNeeded?: GuideNotNeeded | null;
};

/**
 * Who is leading this tour.
 *
 * Three states, in the order they usually happen:
 *
 *   assigned   a guide is on it — Assign a different one, or Unassign.
 *   unassigned nobody yet — the operator picks one, or records that the guest
 *              asked for none, so the tour stops looking unfinished.
 *   waived     the guest asked to go without one — shown as a decision, with
 *              "Assign a guide after all" for when they change their mind.
 */
export function GuideAssignment({
  bookingId,
  currentGuideId,
  availableGuides,
  availability = {},
  busy = {},
  guideNotNeeded = null,
}: GuideAssignmentProps) {
  const groupId = useId();
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [pending, startTransition] = useTransition();
  const [selectedGuideId, setSelectedGuideId] = useState(currentGuideId || "");
  const [error, setError] = useState<string | null>(null);
  const [askingNoGuide, setAskingNoGuide] = useState(false);
  const [note, setNote] = useState("");

  const blocked = (id: string) => id !== currentGuideId && Boolean(busy[id]);
  const currentGuideName = availableGuides.find((g) => g.id === currentGuideId)?.full_name ?? "The guide";

  function run(work: () => Promise<{ success: boolean; error?: string }>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (!result.success) {
        setError(result.error || "Something went wrong. Please try again.");
        return;
      }
      onSuccess?.();
      router.refresh();
    });
  }

  function handleAssign() {
    if (!selectedGuideId) {
      setError("Please select a guide");
      return;
    }
    if (selectedGuideId === currentGuideId) {
      setError("This guide is already assigned");
      return;
    }
    run(
      () => assignGuideToBooking(bookingId, selectedGuideId),
      () => toast(`${availableGuides.find((g) => g.id === selectedGuideId)?.full_name ?? "The guide"} is leading this tour.`, "success"),
    );
  }

  async function handleUnassign() {
    const ok = await confirm({
      title: `Take ${currentGuideName} off this tour?`,
      description: "They are told in the app. The tour then shows as having no guide until you pick another one.",
      confirmLabel: "Unassign",
    });
    if (!ok) return;
    run(
      () => assignGuideToBooking(bookingId, null),
      () => {
        setSelectedGuideId("");
        toast("Guide removed from this tour.", "success");
      },
    );
  }

  /**
   * "We don't need a guide": clears whoever was assigned and records the
   * guest's request, so the booking stops looking like a guide was forgotten.
   */
  function recordNoGuide() {
    run(
      () => setGuideNotNeeded(bookingId, true, note),
      () => {
        setAskingNoGuide(false);
        setNote("");
        setSelectedGuideId("");
        toast("Saved: this tour goes ahead without a guide.", "success");
      },
    );
  }

  function undoNoGuide() {
    run(
      () => setGuideNotNeeded(bookingId, false),
      () => toast("This tour needs a guide again. Pick one below.", "success"),
    );
  }

  return (
    <div className="space-y-3">
      {/* One place at a time: the panel, or the dialog when it is open. */}
      {error && !askingNoGuide ? <Notice variant="error">{error}</Notice> : null}

      {guideNotNeeded ? (
        <div className="rounded-2xl bg-green-50 p-3 text-sm dark:bg-green-950/30">
          <p className="font-bold text-daet-ink">No guide for this tour</p>
          <p className="mt-1 text-daet-ink/80">
            The guest asked to go without one
            {guideNotNeededDay(guideNotNeeded.at) ? ` (${guideNotNeededDay(guideNotNeeded.at)})` : ""}. The tour stays
            guideless; the guest has been told.
          </p>
          {guideNotNeeded.note ? <p className="mt-1 italic text-daet-ink/80">“{guideNotNeeded.note}”</p> : null}
          <Button variant="secondary" className="mt-3" onClick={undoNoGuide} disabled={pending} loading={pending} loadingText="Saving…">
            Assign a guide after all
          </Button>
        </div>
      ) : (
        <>
          {availableGuides.length === 0 ? (
            <p className="rounded-2xl bg-yellow-50 p-3 text-sm text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200">
              No approved guides available. Guides must be approved before assignment.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex min-w-0 flex-1 basis-48 flex-col">
                <label htmlFor={`${groupId}-guide`} className="sr-only">
                  Guide for this booking
                </label>
                <Select
                  id={`${groupId}-guide`}
                  value={selectedGuideId}
                  onChange={(event) => setSelectedGuideId(event.target.value)}
                  disabled={pending}
                  className="min-h-11 py-2"
                >
                  <option value="">Select a guide...</option>
                  {[...availableGuides]
                    .sort(
                      (a, b) =>
                        Number(blocked(a.id)) - Number(blocked(b.id)) ||
                        rank(availability[a.id]) - rank(availability[b.id]),
                    )
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
                </Select>
              </div>

              {currentGuideId ? (
                <Button variant="secondary" className="shrink-0" onClick={handleUnassign} disabled={pending}>
                  Unassign
                </Button>
              ) : (
                <Button className="shrink-0" onClick={handleAssign} disabled={pending || !selectedGuideId} loading={pending} loadingText="Assigning...">
                  Assign
                </Button>
              )}
            </div>
          )}

          {selectedGuideId && availability[selectedGuideId] === false && selectedGuideId !== currentGuideId ? (
            <p className="text-sm font-bold text-yellow-800 dark:text-yellow-200">
              This guide marked the tour date as not available. Message them before assigning.
            </p>
          ) : null}

          {currentGuideId ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-daet-ink/70">Currently assigned:</span>
              <span className="font-bold text-daet-forest dark:text-blue-300">{currentGuideName}</span>
            </div>
          ) : null}

          {/* The guest's request: the tour is guideless on purpose, not forgotten. */}
          <button
            type="button"
            onClick={() => {
              setError(null);
              setAskingNoGuide(true);
            }}
            disabled={pending}
            className="min-h-11 text-sm font-bold text-daet-ink/80 underline underline-offset-2 hover:text-daet-ink disabled:opacity-50"
          >
            Guest doesn&apos;t need a guide
          </button>
        </>
      )}

      <Modal
        open={askingNoGuide}
        onClose={() => {
          if (!pending) setAskingNoGuide(false);
        }}
        title={currentGuideId ? `Take ${currentGuideName} off this tour?` : "Record that no guide is needed"}
        description={
          currentGuideId
            ? `${currentGuideName} is told they are no longer leading this tour, and any pending swap request is cancelled. The guest is told too.`
            : "The booking stops showing as needing a guide. The guest is told the tour goes ahead without one."
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setAskingNoGuide(false)} disabled={pending}>
              Keep a guide
            </Button>
            <Button onClick={recordNoGuide} loading={pending} loadingText="Saving…">
              No guide needed
            </Button>
          </>
        }
      >
        {error && askingNoGuide ? (
          <Notice variant="error" className="mb-3">
            {error}
          </Notice>
        ) : null}
        <label htmlFor={`${groupId}-note`} className="block text-sm font-bold text-daet-ink">
          What did the guest say? <span className="font-normal text-daet-ink/70">(optional)</span>
        </label>
        <Textarea
          id={`${groupId}-note`}
          className="mt-1"
          rows={2}
          maxLength={GUIDE_NOT_NEEDED_NOTE_MAX}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={currentGuideId ? "e.g. Guest asked in chat: “di namin kailangan ng tour guide”" : "e.g. Guest asked in chat"}
        />
      </Modal>
    </div>
  );
}

/** Available first, then not set, then not available. */
function rank(value: boolean | undefined): number {
  return value === true ? 0 : value === undefined ? 1 : 2;
}
