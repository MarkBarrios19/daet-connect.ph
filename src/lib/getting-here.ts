/**
 * "Getting to Daet", in one place, so the Tourism Office can correct it without
 * hunting through a component.
 *
 * Researched on 2026-11-01 from the sources below. No fares and no exact
 * departure times are stated as fact — schedules change and the point of the
 * closing line is that they must be checked.
 */
import type { IconName } from "@/components/ui/icons";

export type TravelBy = { title: string; text: string; icon: IconName };

export const GETTING_HERE: TravelBy[] = [
  {
    icon: "bus",
    title: "By bus",
    text: "Direct buses run from Metro Manila, from Cubao and from PITX, to the Daet Integrated Terminal in Lag-on. Plan on about 7 to 10 hours, depending on traffic. Changing buses at Lucena is often cheaper.",
  },
  {
    icon: "plane",
    title: "By plane",
    text: "There are no scheduled flights to Daet. Fly from Manila to Naga Airport in Pili, Camarines Sur, then take a van or bus to Daet, about 2 to 3 hours more.",
  },
  {
    icon: "van",
    title: "By van",
    text: "Vans leave Naga's westbound van terminal for Daet Central Terminal through the day, roughly 5 AM to 5 PM. The ride takes about 2 hours.",
  },
];

export const GETTING_HERE_CHECK = "Check schedules and fares with the bus company or terminal before you travel.";

export const GETTING_HERE_RESEARCHED = "Researched 1 November 2026";

export const GETTING_HERE_SOURCES: Array<{ label: string; href: string }> = [
  {
    label: "Pamasahe: DLTB Manila–Camarines Norte",
    href: "https://pamasahe.com/routes/manila-camarines-norte-dltb-co-schedule-fares",
  },
  { label: "Rome2rio: Cubao–Daet", href: "https://www.rome2rio.com/s/Cubao/Daet" },
  { label: "Rome2rio: Manila–Daet", href: "https://www.rome2rio.com/s/Manila/Daet" },
  { label: "Wikipedia: Bagasbas Airport", href: "https://en.wikipedia.org/wiki/Bagasbas_Airport" },
  {
    label: "Wikipedia: Philippine Airlines destinations",
    href: "https://en.wikipedia.org/wiki/List_of_Philippine_Airlines_destinations",
  },
  { label: "FlightConnections: flights from Naga (WNP)", href: "https://www.flightconnections.com/flights-from-naga-camarines-sur-wnp" },
  { label: "Wikivoyage: Daet (2025 snapshot)", href: "https://kwx.liehendr.com/content/wikivoyage_en_all_maxi_2025-02/A/Daet" },
];
