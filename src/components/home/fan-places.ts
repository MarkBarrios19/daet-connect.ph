import { PHOTOS } from "@/lib/photo-credits";

/**
 * The six places in the hero fan, left to right.
 *
 * Every photo comes through PHOTOS, so replacing one later is a one-line change
 * here. Descriptions are the owner's copy, verbatim: the first four are the
 * PANELS text from the old hero, the last two come from the tours_attractions
 * rows for those places. Don't rewrite them.
 */
export type FanPlace = {
  /** Also the URL hash: #place-bagasbas-beach */
  slug: string;
  name: string;
  /** Short form for the phone tags. */
  shortName: string;
  photo: { src: string; alt: string };
  text: string;
  tag?: "Beach" | "Heritage site" | "Museum" | "Church";
  /**
   * The line the open view's "Fun fact" card carries. Empty for now: no place
   * has one written, and the card says so rather than inventing a fact.
   */
  funFact?: string;
  /** The place page. */
  href: string;
  /** The browsable trips near this place; /tours/browse filters on `location`. */
  toursHref: string;
};

export const FAN_PLACES: FanPlace[] = [
  {
    slug: "tinaga-island-calaguas",
    name: "Calaguas",
    shortName: "Calaguas",
    photo: { src: PHOTOS.calaguasHillside.src, alt: PHOTOS.calaguasHillside.alt },
    text: "A long white-sand beach on Tinaga Island, with no roads and no hotels. Two to three hours by boat from Paracale or Vinzons.",
    tag: "Beach",
    href: "/tours/attractions/tinaga-island-calaguas",
    toursHref: "/tours/browse?location=Calaguas",
  },
  {
    slug: "apuao-grande-island",
    name: "Apuao sandbar",
    shortName: "Apuao",
    photo: { src: PHOTOS.apuao.src, alt: PHOTOS.apuao.alt },
    text: "Apuao's sandbar rises out of the sea at low tide, about an hour by boat from Mercedes port.",
    tag: "Beach",
    href: "/tours/attractions/apuao-grande-island",
    toursHref: "/tours/browse?location=Mercedes",
  },
  {
    slug: "bagasbas-beach",
    name: "Bagasbas Beach",
    shortName: "Bagasbas",
    photo: { src: PHOTOS.bagasbas.src, alt: PHOTOS.bagasbas.alt },
    text: "Daet's wide, flat surf beach, ten minutes from the plaza by tricycle. Come for the sunrise waves.",
    tag: "Beach",
    href: "/tours/attractions/bagasbas-beach",
    toursHref: "/tours/browse?location=Bagasbas",
  },
  {
    slug: "first-rizal-monument",
    name: "First Rizal Monument",
    shortName: "Rizal",
    photo: { src: PHOTOS.rizalMonumentPark.src, alt: PHOTOS.rizalMonumentPark.alt },
    text: "The first monument to José Rizal, raised in Daet in 1898. Start a walk of the old town here.",
    tag: "Heritage site",
    href: "/tours/attractions/first-rizal-monument",
    toursHref: "/tours/browse?location=Daet",
  },
  {
    slug: "daet-heritage-center",
    name: "Daet Heritage Center",
    shortName: "Heritage",
    photo: { src: PHOTOS.daetHeritageCenter.src, alt: PHOTOS.daetHeritageCenter.alt },
    text: "A museum in the old municipal hall facing the Rizal Monument, with displays and relics on the history of Daet.",
    tag: "Museum",
    href: "/tours/attractions/daet-heritage-center",
    toursHref: "/tours/browse?location=Daet",
  },
  {
    slug: "cathedral-most-holy-trinity",
    name: "Cathedral of the Most Holy Trinity",
    shortName: "Cathedral",
    photo: { src: PHOTOS.cathedralHolyTrinity.src, alt: PHOTOS.cathedralHolyTrinity.alt },
    text: "The cathedral church of Daet.",
    tag: "Church",
    href: "/tours/attractions/cathedral-most-holy-trinity",
    toursHref: "/tours/browse?location=Daet",
  },
];
