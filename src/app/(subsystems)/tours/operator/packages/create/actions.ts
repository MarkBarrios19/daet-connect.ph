"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uploadPackageImage } from "@/lib/tours/image-upload";
import { parseStops } from "./stops";

type CreatePackageResult = {
  success: boolean;
  error?: string;
  packageId?: string;
  /** Set when the tour was saved but could not go to review yet. */
  notice?: string;
};

export async function createPackage(formData: FormData): Promise<CreatePackageResult> {
  try {
    const parsedStops = parseStops(formData.get("stops"));
    if (!parsedStops) return { success: false, error: "Add at least one stop with a valid location selected from attractions or the map." };

    const supabase = await createSupabaseServerClient();

    // Extract form data
    const operatorId = formData.get("operator_id") as string;
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const location = formData.get("location") as string;
    const durationValue = parseInt(formData.get("duration_value") as string);
    const durationType = formData.get("duration_type") as string;
    const price = parseFloat(formData.get("price") as string);
    const minPax = formData.get("min_pax") ? parseInt(formData.get("min_pax") as string) : null;
    const inclusionsText = formData.get("inclusions") as string;
    const exclusionsText = formData.get("exclusions") as string;


    // Created as a draft: operators may only write their own drafts, and
    // submit_package_for_review moves it to review once everything is in.
    const { data: pkg, error: pkgError } = await supabase
      .from("tours_packages")
      .insert({
        operator_id: operatorId,
        title,
        description,
        location_name: location,
        duration_value: durationValue,
        duration_type: durationType,
        status: "draft",
      })
      .select("id")
      .single();

    if (pkgError || !pkg) {
      console.error("Package creation error:", pkgError);
      return { 
        success: false, 
        error: `Failed to create package: ${pkgError?.message || 'Unknown error'}` 
      };
    }

    const packageId = pkg.id;

    // Create inclusions
    const inclusionsLines = inclusionsText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const exclusionsLines = exclusionsText
      ? exclusionsText
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
      : [];

    const allInclusions = [
      ...inclusionsLines.map((item) => ({
        package_id: packageId,
        item_text: item,
        is_included: true,
      })),
      ...exclusionsLines.map((item) => ({
        package_id: packageId,
        item_text: item,
        is_included: false,
      })),
    ];

    if (allInclusions.length > 0) {
      const { error: inclError } = await supabase
        .from("tours_package_inclusions")
        .insert(allInclusions);

      if (inclError) {
        console.error("Inclusions error:", inclError);
        // Continue anyway - inclusions are optional
      }
    }

    // Create price variant
    const { error: priceError } = await supabase
      .from("tours_package_price_variants")
      .insert({
        package_id: packageId,
        variant_name: "Standard Rate",
        price_per_pax: price,
        min_pax: minPax,
        is_default: true,
      });

    if (priceError) {
      console.error("Price variant error:", priceError);
      return { success: false, error: "Failed to create pricing" };
    }

    // Create itinerary stops
    const stops = parsedStops.map((stop, index) => ({
      package_id: packageId,
      location_name: stop.locationName,
      description: stop.description,
      latitude: stop.latitude,
      longitude: stop.longitude,
      stop_order: index,
    }));

    if (stops.length > 0) {
      const { error: stopsError } = await supabase
        .from("tours_package_stops")
        .insert(stops);

      if (stopsError) {
        console.error("Stops error:", stopsError);
        return { success: true, packageId, notice: "Saved as a draft, but the stops could not be saved. Please add them in the editor." };
      }
    }

    // Upload images if provided
    const coverImageFile = formData.get("coverImage") as File | null;
    const galleryFiles = formData.getAll("galleryImages") as File[];


    if (coverImageFile && coverImageFile.size > 0) {
      const result = await uploadPackageImage(coverImageFile, packageId, "cover");

      if (result.success && result.url) {
        // Update package with cover image URL
        const { error: updateError } = await supabase
          .from("tours_packages")
          .update({ cover_image_url: result.url })
          .eq("id", packageId)
          .select("id, cover_image_url");

        if (updateError) {
          console.error("Cover image URL update failed:", updateError.message);
        }
      } else {
        console.error("Cover image upload failed:", result.error);
        // Don't fail the whole operation for image upload
      }
    }

    // Upload gallery images
    if (galleryFiles.length > 0) {
      
      for (let i = 0; i < galleryFiles.length; i++) {
        const file = galleryFiles[i];
        if (file.size === 0) continue; // Skip empty files
        
        const result = await uploadPackageImage(file, packageId, "gallery");
        
        if (result.success && result.url) {
          // Insert into tours_package_gallery
          await supabase
            .from("tours_package_gallery")
            .insert({
              package_id: packageId,
              image_url: result.url,
              display_order: i,
            });
          
        } else {
          console.error(`Gallery image ${i + 1} upload failed:`, result.error);
          // Continue with remaining images
        }
      }
    }

    const { error: submitError } = await supabase.rpc("submit_package_for_review", { p_package_id: packageId });
    if (submitError) {
      return { success: true, packageId, notice: `Saved as a draft: ${submitError.message}` };
    }

    return { success: true, packageId };
  } catch (err) {
    console.error("Create package error:", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}
