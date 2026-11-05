import type { Fare } from "@/lib/tours/guide/fares";

/**
 * The active rows of tours_fares as loaded on 2026-11-05
 * (supabase/seed/fares_2026_11_transport.sql), without the notes and sources,
 * so the planner can be tested on the real network of routes.
 */
type Row = [Fare["mode"], string, string, number | null, number | null, Fare["fare_per"], number | null, number | null];

const ROWS: Row[] = [
  ["boat", "Allen (Samar)", "Matnog", 120, 264, "person", 90, 120],
  ["boat", "Mercedes port", "Apuao Grande", 2000, 3500, "boat", 30, 45],
  ["boat", "Mercedes port", "Canimog Island", 2000, 3500, "boat", null, null],
  ["boat", "Paracale port", "Calaguas", 2500, 6500, "boat", 120, 150],
  ["boat", "Vinzons", "Calaguas", 2500, 3000, "boat", 90, 120],
  ["bus", "Manila (Cubao)", "Daet", 980, 1084, "person", 390, 600],
  ["bus", "Manila (Cubao)", "Naga", 1000, 1380, "person", 480, 600],
  ["bus", "Manila (NAIA)", "Manila (Cubao)", 200, 200, "person", null, null],
  ["bus", "Manila (NAIA)", "Manila (PITX)", 150, 150, "person", null, null],
  ["bus", "Manila (PITX)", "Daet", 752, 950, "person", 480, 540],
  ["jeepney", "Daet", "Vinzons", null, null, "person", null, null],
  ["jeepney", "Daet", "Mercedes", null, null, "person", null, null],
  ["plane", "Bacolod", "Manila (NAIA)", null, null, "person", 70, 90],
  ["plane", "Cagayan de Oro", "Manila (NAIA)", null, null, "person", 100, 100],
  ["plane", "Cebu (Mactan)", "Manila (NAIA)", 1088, 1377, "person", 80, 95],
  ["plane", "Davao", "Manila (NAIA)", 3145, null, "person", 105, 125],
  ["plane", "General Santos", "Manila (NAIA)", null, null, "person", 124, 124],
  ["plane", "Iloilo", "Manila (NAIA)", null, null, "person", null, null],
  ["plane", "Manila (NAIA)", "Naga Airport (Pili)", 1347, 3922, "person", 80, 80],
  ["plane", "Tacloban", "Manila (NAIA)", null, null, "person", null, null],
  ["plane", "Zamboanga", "Manila (NAIA)", null, null, "person", 90, 115],
  ["tricycle", "Daet town center", "Bagasbas", 30, 30, "person", 10, 15],
  ["van", "Daet", "Paracale", null, null, "person", null, null],
  ["van", "Naga", "Daet", 120, 140, "person", 120, 120],
];

export const LIVE_FARES: Fare[] = ROWS.map(([mode, from_name, to_name, fare_min, fare_max, fare_per, minutes_min, minutes_max], i) => ({
  id: `live-${i}`,
  mode,
  from_name,
  to_name,
  board_place_id: null,
  fare_min,
  fare_max,
  fare_per,
  minutes_min,
  minutes_max,
  schedule_note: null,
  source: "supabase/seed/fares_2026_11_transport.sql",
  checked_on: "2026-11-05",
  verified: false,
  is_active: true,
}));
