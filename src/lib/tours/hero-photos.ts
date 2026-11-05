/** One photo in a trip's hero carousel. */
export type HeroPhoto = { src: string; alt: string };

type GalleryRow = { image_url: string; caption?: string | null; display_order?: number | null };

/**
 * The photos the trip hero shows, in order: the cover first, then the gallery
 * by `display_order`. A gallery photo that is the cover itself is not shown
 * twice. Rows without a URL are dropped.
 */
export function heroPhotos(title: string, coverUrl: string | null | undefined, gallery: GalleryRow[]): HeroPhoto[] {
  const rows = gallery
    .filter((row) => row.image_url)
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  const photos: HeroPhoto[] = [];
  if (coverUrl) photos.push({ src: coverUrl, alt: title });
  for (const row of rows) {
    if (row.image_url === coverUrl) continue;
    photos.push({ src: row.image_url, alt: row.caption?.trim() || `Photo of ${title}` });
  }
  return photos;
}
