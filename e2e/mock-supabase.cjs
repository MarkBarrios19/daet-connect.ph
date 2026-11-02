const crypto = require("node:crypto");
/**
 * Mock Supabase (Auth + PostgREST subset) for the tours E2E suite.
 *
 * The role comes from the access token in each request ("e2e-<role>", set by
 * e2e/fixtures.ts), so one server serves every role. Filters: only `eq.` on
 * top-level columns and `count=exact`; enough for the pages under test.
 * Data is a fixed Daet scenario (one operator, one guide, one tourist).
 */
const http = require("http");
const PORT = Number(process.env.MOCK_SUPABASE_PORT || 54329);
// MOCK_COVERS=1 gives packages cover photos, as real tours have (layout audits).
const COVER = process.env.MOCK_COVERS === "1" ? "/photos/bagasbas-beach.jpg" : null;
const TODAY = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

const CONV_ID = "cc110000-0000-4000-8000-000000000001";

// Live tour tracking keeps state across requests (POST /__reset_live clears it).
const LIVE_BID = "e9466de5-4877-47c1-ac14-d86deeb38b9e";
const freshLive = () => ({ session: null, positions: [], consents: [], flares: [] });
let live = freshLive();

function build(role) {
const BID = "e9466de5-4877-47c1-ac14-d86deeb38b9e";
  const operator = { id: "op-1", profile_id: "9b7e5a5e-0000-4000-8000-000000000001", business_name: "Bagasbas Coast Tours", accreditation_status: "approved", accreditation_notes: null, contact_phone: "0917 555 0101", gcash_number: "0917 555 0101", gcash_name: "Maya Santos", bank_name: "BPI", bank_account_number: "1234-5678-90", bank_account_name: "Bagasbas Coast Tours", payment_instructions: "Please include your booking reference in the notes.", created_at: "2026-01-01T00:00:00Z" };
  const PKG = "aa000000-0000-4000-8000-000000000001";
  const pkg = { id: PKG, status: "published", description: "Learn to surf at sunrise.", tours_package_price_variants: [{ id: "v1", variant_name: "Standard", price_per_pax: 466, flat_price: null, min_pax: 1, max_pax: 8, is_default: true }], title: "Bagasbas Sunrise Surf Lesson", location_name: "Bagasbas Beach", duration_value: 3, duration_type: "hours", cover_image_url: COVER, operator_id: "op-1", tours_operators: operator };
  const booking = { id: BID, package_id: PKG, user_id: "9b7e5a5e-0000-4000-8000-000000000001", booking_reference: "BK-20261023-7F3K2Q", tour_date: TODAY, number_of_pax: 3, price_per_pax: 466, total_amount: 1398, total_paid: 500, payment_status: "partial", status: "confirmed", contact_name: "Juan Dela Cruz", contact_email: "juan@example.ph", contact_phone: "0918 222 3344", special_requests: null, assigned_guide_id: null, created_at: "2026-10-20T03:00:00Z", tours_packages: pkg };
  const payments = [
    { id: "pay-a", booking_id: BID, amount: 500, payment_method: "gcash", provider: "paymongo", provider_method: "gcash", reference_number: "BK-20261023-7F3K2Q", payment_date: "2026-10-21T02:15:00Z", created_at: new Date(Date.now() - 60_000).toISOString(), payment_status: "completed", notes: "PayMongo checkout cs_abc", tours_bookings: { booking_reference: "BK-20261023-7F3K2Q", contact_name: "Juan Dela Cruz", tours_packages: pkg } },
    { id: "pay-b", booking_id: "other", amount: 2400, payment_method: "cash", provider: "manual", provider_method: null, reference_number: null, payment_date: "2026-10-12T08:00:00Z", payment_status: "completed", notes: null, tours_bookings: { booking_reference: "BK-20261010-Q2W9E1", contact_name: "Ana Reyes", tours_packages: { title: "Heritage Walk: Daet Poblacion", operator_id: "op-1" } } },
    { id: "pay-c", booking_id: "other2", amount: 1650.5, payment_method: "credit_card", provider: "paymongo", provider_method: "card", reference_number: "BK-20261015-ZX81PL", payment_date: "2026-10-16T11:30:00Z", payment_status: "completed", notes: null, tours_bookings: { booking_reference: "BK-20261015-ZX81PL", contact_name: "Mark O'Neil", tours_packages: { title: "Calaguas Island Day Trip", operator_id: "op-1" } } },
  ];
  const proofs = [
    { id: "11111111-2222-4333-8444-555555555555", booking_id: BID, amount: 898, payment_method: "gcash", reference_number: "1009 234 5678", verification_status: "pending", rejection_reason: null, submitted_at: "2026-10-22T09:00:00Z", proof_image_url: `${BID}/x.png` },
    { id: "66666666-2222-4333-8444-555555555555", booking_id: BID, amount: 898, payment_method: "bank_transfer", reference_number: "BPI-77812", verification_status: "rejected", rejection_reason: "Amount not received in our BPI account yet.", submitted_at: "2026-10-21T09:00:00Z", proof_image_url: `${BID}/y.png` },
  ];
  const cancelled = { ...booking, id: "c9466de5-4877-47c1-ac14-d86deeb38b9f", booking_reference: "BK-20261018-LM44RT", status: "cancelled", total_paid: 500, payment_status: "partial", cancellation_reason: "Typhoon signal no. 2 raised for Camarines Norte." };
  const availability = [
    { id: "a1000000-0000-4000-8000-000000000001", package_id: PKG, available_date: "2026-11-07", capacity_total: 10, capacity_booked: 3 },
    { id: "a1000000-0000-4000-8000-000000000002", package_id: PKG, available_date: "2026-11-08", capacity_total: 10, capacity_booked: 0 },
    { id: "a1000000-0000-4000-8000-000000000003", package_id: PKG, available_date: "2026-11-14", capacity_total: 6, capacity_booked: 6 },
    { id: "a1000000-0000-4000-8000-000000000004", package_id: PKG, available_date: "2026-11-15", capacity_total: 6, capacity_booked: 2 },
  ];
  const cancellations = role === "operator" ? [{ id: "cc000000-0000-4000-8000-000000000001", booking_id: BID, reason: "My flight to Naga was moved to the next day.", requested_at: "2026-11-05T22:00:00Z", status: "requested", admin_notes: null }] : [];
  // The tourist's tour today has a guide, so "Find your guide" shows.
  if (role === "tourist") booking.assigned_guide_id = "f66b1fe2-a997-4c0b-be13-22d62cf0dba6";
  if (role === "guide") { booking.user_id = "other-tourist"; booking.assigned_guide_id = "f66b1fe2-a997-4c0b-be13-22d62cf0dba6"; booking.tours_checkins = []; }
  const guides = [{ id: "f66b1fe2-a997-4c0b-be13-22d62cf0dba6", profile_id: "9b7e5a5e-0000-4000-8000-000000000001", accreditation_status: "approved", reviewed_at: "2026-10-16T13:18:25Z", updated_at: "2026-10-16T13:18:25Z", created_at: "2026-10-01T00:00:00Z", accreditation_notes: null }];
  const participants = [
    { id: "p1000000-0000-4000-8000-000000000001", booking_id: BID, full_name: "Juan Dela Cruz", age: 34, special_requirements: null, created_at: "2026-10-20T03:00:00Z" },
    { id: "p1000000-0000-4000-8000-000000000002", booking_id: BID, full_name: "Ana Dela Cruz", age: 31, special_requirements: "Vegetarian lunch", created_at: "2026-10-20T03:00:01Z" },
    { id: "p1000000-0000-4000-8000-000000000003", booking_id: BID, full_name: "Leo Dela Cruz", age: 9, special_requirements: "Needs a child life vest", created_at: "2026-10-20T03:00:02Z" },
  ];
  const checkins = [{ booking_id: BID, participant_id: "p1000000-0000-4000-8000-000000000002", method: "manual", scanned_at: new Date().toISOString() }];
  const CONV = "cc110000-0000-4000-8000-000000000001";
  const OPP = "0b7e5a5e-0000-4000-8000-0000000000aa";
  const conversation = { id: CONV, booking_id: BID, tours_bookings: { ...booking, tours_guides: { profile_id: "9b7e5a5e-0000-4000-8000-0000000000bb" }, tours_packages: { title: pkg.title, tours_operators: { profile_id: OPP, business_name: "Bagasbas Coast Tours" } } } };
  const t0 = Date.now() - 3 * 3600 * 1000;
  const at = (m) => new Date(t0 + m * 60000).toISOString();
  const messages = [
    { id: "dd110000-0000-4000-8000-000000000001", conversation_id: CONV, sender_id: booking.user_id, message_text: "Hi! Is hotel pickup included? We're staying near Bagasbas Beach.", attachment_url: null, created_at: at(0) },
    { id: "dd110000-0000-4000-8000-000000000002", conversation_id: CONV, sender_id: OPP, message_text: "Hello Juan! Yes, pickup is free within Daet. We'll be at your hotel lobby at 5:30 AM.", attachment_url: null, created_at: at(12) },
    { id: "dd110000-0000-4000-8000-000000000003", conversation_id: CONV, sender_id: "9b7e5a5e-0000-4000-8000-0000000000bb", message_text: "Hi, I'm your guide for the surf lesson. Bring sunscreen and a change of clothes 🏄", attachment_url: null, created_at: at(40) },
    { id: "dd110000-0000-4000-8000-000000000004", conversation_id: CONV, sender_id: booking.user_id, message_text: "Perfect, thank you! See you tomorrow.", attachment_url: null, created_at: at(55) },
  ];
  const inbox = [
    { conversation_id: CONV, kind: "booking", title: pkg.title, subtitle: `${booking.booking_reference} · Nov 02 · Juan Dela Cruz`, booking_id: BID, last_message_at: at(55), last_message: "Perfect, thank you! See you tomorrow.", last_sender_id: booking.user_id, unread: 0 },
    { conversation_id: "cc110000-0000-4000-8000-000000000002", kind: "guide_tourist", title: "Maria Santos", subtitle: "Your guide · Calaguas Island Day Trip · BK-20261019-HH21KD · Nov 14", booking_id: BID, last_message_at: at(-600), last_message: "Meet at Vinzons port at 6 AM.", last_sender_id: OPP, unread: 2 },
    { conversation_id: "cc110000-0000-4000-8000-000000000003", kind: "operator_admin", title: "Daet Tourism Office", subtitle: "Tourism Office support", booking_id: null, last_message_at: at(-900), last_message: "Your permit renewal was received.", last_sender_id: OPP, unread: 0 },
  ];
  const header = { id: CONV, kind: "booking", is_member: true, booking_id: BID, booking_reference: booking.booking_reference, booking_status: booking.status, tour_date: booking.tour_date, package_title: pkg.title, tourist_id: booking.user_id, tourist_name: "Juan Dela Cruz", operator_id: "op-1", operator_profile_id: OPP, operator_name: "Bagasbas Coast Tours", guide_id: "f66b1fe2-a997-4c0b-be13-22d62cf0dba6", guide_profile_id: "9b7e5a5e-0000-4000-8000-0000000000bb", guide_name: "Maria Santos" };
  const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
  const notifications = [
    { id: "n1", profile_id: booking.user_id, type: "booking_confirmed", title: "Booking confirmed", body: "Bagasbas Sunrise Surf Lesson on Oct 24, 2026 is confirmed. Your ticket QR is ready.", link: `/tours/bookings/${BID}`, read_at: null, created_at: ago(3) },
    { id: "n2", profile_id: booking.user_id, type: "message", title: "New message · Bagasbas Sunrise Surf Lesson", body: "Hello Juan! Yes, pickup is free within Daet.", link: "/tours/messages/cc110000-0000-4000-8000-000000000001", read_at: null, created_at: ago(25) },
    { id: "n3", profile_id: booking.user_id, type: "guide_assigned", title: "Your guide is assigned", body: "A local guide will lead Bagasbas Sunrise Surf Lesson on Oct 24, 2026.", link: `/tours/bookings/${BID}`, read_at: ago(60), created_at: ago(90) },
    { id: "n4", profile_id: booking.user_id, type: "payment_received", title: "Payment received", body: "₱500.00 for Bagasbas Sunrise Surf Lesson (BK-20261023-7F3K2Q).", link: `/tours/bookings/${BID}`, read_at: ago(1000), created_at: ago(1500) },
  ];
  const office = {"mon":[["08:00","17:00"]],"tue":[["08:00","17:00"]],"wed":[["08:00","17:00"]],"thu":[["08:00","17:00"]],"fri":[["08:00","17:00"]]};
  const allDay = Object.fromEntries(["mon","tue","wed","thu","fri","sat","sun"].map((d) => [d, [["00:00","24:00"]]]));
  const A = (id, name, slug, category, municipality, lat, lng, hours, dwell, description, source, verified = false) => ({ id: `a0000000-0000-4000-8000-00000000000${id}`, name, slug, category, description, municipality, address: null, latitude: lat === null ? null : String(lat), longitude: lng === null ? null : String(lng), location_verified: verified, opening_hours: hours, hours_note: null, dwell_minutes: dwell, entrance_fee: null, photo_url: null, source, is_active: true });
  const attractions = [
    A(1, "First José Rizal Monument", "first-rizal-monument", "heritage", "Daet", 14.1131, 122.9545, null, 20, "The first monument built to honor José Rizal and the oldest surviving one in the country, unveiled on December 30, 1898.", "Wikipedia: First José Rizal Monument (Daet)"),
    A(2, "Daet Heritage Center and Museum", "daet-heritage-center", "heritage", "Daet", 14.113187, 122.954828, office, 45, "Museum in the old municipal hall facing the Rizal Monument.", "Trip.com Daet itinerary (Plus Code 4X73+7WG)"),
    A(3, "Bagasbas Beach", "bagasbas-beach", "beach", "Daet", 14.131583, 122.985083, null, 180, "One of the oldest and most popular surfing spots in the Philippines.", "WannaKiteSurf; PhilAtlas"),
    A(4, "Tinaga Island (Calaguas)", "tinaga-island-calaguas", "beach", "Vinzons", 14.4692, 122.945, null, 480, "One of the two main islands of the Calaguas group.", "PhilAtlas: Tinaga Island"),
    A(5, "Canimog Island", "canimog-island", "nature", "Mercedes", 14.1136, 123.0637, null, 180, "Island with a lighthouse reached by 107 stone steps.", "PhilAtlas: Canimog Island"),
    A(6, "Daet Elevated Town Plaza", "daet-elevated-town-plaza", "park", "Daet", null, null, allDay, 30, "Raised town plaza in central Daet.", "Trip.com Daet itinerary"),
  ];
  pkg.tours_package_stops = [
    { id: "s1", location_name: "First José Rizal Monument", description: "Meet at Rizal Park.", latitude: "14.113100", longitude: "122.954500", stop_order: 0 },
    { id: "s2", location_name: "Daet Heritage Center", description: null, latitude: "14.113187", longitude: "122.954828", stop_order: 1 },
    { id: "s3", location_name: "Bagasbas Beach", description: "Surf lesson.", latitude: "14.131583", longitude: "122.985083", stop_order: 2 },
  ];
  pkg.tours_package_inclusions = [];
  // Three photos, so the editor's gallery has something to reorder.
  pkg.tours_package_gallery = [
    { id: "g1", image_url: "/photos/bagasbas-beach.jpg", caption: "Surf at sunrise", display_order: 1 },
    { id: "g2", image_url: "/photos/calaguas-beach.jpg", caption: "Calaguas sandbar", display_order: 2 },
    { id: "g3", image_url: "/photos/apuao-sandbar.jpg", caption: "Apuao sandbar", display_order: 3 },
  ];
  pkg.tours_operators = [operator];
  booking.status = booking.status;
  const rv = (id, rating, comment, extra = {}) => ({ id, booking_id: "b-" + id, package_id: PKG, operator_id: "op-1", rating, comment, created_at: "2026-10-1" + (id.length % 9) + "T05:00:00Z", operator_reply: null, replied_at: null, is_hidden: false, hidden_reason: null, tours_packages: { title: pkg.title }, tours_operators: { business_name: "Bagasbas Coast Tours" }, tours_bookings: { booking_reference: "BK-2026101" + (id.length % 9) + "-AB12CD", tour_date: "2026-10-10" }, ...extra });
  const reviews = [
    rv("r1", 5, "Coach Mark was patient and I stood up on my third wave! Boards were in good shape and they had rash guards for all of us.", { operator_reply: "Salamat po! See you on the next swell.", replied_at: "2026-10-18T09:00:00Z" }),
    rv("r22", 4, "Great lesson, but start was 20 minutes late."),
    rv("r333", 5, null),
    rv("r4444", 1, "Spam text with a phone number 0999...", { is_hidden: role !== "anon", hidden_reason: "Advertising, not about the tour" }),
  ];
  
  const visible = reviews.filter((r) => !r.is_hidden);
  const ratingRow = { package_id: PKG, operator_id: "op-1", review_count: visible.length, average_rating: (visible.reduce((a, r) => a + r.rating, 0) / visible.length).toFixed(2) };
  booking.assigned_guide_id = "f66b1fe2-a997-4c0b-be13-22d62cf0dba6";
  const addDays = (n) => { const d = new Date(TODAY + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const later = { ...booking, id: "b-later", booking_reference: "BK-20261101-LT55AA", tour_date: addDays(5), status: "confirmed", payment_status: "unpaid", total_paid: 0, number_of_pax: 2, total_amount: 932, contact_name: "Ana Reyes" };
  const pendingB = { ...booking, id: "b-pend", booking_reference: "BK-20261102-PN11ZZ", tour_date: addDays(9), status: "pending", payment_status: "unpaid", total_paid: 0, number_of_pax: 4, total_amount: 1864, contact_name: "Mark O'Neil" };
  // Paid in full, so it has a ticket QR (tickets need full payment).
  const paidB = { ...booking, id: "a7d1c3e2-5b4f-4c6a-9e8d-1f2a3b4c5d6e", booking_reference: "BK-20261020-PD77KK", tour_date: addDays(14), status: "confirmed", payment_status: "paid", total_paid: 1398 };
  const doneB = { ...booking, id: "b-done", booking_reference: "BK-20261001-DN88QQ", tour_date: addDays(-12), status: "completed", payment_status: "paid", total_paid: 1398 };
  const guideAvailability = [
    { guide_id: guides[0].id, available_date: addDays(1), is_available: true },
    { guide_id: guides[0].id, available_date: addDays(2), is_available: true },
    { guide_id: guides[0].id, available_date: addDays(4), is_available: false },
  ];
  const itineraries = [{ id: "it-1", title: "Weekend in Daet", start_date: addDays(14), end_date: addDays(15), tours_itinerary_items: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }] }];
  const day = (n) => addDays(-n);
  const analytics = {
    from: day(29), to: TODAY,
    arrivals: [[1, 6], [2, 9], [3, 4], [5, 12], [6, 15], [8, 7], [9, 3], [12, 18], [13, 22], [15, 8], [19, 5], [20, 14], [22, 11], [26, 6], [27, 9]].map(([n, c]) => ({ day: day(n), checkins: c })),
    bookings: { total: 64, pending: 6, confirmed: 21, completed: 28, cancelled: 5, rejected: 4, pax: 182 },
    operators: [
      { id: "op-1", business_name: "Bagasbas Coast Tours", bookings: 31, revenue: 48250, refunded: 466 },
      { id: "op-2", business_name: "Calaguas Island Hoppers", bookings: 22, revenue: 39600, refunded: 0 },
      { id: "op-3", business_name: "Daet Heritage Walks", bookings: 7, revenue: 4200, refunded: 0 },
    ],
    top_packages: [
      { id: PKG, title: "Bagasbas Sunrise Surf Lesson", bookings: 24, pax: 61 },
      { id: "p2", title: "Calaguas Island Day Trip", bookings: 19, pax: 74 },
      { id: "p3", title: "Heritage Walk: Daet Poblacion", bookings: 7, pax: 18 },
    ],
    top_attractions: [
      { id: "a1", name: "Bagasbas Beach", slug: "bagasbas-beach", planned: 17 },
      { id: "a2", name: "First José Rizal Monument", slug: "first-jose-rizal-monument", planned: 11 },
      { id: "a3", name: "Daet Heritage Center", slug: "daet-heritage-center", planned: 6 },
    ],
    queue: [
      { kind: "guide", id: "g9", name: "Liza Marquez", waiting_days: 9 },
      { kind: "operator", id: "o9", name: "Mercedes Bangka Rides", waiting_days: 4 },
      { kind: "guide", id: "g8", name: "Paolo Abad", waiting_days: 1 },
    ],
    ratings: [{ stars: 5, count: 14 }, { stars: 4, count: 6 }, { stars: 3, count: 2 }, { stars: 2, count: 0 }, { stars: 1, count: 1 }],
  };
  const EVT = "e1000000-0000-4000-8000-000000000001";
  const bagasbasAttr = attractions.find((a) => a.slug === "bagasbas-beach");
  const events = [{ id: EVT, title: "Bagasbas Surf Weekend", description: "Two days of surf clinics and a beach clean-up.", category: "sports", venue: "Bagasbas Beach", organizer: "Daet Tourism Office", starts_at: "2026-11-06T16:00:00Z", ends_at: "2026-11-08T10:00:00Z", image_url: null, is_published: true, attraction_id: bagasbasAttr ? bagasbasAttr.id : null, source: "Tourism Office memo" }];
  const surf = { id: PKG, title: "Bagasbas Sunrise Surf Lesson", location_name: "Bagasbas Beach", cover_image_url: null, status: "published", tours_package_stops: [{ latitude: "14.131583", longitude: "122.985083" }] };
  const heritage = { id: "p-heritage", title: "Heritage Walk: Daet Poblacion", location_name: "Daet", cover_image_url: null, status: "published", tours_package_stops: [{ latitude: "14.1122", longitude: "122.9553" }] };
  const eventAvailability = [
    { available_date: "2026-11-07", capacity_total: 10, capacity_booked: 3, tours_packages: surf },
    { available_date: "2026-11-08", capacity_total: 10, capacity_booked: 0, tours_packages: surf },
    { available_date: "2026-11-07", capacity_total: 8, capacity_booked: 2, tours_packages: heritage },
  ];
  const merch = [
    { id: "m1", name: "Bagasbas Surf Club Shirt", description: "Cotton tee.", category: "tshirt", price: 450, seller_name: "Bagasbas Coast Tours", where_to_buy: "Bagasbas Beach kiosk", contact_info: "0917 555 0101", image_url: null, is_featured: false, is_active: true, review_status: "pending", review_notes: null, reviewed_at: null, submitted_by_operator_id: "op-1", tours_operators: { business_name: "Bagasbas Coast Tours" } },
    { id: "m2", name: "Pineapple Jam", description: null, category: "pasalubong", price: 120, seller_name: "Bagasbas Coast Tours", where_to_buy: null, contact_info: null, image_url: null, is_featured: false, is_active: true, review_status: "rejected", review_notes: "Please add a photo of the jar and its label.", reviewed_at: "2026-10-22T03:00:00Z", submitted_by_operator_id: "op-1", tours_operators: { business_name: "Bagasbas Coast Tours" } },
    { id: "m3", name: "I Love Daet Mug", description: null, category: "mug", price: 250, seller_name: "Daet Tourism Office", where_to_buy: "Municipal Hall", contact_info: null, image_url: null, is_featured: true, is_active: true, review_status: "approved", review_notes: null, reviewed_at: null, submitted_by_operator_id: null, tours_operators: null },
  ];
  // The local guide directory (a slice of supabase/seed/guide_directory.sql).
  const gp = (over) => ({ municipality: "Daet", address: null, latitude: null, longitude: null, price_min: null, price_max: null, price_unit: null, specialties: [], tags: [], opening_hours: null, phone: null, description: null, source: "seed", checked_on: "2026-10-29", verified: false, location_verified: false, is_active: true, ...over });
  const guidePlaces = [
    gp({ id: "gp1", kind: "eatery", name: "Bagasbas Beach eateries", slug: "bagasbas-beach-eateries", latitude: "14.131600", longitude: "122.985100", specialties: ["sinantolan", "Bicol express"], description: "A strip of restaurants and bars along the beach." }),
    gp({ id: "gp2", kind: "eatery", name: "Leo's Cuisine", slug: "leos-cuisine", address: "Bagasbas Boulevard, Bagasbas, Daet" }),
    gp({ id: "gp3", kind: "lodging", name: "Dolor Hotel", slug: "dolor-hotel", price_min: "650.00", price_unit: "night" }),
    gp({ id: "gp4", kind: "lodging", name: "Hotel Formosa", slug: "hotel-formosa", price_min: "2900.00", price_unit: "night" }),
  ];
  const fr = (over) => ({ board_place_id: null, fare_min: null, fare_max: null, fare_per: "person", minutes_min: null, minutes_max: null, schedule_note: null, source: "seed", checked_on: "2026-10-29", verified: false, is_active: true, ...over });
  const fares = [
    fr({ id: "fr1", mode: "bus", from_name: "Manila (PITX)", to_name: "Daet", fare_min: "801.00", fare_max: "801.00", minutes_min: 540, minutes_max: 720 }),
    fr({ id: "fr2", mode: "tricycle", from_name: "Daet town center", to_name: "Bagasbas", fare_min: "30.00", fare_max: "30.00", minutes_min: 10, minutes_max: 15, schedule_note: "Agree on the fare before you ride." }),
    fr({ id: "fr3", mode: "boat", from_name: "Paracale port", to_name: "Calaguas", fare_min: "3000.00", fare_max: "7000.00", fare_per: "boat", minutes_min: 120, minutes_max: 150 }),
  ];
  const user0 = "9b7e5a5e-0000-4000-8000-000000000001";
  const tables = {
    rewards_balances: [{ profile_id: user0, balance: 115, earned: 165 }],
    rewards_ledger: [
      { id: "l1", points: 30, source: "tours.checked_in", description: "Checked in with your guide", created_at: "2026-10-23T01:00:00Z" },
      { id: "l2", points: 5, source: "tours.itinerary_saved", description: "Saved a trip plan", created_at: "2026-10-21T01:00:00Z" },
      { id: "l3", points: -50, source: "tours.booking_paid_reversed", description: "Refunded: Calaguas Island Day Trip", created_at: "2026-10-18T01:00:00Z" },
      { id: "l4", points: 50, source: "tours.booking_paid", description: "Paid for Calaguas Island Day Trip", created_at: "2026-10-15T01:00:00Z" },
      { id: "l5", points: 20, source: "tours.tour_completed", description: "Completed Bagasbas Sunrise Surf Lesson", created_at: "2026-10-12T01:00:00Z" },
    ],
    tours_guide_availability: guideAvailability, tours_guide_ratings: [{ guide_id: guides[0].id, review_count: 9, average_rating: "4.78" }], tours_itineraries: itineraries,
    tours_reviews: reviews, tours_package_ratings: [ratingRow], tours_operator_ratings: [ratingRow],
    tours_attractions: attractions,
    tours_guide_places: guidePlaces,
    tours_fares: fares,
    tours_notifications: notifications,
    tours_conversations: [conversation], tours_messages: messages,
    // The operator loved their own pickup reply; the tourist can react too.
    tours_message_reactions: [{ message_id: "dd110000-0000-4000-8000-000000000002", profile_id: OPP, conversation_id: CONV, reaction: "love" }],
    tours_booking_participants: participants, tours_checkins: checkins,
    tours_package_stops: pkg.tours_package_stops,
    tours_live_sessions: live.session ? [live.session] : [],
    tours_live_positions: role === "tourist" ? live.positions.filter((p) => p.role === "guide" || p.profile_id === "tourist") : live.positions,
    tours_live_consents: live.consents,
    tours_live_flares: live.flares,
    tours_bookings: role === "operator" ? [booking, later, pendingB, cancelled] : [booking, later, pendingB, paidB, doneB], tours_packages: [pkg], tours_package_availability: availability, _event_availability: eventAvailability, tours_cancellations: cancellations, tours_payments: payments, tours_payment_proofs: proofs, tours_operators: [operator],
    tours_guides: guides, profiles: [{ id: "9b7e5a5e-0000-4000-8000-000000000001", role, full_name: "Juan Dela Cruz" }],
    tours_events: events, tours_merchandise: role === "operator" ? merch.filter((m) => m.submitted_by_operator_id) : merch,
    // R6: the operator sees one pending swap request from the guide on today's booking.
    tours_guide_swap_requests: role === "operator" ? [{ id: "5a000000-0000-4000-8000-000000000001", booking_id: BID, from_guide_id: guides[0].id, to_guide_id: null, reason: "My boat license renewal is on that day.", status: "pending", decision_note: null, created_at: "2026-10-28T08:00:00Z" }] : [],
  };
  return { tables, analytics, inbox, header, user };
  }
  const user = { id: "9b7e5a5e-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "juan@example.ph", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  
http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,HEAD,OPTIONS", "access-control-expose-headers": "content-range" };
  const send = (code, body, headers = {}) => { res.writeHead(code, { "content-type": "application/json", ...cors, ...headers }); res.end(JSON.stringify(body)); };
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  let body = ""; req.on("data", (chunk) => { body += chunk; }); req.on("end", () => {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const role = /^e2e-(tourist|operator|guide|admin)$/.test(token) ? token.slice(4) : "anon";
    const { tables, analytics, inbox, header, user } = build(role);
    if (url.pathname === "/auth/v1/user") return role === "anon" ? send(401, { message: "not signed in" }) : send(200, user);
    if (url.pathname === "/rest/v1/rpc/get_my_role") return send(200, role === "anon" ? null : role);
    if (url.pathname === "/rest/v1/rpc/tours_refundable_amount") return send(200, 500);
    if (url.pathname === "/rest/v1/rpc/tours_admin_analytics") return send(200, analytics);
    if (url.pathname === "/rest/v1/rpc/tours_chat_inbox") return send(200, inbox);
    if (url.pathname === "/rest/v1/rpc/tours_conversation_header") return send(200, header);
    if (/^\/rest\/v1\/rpc\/tours_open_[a-z_]+_conversation$/.test(url.pathname)) return send(200, CONV_ID);
    if (url.pathname === "/rest/v1/rpc/tours_mark_conversation_read") return send(200, null);
    // The operator read the chat after the tourist's last message: "Seen".
    if (url.pathname === "/rest/v1/rpc/tours_conversation_read_marks") return send(200, [{ profile_id: "0b7e5a5e-0000-4000-8000-0000000000aa", last_read_at: new Date().toISOString() }]);
    // A sent message comes back as saved, so optimistic sends and replies resolve.
    if (url.pathname === "/rest/v1/tours_messages" && req.method === "POST") {
      let row = {};
      try { const parsed = JSON.parse(body); row = Array.isArray(parsed) ? parsed[0] : parsed; } catch { row = {}; }
      const saved = { id: crypto.randomUUID(), created_at: new Date().toISOString(), attachment_url: null, reply_to_id: null, ...row };
      return (req.headers.accept || "").includes("vnd.pgrst.object") ? send(201, saved) : send(201, [saved]);
    }
    // R6: guides free on a date (one free, one booked), and the swap RPCs.
    if (url.pathname === "/rest/v1/rpc/tours_guides_free_on")
      return send(200, [
        { guide_id: "f66b1fe2-a997-4c0b-be13-22d62cf0dba6", full_name: "Jeremiah Sabihon", reason: null },
        { guide_id: "b2000000-0000-4000-8000-000000000002", full_name: "Liza Bautista", reason: null },
        { guide_id: "b2000000-0000-4000-8000-000000000003", full_name: "Paolo Reyes", reason: "already_booked" },
      ]);
    if (url.pathname === "/rest/v1/rpc/tours_request_guide_swap") return send(200, "5a000000-0000-4000-8000-000000000009");
    if (url.pathname === "/rest/v1/rpc/tours_decide_guide_swap" || url.pathname === "/rest/v1/rpc/tours_cancel_guide_swap") return send(200, null);
    if (url.pathname === "/rest/v1/rpc/tours_accreditation_counts") {
      // The home page's counts: anonymous cannot read the tables, only these numbers.
      return send(200, [
        {
          operators: tables.tours_operators.filter((o) => o.accreditation_status === "approved").length,
          guides: tables.tours_guides.filter((g) => g.accreditation_status === "approved").length,
        },
      ]);
    }
    if (url.pathname === "/rest/v1/rpc/tours_badge_lookup") return send(200, [{ status: "approved", full_name: "Jeremiah Sabihon", photo_url: null, approved_at: "2026-10-16T13:18:25Z" }]);
    if (url.pathname === "/__reset_live") { live = freshLive(); return send(200, { ok: true }); }
    if (url.pathname.startsWith("/rest/v1/rpc/tours_live_")) {
      let args = {};
      try { args = JSON.parse(body || "{}"); } catch { args = {}; }
      const now = Date.now();
      const iso = (ms) => new Date(ms).toISOString();
      const name = url.pathname.slice("/rest/v1/rpc/".length);
      const me = role === "guide" ? "guide" : "tourist";
      const isLive = live.session && !live.session.ended_at;
      if (name === "tours_live_window") return send(200, { opens: iso(now - 3600e3), closes: iso(now + 5 * 3600e3), trip_opens: iso(now - 25 * 3600e3) });
      if (name === "tours_live_start") {
        if (role !== "guide") return send(403, { code: "42501", message: "Only the guide assigned to this tour can start live sharing." });
        live.session = { booking_id: LIVE_BID, guide_id: "f66b1fe2-a997-4c0b-be13-22d62cf0dba6", started_at: iso(now), ended_at: null, stops_reached: 0 };
        return send(200, live.session);
      }
      if (name === "tours_live_reach_stop") { if (live.session) live.session.stops_reached = args.p_stops_reached; return send(200, live.session); }
      if (name === "tours_live_end") { if (live.session) live.session.ended_at = iso(now); live.positions = []; live.flares = []; return send(200, null); }
      if (name === "tours_live_set_consent") {
        live.consents = [{ booking_id: LIVE_BID, profile_id: "tourist", share_trip: Boolean(args.p_share_trip), share_tour: Boolean(args.p_share_tour), updated_at: iso(now) }];
        live.positions = live.positions.filter((p) => p.role === "guide" || (p.precision === "town" ? args.p_share_trip : args.p_share_tour));
        return send(200, live.consents[0]);
      }
      if (name === "tours_live_ping") {
        const consent = live.consents[0];
        let precision = "exact";
        let lat = args.p_lat, lng = args.p_lng, place = null;
        if (me === "guide" && !isLive) return send(200, { stored: false, reason: "not_live" });
        if (me === "tourist") {
          if (isLive && consent?.share_tour) precision = "exact";
          else if (!isLive && consent?.share_trip) { precision = "town"; lat = 13.921; lng = 122.1002; place = "Gumaca"; }
          else return send(200, { stored: false, reason: "no_consent" });
        }
        live.positions = live.positions.filter((p) => p.profile_id !== me);
        live.positions.push({ booking_id: LIVE_BID, profile_id: me, role: me, lat, lng, accuracy_m: precision === "town" ? null : args.p_accuracy_m ?? null, precision, place_name: place, updated_at: iso(now) });
        return send(200, { stored: true, reason: "ok", precision, place_name: place });
      }
      if (name === "tours_live_flare") {
        const flare = { id: crypto.randomUUID(), booking_id: LIVE_BID, profile_id: "tourist", lat: args.p_lat, lng: args.p_lng, accuracy_m: args.p_accuracy_m ?? null, created_at: iso(now), resolved_at: null, resolved_by: null };
        live.flares.unshift(flare);
        return send(200, flare);
      }
      if (name === "tours_live_resolve_flare") { live.flares = live.flares.filter((f) => f.id !== args.p_flare_id); return send(200, null); }
      return send(404, { message: "unknown live rpc" });
    }
    const table = url.pathname.replace("/rest/v1/", "");
    // Like PostgREST: guides and operators link to profiles twice (profile_id,
    // reviewed_by), so an embed that doesn't name its foreign key is refused.
    if ((table === "tours_guides" || table === "tours_operators") && /(^|[,(\s])profiles\s*\(/.test(url.searchParams.get("select") || "")) {
      return send(300, { code: "PGRST201", message: `Could not embed because more than one relationship was found for '${table}' and 'profiles'` });
    }
    // The event page asks for availability joined to packages.
    const wantsEventJoin = table === "tours_package_availability" && (url.searchParams.get("select") || "").includes("tours_packages");
    let rows = (wantsEventJoin ? tables._event_availability : tables[table]) || [];
    for (const [k, v] of url.searchParams) {
      if (v.startsWith("eq.") && !k.includes(".")) rows = rows.filter((r) => !(k in r) || String(r[k]) === v.slice(3));
      if (v.startsWith("in.(") && !k.includes(".")) {
        const list = v.slice(4, -1).split(",").map((x) => x.replace(/^"|"$/g, ""));
        rows = rows.filter((r) => !(k in r) || list.includes(String(r[k])));
      }
    }
    const prefer = req.headers.prefer || "";
    if (req.method === "HEAD" || prefer.includes("count=exact")) {
      const n = url.searchParams.get("read_at") === "is.null" ? rows.filter((r) => !r.read_at).length : rows.length;
      res.writeHead(200, { "content-type": "application/json", ...cors, "content-range": `0-${Math.max(n - 1, 0)}/${n}` });
      return res.end(req.method === "HEAD" ? undefined : JSON.stringify(rows));
    }
    const single = (req.headers.accept || "").includes("vnd.pgrst.object");
    if (single) return rows.length ? send(200, rows[0]) : send(406, { code: "PGRST116", message: "none" });
    send(200, rows);
  });
}).listen(PORT, () => console.log(`mock supabase on ${PORT}`));
