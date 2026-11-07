"use client";

import { useState } from "react";
import type { PackageDraft } from "../package-types";

interface PackageInclusionsStepProps {
  data: PackageDraft;
  onComplete: (data: Partial<PackageDraft>) => void;
  onBack: () => void;
  loading: boolean;
}

export function PackageInclusionsStep({
  data,
  onComplete,
  onBack,
  loading,
}: PackageInclusionsStepProps) {
  const [inclusions, setInclusions] = useState<string[]>(data.inclusions);
  const [exclusions, setExclusions] = useState<string[]>(data.exclusions);
  const [newInclusion, setNewInclusion] = useState("");
  const [newExclusion, setNewExclusion] = useState("");

  const addInclusion = () => {
    if (newInclusion.trim()) {
      setInclusions([...inclusions, newInclusion.trim()]);
      setNewInclusion("");
    }
  };

  const removeInclusion = (index: number) => {
    setInclusions(inclusions.filter((_, i) => i !== index));
  };

  const addExclusion = () => {
    if (newExclusion.trim()) {
      setExclusions([...exclusions, newExclusion.trim()]);
      setNewExclusion("");
    }
  };

  const removeExclusion = (index: number) => {
    setExclusions(exclusions.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onComplete({ inclusions, exclusions });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-daet-ink">What's included?</h2>
        <p className="mt-2 text-sm text-daet-ink/65">
          Help tourists know exactly what they're getting — list what's included and what's not.
        </p>
      </div>

      {/* Inclusions */}
      <div>
        <label htmlFor="new-inclusion" className="block text-sm font-bold text-daet-ink">Inclusions</label>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          What's provided in this tour package?
        </p>

        <div className="mt-3 flex gap-2">
          <input
            id="new-inclusion"
            type="text"
            value={newInclusion}
            onChange={(e) => setNewInclusion(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addInclusion())}
            placeholder="e.g., Transportation, Lunch, Tour guide"
            maxLength={200}
            className="flex-1 rounded-full border border-daet-ink/15 bg-surface min-h-11 px-4 py-2.5 text-base outline-none transition placeholder:text-slate-500 focus:border-daet-forest focus:ring-4 focus:ring-daet-forest/10"
          />
          <button
            type="button"
            onClick={addInclusion}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-daet-forest/10 px-5 text-sm font-bold text-daet-leaf dark:text-blue-300 transition hover:bg-daet-forest/20"
          >
            Add
          </button>
        </div>

        {inclusions.length > 0 && (
          <ul className="mt-3 space-y-2">
            {inclusions.map((item, index) => (
              <li
                key={index}
                className="flex items-center justify-between gap-3 rounded-2xl bg-green-50 dark:bg-green-950/40 px-4 py-3 text-sm"
              >
                <span className="flex items-center gap-2 text-green-900 dark:text-green-300">
                  <span className="text-base" aria-hidden="true">
                    ✓
                  </span>
                  {item}
                </span>
                <button
                  type="button"
                  onClick={() => removeInclusion(index)}
                  className="text-green-700 dark:text-green-300 hover:text-green-900 dark:hover:text-green-300"
                  aria-label={`Remove inclusion: ${item}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Exclusions */}
      <div>
        <label htmlFor="new-exclusion" className="block text-sm font-bold text-daet-ink">Exclusions</label>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          What should tourists prepare or pay for separately?
        </p>

        <div className="mt-3 flex gap-2">
          <input
            id="new-exclusion"
            type="text"
            value={newExclusion}
            onChange={(e) => setNewExclusion(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addExclusion())}
            placeholder="e.g., Personal expenses, Travel insurance"
            maxLength={200}
            className="flex-1 rounded-full border border-daet-ink/15 bg-surface min-h-11 px-4 py-2.5 text-base outline-none transition placeholder:text-slate-500 focus:border-daet-forest focus:ring-4 focus:ring-daet-forest/10"
          />
          <button
            type="button"
            onClick={addExclusion}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-daet-ink/10 px-5 text-sm font-bold text-daet-ink transition hover:bg-daet-ink/20"
          >
            Add
          </button>
        </div>

        {exclusions.length > 0 && (
          <ul className="mt-3 space-y-2">
            {exclusions.map((item, index) => (
              <li
                key={index}
                className="flex items-center justify-between gap-3 rounded-2xl bg-canvas px-4 py-3 text-sm"
              >
                <span className="flex items-center gap-2 text-daet-ink/70">
                  <span className="text-base" aria-hidden="true">
                    ✕
                  </span>
                  {item}
                </span>
                <button
                  type="button"
                  onClick={() => removeExclusion(index)}
                  className="text-daet-ink/70 hover:text-daet-ink"
                  aria-label={`Remove exclusion: ${item}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-between gap-3 border-t border-daet-ink/10 pt-6">
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="inline-flex min-h-12 items-center justify-center rounded-full border border-daet-ink/20 px-8 text-sm font-bold text-daet-ink transition hover:bg-daet-sand disabled:cursor-not-allowed disabled:opacity-50"
        >
          ← Back
        </button>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-daet-forest px-8 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Saving..." : "Continue →"}
        </button>
      </div>
    </form>
  );
}
