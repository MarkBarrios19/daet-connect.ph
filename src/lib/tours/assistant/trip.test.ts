import { cityOf, faresBetween } from "@/lib/tours/guide/fares";
import { detectTripLang, readTripQuestion, tripAnswer } from "@/lib/tours/assistant/trip";
import { LIVE_FARES } from "@/lib/tours/assistant/__fixtures__/live-fares-2026-11-05";
import { fakeSupabase } from "@/lib/tours/assistant/__fixtures__/fake-supabase";
import { basicReply } from "@/lib/tours/assistant/basic";

const peso = (n: number) => `₱${Math.round(n).toLocaleString("en-PH")}`;
const ask = (q: string) => {
  const question = readTripQuestion(q);
  if (!question) throw new Error(`not read as a trip question: ${q}`);
  return tripAnswer(faresBetween(LIVE_FARES, question.from, question.to), question, detectTripLang(q), peso);
};
const modes = (from: string, to: string) => faresBetween(LIVE_FARES, from, to).map((r) => r.legs.map((l) => `${l.mode}:${l.from_name}>${l.to_name}`).join(" | "));

describe("reading a trip question", () => {
  it.each([
    ["Magkano pamasahe from Manila to Daet?", { from: "Manila", to: "Daet", asks: "fare" }],
    ["Paano pumunta Daet from Cebu?", { from: "Cebu", to: "Daet", asks: "route" }],
    ["Paano pumunta sa Bagasbas galing Daet", { from: "Daet", to: "Bagasbas", asks: "route" }],
    ["How long from Tacloban to Daet", { from: "Tacloban", to: "Daet", asks: "time" }],
    ["How do I get to Daet from Davao and how much?", { from: "Davao", to: "Daet", asks: "fare" }],
    ["Pira an pamasahe hali sa Naga pasiring sa Daet?", { from: "Naga", to: "Daet", asks: "fare" }],
    ["Gurano kahaloy an biyahe hali sa Manila?", { from: "Manila", to: "Daet", asks: "time" }],
    ["how much is the boat from Mercedes to Apuao island", { from: "Mercedes", to: "Apuao Island", asks: "fare" }],
  ])("%s", (q, expected) => {
    expect(readTripQuestion(q)).toEqual(expected);
  });

  it("leaves tour prices and other questions alone", () => {
    expect(readTripQuestion("Magkano ang Calaguas tour?")).toBeNull();
    expect(readTripQuestion("How much is the surfing lesson?")).toBeNull();
    expect(readTripQuestion("Where to eat near Bagasbas?")).toBeNull();
  });
});

describe("answering in the traveller's language", () => {
  it.each([
    ["How much is the bus from Manila to Daet?", "en"],
    ["Magkano pamasahe from Manila to Daet?", "taglish"],
    ["Magkano po ang pamasahe galing Maynila papuntang Daet?", "tl"],
    ["Pira an pamasahe hali sa Naga pasiring sa Daet?", "bcl"],
  ])("%s → %s", (q, lang) => {
    expect(detectTripLang(q)).toBe(lang);
  });

  it("always says the fares are estimates to confirm, in each language", () => {
    expect(ask("How much is the bus from Manila to Daet?")).toMatch(/estimates from public fare listings checked 2026-11-05, not quotes.*confirm/);
    expect(ask("Magkano po ang pamasahe galing Manila papuntang Daet?")).toMatch(/Tantiya lang.*kumpirmahin muna/);
    expect(ask("Magkano pamasahe from Manila to Daet?")).toMatch(/Estimate lang.*pa-confirm/);
    expect(ask("Pira an pamasahe hali sa Naga pasiring sa Daet?")).toMatch(/Tantiya sana.*ihapot tabi/);
  });
});

describe("routes on the live fare table", () => {
  it("offers the plane-and-van, Cubao bus and PITX bus from Manila", () => {
    expect(modes("Manila", "Daet")).toEqual([
      "plane:Manila (NAIA)>Naga Airport (Pili) | van:Naga>Daet",
      "bus:Manila (Cubao)>Daet",
      "bus:Manila (PITX)>Daet",
    ]);
    const answer = ask("Magkano pamasahe from Manila to Daet?");
    expect(answer).toContain("Bus Manila (PITX) → Daet (₱752–₱950 per person, 8–9 h)");
    expect(answer).toContain("Total: ₱1,467–₱4,062 per person. Travel time: 3 h 20 min");
  });

  it("gets from Cebu through Manila, with a total and an honest travel time", () => {
    const routes = faresBetween(LIVE_FARES, "Cebu", "Daet");
    expect(routes[0].legs.map((l) => l.to_name)).toEqual(["Manila (NAIA)", "Naga Airport (Pili)", "Daet"]);
    expect([routes[0].perPersonMin, routes[0].perPersonMax]).toEqual([2555, 5439]);
    // The NAIA → Cubao bus has no listed time, so that route's time is a floor.
    const byBus = routes.find((r) => r.legs.some((l) => l.to_name === "Manila (Cubao)"))!;
    expect(byBus.timeComplete).toBe(false);
    expect(ask("Paano pumunta Daet from Cebu?")).toContain("hindi bababa sa 7 oras 50 minuto");
  });

  it("never doubles back through a city it has left", () => {
    for (const [from, to] of [["Naga", "Daet"], ["Cebu", "Daet"], ["Davao", "Bagasbas"], ["Manila", "Calaguas"]]) {
      for (const route of faresBetween(LIVE_FARES, from, to)) {
        // A change of terminal inside one city (NAIA → Cubao) is fine; coming back to a city after leaving it is not.
        const cities = [from, ...route.legs.map((l) => l.to_name)].map(cityOf).filter((c, i, all) => c !== all[i - 1]);
        expect(new Set(cities).size).toBe(cities.length);
      }
    }
    expect(modes("Naga", "Daet")).toEqual(["van:Naga>Daet"]);
  });

  it("says 'from' for a lowest airfare, and lists a missing fare as ask locally", () => {
    expect(ask("How do I get to Daet from Davao and how much?")).toContain("Total: from ₱4,612 per person");
    expect(ask("How long from Tacloban to Daet")).toContain("Flight Tacloban → Manila (NAIA) (fare not listed, ask at the terminal)");
  });

  it("covers local trips: Daet to Bagasbas, Mercedes to Apuao, and on to Calaguas", () => {
    expect(ask("Paano pumunta sa Bagasbas galing Daet")).toContain("Tricycle Daet town center → Bagasbas (₱30 bawat tao");
    expect(ask("how much is the boat from Mercedes to Apuao island")).toContain("Boat Mercedes port → Apuao Grande (₱2,000–₱3,500 per boat, 30 min–45 min)");
    const calaguas = ask("How do I get to Calaguas from Daet?");
    expect(calaguas).toMatch(/Van \(UV Express\) Daet → Paracale \(fare not listed, ask at the terminal\) → Boat Paracale port → Calaguas \(₱2,500–₱6,500 per boat/);
    expect(calaguas).toContain("₱2,500–₱6,500 per boat plus, shared by your group");
  });

  it("is honest when nothing is listed", () => {
    expect(ask("How much is the fare from Baguio to Daet?")).toMatch(/^I don't have fares from Baguio to Daet yet/);
  });
});

describe("basic mode end to end, on the live fare rows", () => {
  // The two questions that used to get tour packages instead of fares.
  const ctx = () => ({
    supabase: fakeSupabase({ tours_fares: LIVE_FARES, tours_packages: [], tours_guide_places: [] }),
    userId: null,
    today: "2026-11-05",
    cards: [] as Array<{ type: string }>,
  });

  it("answers 'Magkano pamasahe from Manila to Daet?' with fares, not tours", async () => {
    const c = ctx();
    const reply = await basicReply("Magkano pamasahe from Manila to Daet?", c as never);
    expect(reply).toMatch(/^From Manila papunta sa Daet, ito ang 3 options:/);
    expect(reply).toContain("Bus Manila (PITX) → Daet (₱752.00–₱950.00 per person, 8–9 h)");
    expect(reply).toMatch(/pa-confirm muna/);
    expect(c.cards.map((card) => card.type)).toEqual(["transport", "link"]);
  });

  it("answers 'Paano pumunta Daet from Cebu?' with a route through Manila", async () => {
    const reply = await basicReply("Paano pumunta Daet from Cebu?", ctx() as never);
    expect(reply).toMatch(/^Mula Cebu papunta sa Daet/);
    expect(reply).toContain("Eroplano Cebu (Mactan) → Manila (NAIA) (₱1,088.00–₱1,377.00 bawat tao");
    expect(reply).toContain("Kabuuan: ₱2,555.00–₱5,439.00 bawat tao");
  });

  it("leaves 'how long' between two nearby towns to the road-time answer", async () => {
    const reply = await basicReply("How long from Daet to Bagasbas?", ctx() as never);
    expect(reply).not.toMatch(/here is the way I know|estimates from public fare listings/);
  });
});
