import { createPackage } from "./actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("@/lib/tours/image-upload", () => ({ uploadPackageImage: jest.fn() }));

const stops = [
  { locationName: "First beach", description: "Start - here", latitude: 14.21, longitude: 122.91 },
  { locationName: "Second island", description: "Swim", latitude: 14.45, longitude: 123.12 },
];
function form(value: unknown = stops) {
  const data = new FormData();
  for (const [key, val] of Object.entries({ operator_id: "operator", title: "Title", description: "Description", location: "Daet", duration_value: "1", duration_type: "days", price: "500", inclusions: "Guide", exclusions: "" })) data.set(key, val);
  if (value !== undefined) data.set("stops", typeof value === "string" ? value : JSON.stringify(value));
  return data;
}

describe("createPackage stops", () => {
  const inserts: Record<string, jest.Mock> = {};
  const rpc = jest.fn();
  const from = jest.fn((table: string) => ({ insert: inserts[table] }));
  beforeEach(() => {
    for (const table of ["tours_packages", "tours_package_inclusions", "tours_package_price_variants", "tours_package_stops"]) inserts[table] = jest.fn().mockResolvedValue({ error: null });
    inserts.tours_packages.mockReturnValue({ select: () => ({ single: async () => ({ data: { id: "pkg" }, error: null }) }) });
    rpc.mockResolvedValue({ error: null });
    (createSupabaseServerClient as jest.Mock).mockResolvedValue({ from, rpc });
  });

  it("persists each selected stop's own coordinates and order", async () => {
    expect(await createPackage(form())).toEqual({ success: true, packageId: "pkg" });
    expect(inserts.tours_package_stops).toHaveBeenCalledWith([
      { package_id: "pkg", location_name: "First beach", description: "Start - here", latitude: 14.21, longitude: 122.91, stop_order: 0 },
      { package_id: "pkg", location_name: "Second island", description: "Swim", latitude: 14.45, longitude: 123.12, stop_order: 1 },
    ]);
  });

  it.each([
    ["missing payload", null], ["old free text", "Beach - here"], ["empty list", []],
    ["missing latitude", [{ ...stops[0], latitude: undefined }]], ["null longitude", [{ ...stops[0], longitude: null }]],
    ["string coordinate", [{ ...stops[0], latitude: "14" }]], ["latitude out of range", [{ ...stops[0], latitude: 91 }]],
    ["longitude out of range", [{ ...stops[0], longitude: -181 }]], ["non-finite coordinate", [{ ...stops[0], latitude: Infinity }]],
    ["invalid second stop", [stops[0], { ...stops[1], longitude: null }]],
  ])("rejects %s before creating a package", async (_label, input) => {
    const data = form(input);
    if (input === null) data.delete("stops");
    const result = await createPackage(data);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/valid location/);
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("accepts zero and boundary coordinates", async () => {
    expect((await createPackage(form([{ ...stops[0], latitude: 0, longitude: -180 }, { ...stops[1], latitude: 90, longitude: 180 }]))).success).toBe(true);
  });

  it("keeps a draft and does not submit for review if saving stops fails", async () => {
    inserts.tours_package_stops.mockResolvedValue({ error: { message: "database error" } });
    const result = await createPackage(form());
    expect(result).toMatchObject({ success: true, packageId: "pkg", notice: expect.stringContaining("stops could not be saved") });
    expect(rpc).not.toHaveBeenCalled();
  });
});
