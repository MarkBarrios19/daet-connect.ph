-- Transport to and around Daet, checked 2026-11-05 (CONNECT-Daet).
--
-- Every row names where its numbers come from. Nothing here is verified by
-- the Tourism Office yet (verified = false): the assistant always says to
-- confirm fares with the operator. Airfares change daily, so plane rows give
-- the lowest fares seen on fare sites ("from") or no fare at all.
--
-- Rows already in the table with the same mode and places are updated, not
-- duplicated. The second part turns off (never deletes) rows that name no
-- real source or describe a route that no longer runs; re-enable any of them
-- from /tours/admin/fares once it has been confirmed.
--
-- Run in the Supabase SQL editor, or: psql "$DATABASE_URL" -f this file.

BEGIN;

INSERT INTO public.tours_fares
  (mode, from_name, to_name, fare_min, fare_max, fare_per, minutes_min, minutes_max, schedule_note, source, checked_on, verified, is_active)
VALUES
  -- Manila by bus --------------------------------------------------------
  ('bus', 'Manila (Cubao)', 'Daet', 980, 1084, 'person', 390, 600,
   'DLTB from Cubao to the Daet Integrated Terminal (Lag-on). Listed departures 6:00 AM, 8:00 PM and 8:30 PM. The listing says 6 h 30 min; with stops and traffic expect 8–9 h.',
   'pamasahe.com, DLTB Cubao–Camarines Norte route page (2026 listing); phbus.com PITX–Daet (8–9 h). Seen via web search 2026-11-05.', '2026-11-05', false, true),
  ('bus', 'Manila (PITX)', 'Daet', 752, 950, 'person', 480, 540,
   'DLTB, Superlines and Philtranco leave from PITX. Listed fares: Philtranco aircon ₱752, DLTB ₱769–₱804, Superlines aircon ₱840–₱950. About 8–9 h; overnight trips are common.',
   'phbus.com and ph.commutetour.com PITX–Daet listings; bustickets.ph DLTB Manila–Bicol schedule. Seen via web search 2026-11-05.', '2026-11-05', false, true),
  ('bus', 'Manila (Cubao)', 'Naga', 1000, 1380, 'person', 480, 600,
   'Peñafrancia, Isarog and DLTB from Cubao. DLTB 2026 listing ₱1,112 regular, ₱1,230 Seater 41; Peñafrancia 2025 listing ₱1,000–₱1,380. Sleeper and premium seats cost more.',
   'pamasahe.com, DLTB and Peñafrancia Manila–Naga route pages (2025–2026 listings). Seen via web search 2026-11-05.', '2026-11-05', false, true),

  -- Getting across Manila from the airport --------------------------------
  ('bus', 'Manila (NAIA)', 'Manila (PITX)', 150, 150, 'person', NULL, NULL,
   'UBE Express point-to-point bus from the NAIA terminals to PITX, where the Bicol buses leave. Cash or Beep card.',
   'philippinebeaches.org, How to Get from NAIA to PITX (schedules as of February 2026).', '2026-11-05', false, true),
  ('bus', 'Manila (NAIA)', 'Manila (Cubao)', 200, 200, 'person', NULL, NULL,
   'UBE Express point-to-point bus from NAIA Terminal 3 to Araneta City, Cubao (2024 fare; may be higher now).',
   'UP Diliman SEASIA 2024 visitor guide, How to get to Diliman (June 2024).', '2026-11-05', false, true),

  -- Naga: the nearest airport with scheduled flights -----------------------
  ('plane', 'Manila (NAIA)', 'Naga Airport (Pili)', 1347, 3922, 'person', 80, 80,
   'Cebgo flies nonstop, about 1 h 20 min. Fares change daily. The airport is in Pili, about 15 minutes from Naga city center; vans to Daet leave from the city.',
   'Trip.com Manila–Naga fare pages (2025–2026 snapshots, ₱1,347–₱3,922 one way); Naga City Tourism, Getting Here (tourism.naga.gov.ph).', '2026-11-05', false, true),
  ('van', 'Naga', 'Daet', 120, 140, 'person', 120, 120,
   'UV Express from the Naga Westbound Van Terminal (Felix Plazo St., Sabang, near LCC Mall) to the Daet Central Terminal. Fares are distance-based.',
   'Wikivoyage Naga (₱140) and Daet (₱120, about 2 h), February 2025 editions.', '2026-11-05', false, true),

  -- Visayas and Mindanao: fly to Manila, then the bus ---------------------
  ('plane', 'Cebu (Mactan)', 'Manila (NAIA)', 1088, 1377, 'person', 80, 95,
   'Cebu Pacific, Philippines AirAsia, Sunlight Air and PAL fly nonstop, about 1 h 20 min to 1 h 35 min. Lowest one-way fares seen: Sunlight Air ₱1,088, AirAsia ₱1,208, Cebu Pacific ₱1,377; many dates cost more.',
   'cheapflights.com.ph Cebu–Manila (data from April 2026); flight times from airline schedule listings. Seen 2026-11-05.', '2026-11-05', false, true),
  ('plane', 'Davao', 'Manila (NAIA)', 3145, NULL, 'person', 105, 125,
   'Cebu Pacific and PAL fly nonstop, about 1 h 45 min to 2 h 05 min. Lowest one-way fare seen ₱3,145; prices change daily.',
   'cheapflights.com.ph Davao–Manila (updated April 27, 2026); schedule listings for flight times. Seen 2026-11-05.', '2026-11-05', false, true),
  ('plane', 'Cagayan de Oro', 'Manila (NAIA)', NULL, NULL, 'person', 100, 100,
   'Nonstop from Laguindingan, about 1 h 40 min. Check the airline for the fare on your date.',
   'lastminute.com Cagayan de Oro–Manila route page. Seen 2026-11-05.', '2026-11-05', false, true),
  ('plane', 'General Santos', 'Manila (NAIA)', NULL, NULL, 'person', 124, 124,
   'Nonstop, about 2 h 05 min. Check the airline for the fare on your date.',
   'Trip.com General Santos–Manila route page. Seen 2026-11-05.', '2026-11-05', false, true),
  ('plane', 'Zamboanga', 'Manila (NAIA)', NULL, NULL, 'person', 90, 115,
   'Nonstop, about 1 h 30 min to 1 h 55 min. Check the airline for the fare on your date.',
   'airportroutes.com and cleartrip Zamboanga–Manila schedule listings. Seen 2026-11-05.', '2026-11-05', false, true),
  ('plane', 'Bacolod', 'Manila (NAIA)', NULL, NULL, 'person', 70, 90,
   'Nonstop from Bacolod–Silay, about 1 h 10 min to 1 h 30 min. Check the airline for the fare on your date.',
   'cleartrip and airportoverview.com Bacolod–Manila schedule listings. Seen 2026-11-05.', '2026-11-05', false, true),
  ('plane', 'Iloilo', 'Manila (NAIA)', NULL, NULL, 'person', NULL, NULL,
   'Nonstop flights run daily. Check the airline for times and the fare on your date.',
   'Trip.com Iloilo–Manila route page. Seen 2026-11-05.', '2026-11-05', false, true),
  ('plane', 'Tacloban', 'Manila (NAIA)', NULL, NULL, 'person', NULL, NULL,
   'Nonstop flights run daily. Check the airline for times and the fare on your date. By land, buses cross from Allen (Samar) to Matnog (Sorsogon) by ferry.',
   'Trip.com Tacloban route page. Seen 2026-11-05.', '2026-11-05', false, true),

  -- Samar to Luzon by sea --------------------------------------------------
  ('boat', 'Allen (Samar)', 'Matnog', 120, 264, 'person', 90, 120,
   'Roll-on/roll-off ferries about every 2 h: Santa Clara and Peñafrancia ₱120, Montenegro ₱264 regular. FastCat to Dapdap (Allen) ₱190–₱410, about 1 h. From Matnog, continue by bus through Sorsogon and Legazpi to Naga.',
   'pamasahe.com Allen–Matnog operator pages (2025 listings); rome2rio Matnog–Dapdap. Seen via web search 2026-11-05.', '2026-11-05', false, true),

  -- Around Daet ------------------------------------------------------------
  ('jeepney', 'Daet', 'Mercedes', NULL, NULL, 'person', NULL, NULL,
   'Jeepneys and vans leave the Daet Central Terminal for Mercedes. Regular jeepney fare since 19 March 2026: ₱14 for the first 4 km, then ₱2.00 a km. Ask the driver.',
   'LTFRB fare order effective 2026-03-19 (Manila Bulletin, Top Gear PH); Inquirer, Getting There: Camarines Norte (public transport leaves Daet Central Terminal).', '2026-11-05', false, true),
  ('jeepney', 'Daet', 'Vinzons', NULL, NULL, 'person', NULL, NULL,
   'Jeepneys and vans leave the Daet Central Terminal for Vinzons. Regular jeepney fare since 19 March 2026: ₱14 for the first 4 km, then ₱2.00 a km. Ask the driver.',
   'LTFRB fare order effective 2026-03-19 (Manila Bulletin, Top Gear PH); Inquirer, Getting There: Camarines Norte.', '2026-11-05', false, true),
  ('van', 'Daet', 'Paracale', NULL, NULL, 'person', NULL, NULL,
   'Vans and jeepneys leave the Daet Central Terminal for Paracale, for the Calaguas boats. Ask at the terminal for the fare.',
   'Inquirer, Getting There: Camarines Norte (public transport leaves Daet Central Terminal for every town).', '2026-11-05', false, true),

  -- Boats to the islands ---------------------------------------------------
  ('boat', 'Paracale port', 'Calaguas', 2500, 6500, 'boat', 120, 150,
   'Round-trip boat hire: small boats take 4–6 people, large ones about 20. Every visitor pays a ₱20 environmental fee at Mahabang Buhangin; campsite entry ₱100–₱150. Trips leave early and are cancelled in rough seas.',
   'lakbaypinas.com Calaguas Island Guide 2026; thewanderingjuan.net, How to Go to Calaguas (2020).', '2026-11-05', false, true),
  ('boat', 'Vinzons', 'Calaguas', 2500, 3000, 'boat', 90, 120,
   'Small boat for 4–5 people from Vinzons (Pinagtigasan port). Joiner tours from Vinzons run about ₱2,499–₱2,799 per person.',
   'thewanderingjuan.net, How to Go to Calaguas (2020); lakbaypinas.com Calaguas Island Guide 2026.', '2026-11-05', false, true),
  ('boat', 'Mercedes port', 'Apuao Grande', 2000, 3500, 'boat', 30, 45,
   'Day island-hopping boat hire, by boat size, number of people and islands; overnight hire for camping about ₱4,000. Arrange it with the Mercedes tourism office or an accredited operator.',
   'philippinebeaches.org, Apuao Grande Island travel tips (about 2018); Naga City Deck, Travel to Mercedes (2015, updated 2016).', '2026-11-05', false, true),
  ('boat', 'Mercedes port', 'Canimog Island', 2000, 3500, 'boat', NULL, NULL,
   'Part of the Mercedes island-hopping day trip; the same boat hire covers several islands.',
   'philippinebeaches.org, Canimog Island travel tips (about 2018).', '2026-11-05', false, true)
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

-- Rows with no real source ("Common practice", "Airlines websites"...), routes
-- that duplicate the cited rows above under another name, routes that don't
-- reach Daet, and flights that no longer run (Cebu–Naga ended July 2024 per
-- flightsfrom.com; no Davao–Naga or Tacloban–Naga service is listed).
UPDATE public.tours_fares SET is_active = false
WHERE source IN (
    'Airline websites', 'Airlines websites', 'Bus operators', 'Bus operators inquiry',
    'Common practice', 'Local knowledge', 'Local transport', 'Local transport observation',
    'Taxi operators', 'Tour operators', 'Van operators', 'Van terminal', 'Van terminal operators'
  )
  -- The same DLTB Cubao trip as the cited 'Manila (Cubao)' → 'Daet' row, at an older fare.
  OR (mode = 'bus' AND from_name = 'Manila (Cubao Terminal)' AND to_name = 'Daet Integrated Terminal');

COMMIT;
