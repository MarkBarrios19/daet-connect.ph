import { heroPhotos } from "@/lib/tours/hero-photos";

const row = (n: number, extra: Record<string, unknown> = {}) => ({ image_url: `/p${n}.jpg`, caption: `Photo ${n}`, display_order: n, ...extra });

describe("heroPhotos", () => {
  it("puts the cover first and the gallery after it, by display order", () => {
    const photos = heroPhotos("Calaguas", "/cover.jpg", [row(2), row(1)]);
    expect(photos.map((p) => p.src)).toEqual(["/cover.jpg", "/p1.jpg", "/p2.jpg"]);
    expect(photos[0].alt).toBe("Calaguas");
    expect(photos[1].alt).toBe("Photo 1");
  });

  it("does not show the cover twice when the gallery repeats it", () => {
    expect(heroPhotos("T", "/p1.jpg", [row(1), row(2)]).map((p) => p.src)).toEqual(["/p1.jpg", "/p2.jpg"]);
  });

  it("falls back to a plain alt for a gallery photo with no caption, and skips rows with no URL", () => {
    const photos = heroPhotos("Calaguas", null, [row(1, { caption: "  " }), row(2, { image_url: "" })]);
    expect(photos).toEqual([{ src: "/p1.jpg", alt: "Photo of Calaguas" }]);
  });

  it("is empty with no cover and no gallery", () => {
    expect(heroPhotos("T", undefined, [])).toEqual([]);
  });
});
