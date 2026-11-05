-- Town fares around Daet, given by a local resident on 2026-11-05 (CONNECT-Daet).
--
-- All rides start from Daet town proper (the Daet Central Terminal area)
-- unless the row names another start. None is verified by the Tourism Office
-- or the town LGU yet (verified = false), so the assistant and the trip
-- planner show them as estimates to confirm with the driver. Replace them
-- with the posted fare matrix (tricycles) or the LTFRB matrix (jeepneys,
-- vans, buses) once the LGUs confirm them.
--
-- The Daet tricycle row is a distance fare: ₱15 for the first 2 km, then ₱1
-- for each extra km. It is stored as "from ₱15" with the rule in the note.
-- The student van fare to Labo is in the note of the regular row.
--
-- Rows already in the table with the same mode and places are updated.
-- Run in the Supabase SQL editor, or: psql "$DATABASE_URL" -f this file.

BEGIN;

INSERT INTO public.tours_fares
  (mode, from_name, to_name, fare_min, fare_max, fare_per, minutes_min, minutes_max, schedule_note, source, checked_on, verified, is_active)
VALUES
  ('tricycle', 'Daet town', 'Short rides around town', 15, NULL, 'person', NULL, NULL,
   'Daet tricycle fare: ₱15 for the first 2 km, then ₱1 for each extra km. Agree on the fare before riding; special (solo) trips cost more.',
   'Daet tricycle fare as given by a local resident, 2026-11-05. To confirm against the posted Daet fare matrix.', '2026-11-05', false, true),
  ('tricycle', 'Daet', 'Vinzons', 20, 20, 'person', NULL, NULL,
   'Tricycle from Daet town to Vinzons. Agree on the fare before riding.',
   'Given by a local resident, 2026-11-05. To confirm with the Vinzons LGU.', '2026-11-05', false, true),
  ('van', 'Lourdes, Daet', 'Daguit, Labo', 60, 60, 'person', NULL, NULL,
   'Van from Barangay Lourdes (Daet) to Daguit (Labo).',
   'Given by a local resident, 2026-11-05. To confirm with LTFRB or the van terminal.', '2026-11-05', false, true),
  ('bus', 'Daet', 'Labo', 30, 30, 'person', NULL, NULL,
   'Bus from Daet to Labo town.',
   'Given by a local resident, 2026-11-05. To confirm with the bus line.', '2026-11-05', false, true),
  ('jeepney', 'Daet', 'Labo', 30, 30, 'person', NULL, NULL,
   'Jeepney from the Daet terminal to Labo town.',
   'Given by a local resident, 2026-11-05. To confirm against the LTFRB jeepney matrix.', '2026-11-05', false, true),
  ('van', 'Daet', 'Labo', 41, 41, 'person', NULL, NULL,
   'Van (UV Express) from Daet to Labo: ₱41 regular, ₱33 for students with a school ID.',
   'Given by a local resident, 2026-11-05. To confirm with LTFRB or the van terminal.', '2026-11-05', false, true)
ON CONFLICT (mode, lower(from_name), lower(to_name)) DO UPDATE SET
  fare_min = EXCLUDED.fare_min,
  fare_max = EXCLUDED.fare_max,
  fare_per = EXCLUDED.fare_per,
  minutes_min = EXCLUDED.minutes_min,
  minutes_max = EXCLUDED.minutes_max,
  schedule_note = EXCLUDED.schedule_note,
  source = EXCLUDED.source,
  checked_on = EXCLUDED.checked_on,
  is_active = true;

COMMIT;
