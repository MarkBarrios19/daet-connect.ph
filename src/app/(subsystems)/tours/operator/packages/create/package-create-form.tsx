"use client";

import { LineIcon } from "@/components/ui/icons";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPackage } from "./actions";
import { ImageUploader } from "@/components/tours/image-uploader";
import { CreateStopsPicker } from "./stops-picker";
import type { Attraction, CreateStop } from "./stops";
import { ImagePreview } from "@/components/tours/image-preview";

type Props = {
  operatorId: string;
  attractions: Attraction[];
};

export function PackageCreateForm({ operatorId, attractions }: Props) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stops, setStops] = useState<CreateStop[]>([]);
  const [savedDraft, setSavedDraft] = useState<{ id: string; notice: string } | null>(null);
  
  // Image upload state
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [galleryImages, setGalleryImages] = useState<File[]>([]);

  const handleCoverUpload = (files: File[]) => {
    if (files.length > 0) {
      setCoverImage(files[0]);
    }
  };

  const handleGalleryUpload = (files: File[]) => {
    const remaining = 10 - galleryImages.length;
    const newFiles = files.slice(0, remaining);
    setGalleryImages((prev) => [...prev, ...newFiles]);
  };

  const handleDeleteGallery = (index: number) => {
    setGalleryImages((prev) => prev.filter((_, i) => i !== index));
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (stops.length === 0) {
      setError("Add at least one stop by selecting an attraction or picking a point on the map.");
      return;
    }
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    formData.append("operator_id", operatorId);
    formData.set("stops", JSON.stringify(stops));
    
    // Append images to formData
    if (coverImage) {
      formData.append("coverImage", coverImage);
    }
    
    galleryImages.forEach((file, index) => {
      formData.append("galleryImages", file);
    });

    const result = await createPackage(formData);

    if (!result.success) {
      setError(result.error || "Failed to create package");
      setIsSubmitting(false);
      return;
    }

    // Saved, but not complete enough for review: finish it in the editor.
    if (result.notice && result.packageId) {
      setSavedDraft({ id: result.packageId, notice: result.notice });
      setIsSubmitting(false);
      return;
    }

    // Success - redirect to packages list
    router.push("/tours/operator/packages?submitted=true");
  }

  if (savedDraft) return (
    <div role="status" className="rounded-2xl card-edge bg-surface p-6">
      <p>{savedDraft.notice}</p>
      <a className="mt-4 inline-flex min-h-11 items-center font-bold text-blue-700 dark:text-blue-300" href={`/tours/operator/packages/${savedDraft.id}/edit`}>Continue editing the draft</a>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="rounded-2xl bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Basic Details */}
      <section className="rounded-2xl card-edge bg-surface p-6">
        <h2 className="text-xl font-bold text-daet-ink">Basic Details</h2>
        <p className="mt-1 text-sm text-daet-ink/70">
          Provide the essential information about your tour package.
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="title" className="block text-sm font-bold text-daet-ink">
              Package Title *
            </label>
            <input
              type="text"
              id="title"
              name="title"
              required
              minLength={10}
              maxLength={100}
              className="mt-1 w-full rounded-2xl border border-daet-ink/20 min-h-11 px-4 py-2 text-base focus:border-daet-forest focus:outline-none focus:ring-2 focus:ring-daet-forest/20"
              placeholder="e.g., Island Hopping Adventure"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-bold text-daet-ink">
              Description *
            </label>
            <textarea
              id="description"
              name="description"
              required
              minLength={50}
              maxLength={1000}
              rows={4}
              className="mt-1 w-full rounded-2xl border border-daet-ink/20 min-h-11 px-4 py-2 text-base focus:border-daet-forest focus:outline-none focus:ring-2 focus:ring-daet-forest/20"
              placeholder="Describe your tour package in detail..."
            />
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Min 50 characters</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="location" className="block text-sm font-bold text-daet-ink">
                Location *
              </label>
              <input
                type="text"
                id="location"
                name="location"
                required
                className="mt-1 w-full rounded-2xl border border-daet-ink/20 min-h-11 px-4 py-2 text-base focus:border-daet-forest focus:outline-none focus:ring-2 focus:ring-daet-forest/20"
                placeholder="e.g., Daet, Camarines Norte"
              />
            </div>

            <div>
              <label htmlFor="duration" className="block text-sm font-bold text-daet-ink">
                Duration *
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  type="number"
                  id="duration_value"
                  name="duration_value"
                  required
                  min={1}
                  max={30}
                  className="w-24 rounded-2xl border border-daet-ink/20 min-h-11 px-4 py-2 text-base focus:border-daet-forest focus:outline-none focus:ring-2 focus:ring-daet-forest/20"
                  placeholder="1"
                />
                <select
                  id="duration_type"
                  name="duration_type"
                  aria-label="Duration unit"
                  required
                  className="flex-1 rounded-2xl border border-daet-ink/20 min-h-11 px-4 py-2 text-base focus:border-daet-forest focus:outline-none focus:ring-2 focus:ring-daet-forest/20"
                >
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Inclusions */}
      <section className="rounded-2xl card-edge bg-surface p-6">
        <h2 className="text-xl font-bold text-daet-ink">What's Included</h2>
        <p className="mt-1 text-sm text-daet-ink/70">
          List what's included and not included in your package (one item per line).
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="inclusions" className="block text-sm font-bold text-daet-ink">
              Included Items *
            </label>
            <textarea
              id="inclusions"
              name="inclusions"
              required
              rows={4}
              className="mt-1 w-full rounded-2xl border border-daet-ink/20 min-h-11 px-4 py-2 text-base focus:border-daet-forest focus:outline-none focus:ring-2 focus:ring-daet-forest/20"
              placeholder={"Round-trip boat transfer\nSnorkeling equipment\nLunch and refreshments\nProfessional tour guide"}
            />
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">One item per line</p>
          </div>

          <div>
            <label htmlFor="exclusions" className="block text-sm font-bold text-daet-ink">
              Not Included (Optional)
            </label>
            <textarea
              id="exclusions"
              name="exclusions"
              rows={3}
              className="mt-1 w-full rounded-2xl border border-daet-ink/20 min-h-11 px-4 py-2 text-base focus:border-daet-forest focus:outline-none focus:ring-2 focus:ring-daet-forest/20"
              placeholder={"Personal expenses\nTravel insurance"}
            />
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">One item per line</p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="rounded-2xl card-edge bg-surface p-6">
        <h2 className="text-xl font-bold text-daet-ink">Pricing</h2>
        <p className="mt-1 text-sm text-daet-ink/70">
          Set the price for your tour package.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="price" className="block text-sm font-bold text-daet-ink">
              Price per Person (₱) *
            </label>
            <input
              type="number"
              id="price"
              name="price"
              required
              min={1}
              step={0.01}
              className="mt-1 w-full rounded-2xl border border-daet-ink/20 min-h-11 px-4 py-2 text-base focus:border-daet-forest focus:outline-none focus:ring-2 focus:ring-daet-forest/20"
              placeholder="1500"
            />
          </div>

          <div>
            <label htmlFor="min_pax" className="block text-sm font-bold text-daet-ink">
              Minimum Pax
            </label>
            <input
              type="number"
              id="min_pax"
              name="min_pax"
              min={1}
              max={100}
              className="mt-1 w-full rounded-2xl border border-daet-ink/20 min-h-11 px-4 py-2 text-base focus:border-daet-forest focus:outline-none focus:ring-2 focus:ring-daet-forest/20"
              placeholder="2"
            />
          </div>
        </div>
      </section>

      <CreateStopsPicker attractions={attractions} stops={stops} onChange={setStops} />

      {/* Image Upload */}
      <section className="rounded-2xl card-edge bg-surface p-6">
        <h2 className="text-xl font-bold text-daet-ink">Package Images</h2>
        <p className="mt-1 text-sm text-daet-ink/70">
          Upload photos to showcase your tour package. Images help tourists visualize the experience.
        </p>

        <div className="mt-6 space-y-6">
          {/* Cover Image */}
          <div>
            <ImageUploader
              onUpload={handleCoverUpload}
              maxFiles={1}
              multiple={false}
              label="Cover Image (Optional)"
              description="Main package photo - JPG, PNG, WebP up to 5MB"
            />
            
            {coverImage && (
              <div className="mt-4 flex items-center gap-3 rounded-2xl bg-canvas p-4">
                <img
                  src={URL.createObjectURL(coverImage)}
                  alt="Cover preview"
                  className="h-20 w-20 rounded-2xl object-cover"
                />
                <div className="flex-1">
                  <p className="text-sm font-bold text-daet-ink">{coverImage.name}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {(coverImage.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCoverImage(null)}
                  className="rounded-full p-2 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                  title="Remove cover image"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Gallery Images */}
          <div>
            <ImageUploader
              onUpload={handleGalleryUpload}
              maxFiles={10 - galleryImages.length}
              multiple={true}
              label={`Gallery Images (Optional) ${galleryImages.length > 0 ? `- ${galleryImages.length}/10` : ''}`}
              description="Additional photos showcasing your tour - up to 10 images"
            />

            {galleryImages.length > 0 && (
              <div className="mt-4">
                <ImagePreview
                  images={galleryImages.map((file) => ({
                    url: URL.createObjectURL(file),
                  }))}
                  onDelete={handleDeleteGallery}
                  editable={true}
                />
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-blue-50 dark:bg-blue-950/40 p-4">
            <p className="text-sm text-blue-900 dark:text-blue-300">
              <span className="font-bold"><LineIcon name="tip" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" /> Tip:</span> High-quality images attract more bookings! 
              Show the best aspects of your tour - scenery, activities, and happy tourists.
            </p>
          </div>
        </div>
      </section>

      {/* Submit */}
      <div className="flex items-center justify-between rounded-2xl card-edge bg-surface p-6">
        <div>
          <p className="text-sm font-bold text-daet-ink">Ready to submit?</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Your package will be reviewed by the Tourism Office before publishing.
          </p>
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full bg-daet-forest px-8 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? "Submitting..." : "Submit for Review"}
        </button>
      </div>
    </form>
  );
}
