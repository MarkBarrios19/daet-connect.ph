/**
 * Photographs of Daet's places, all from Wikimedia Commons under licences that
 * allow reuse with credit. Pages that show a photo list its credit in one line.
 * The files live in public/photos. Operators' own package photos replace these
 * on cards; a found photo is never presented as an operator's own product.
 */
export type PhotoCredit = {
  src: string;
  alt: string;
  title: string;
  creator: string;
  licence: string;
  licenceUrl: string;
  sourceUrl: string;
};

const BY_SA_4 = "https://creativecommons.org/licenses/by-sa/4.0/";
const BY_SA_3 = "https://creativecommons.org/licenses/by-sa/3.0/";
const BY_3 = "https://creativecommons.org/licenses/by/3.0/";

export const PHOTOS = {
  bagasbas: {
    src: "/photos/bagasbas-beach.jpg",
    alt: "The wide, flat sand of Bagasbas Beach at low tide, with outrigger boats and red and white flags on the left",
    title: "Bagasbas Seashore",
    creator: "FroyAgta",
    licence: "CC BY-SA 4.0",
    licenceUrl: BY_SA_4,
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Bagasbas_Seashore.jpg",
  },
  calaguasBeach: {
    src: "/photos/calaguas-beach.jpg",
    alt: "A long white-sand beach on Calaguas with a boat anchored in turquoise water",
    title: "Calaguas Island, Camarines Norte",
    creator: "Monette Nyem",
    licence: "CC BY 3.0",
    licenceUrl: BY_3,
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Calaguas_Island,_Camarines_Norte,_Philippines_-_panoramio.jpg",
  },
  calaguasCove: {
    src: "/photos/calaguas-cove.jpg",
    alt: "A turquoise cove on Calaguas seen from the grassy hillside, with boats on the water",
    title: "Calaguas Island 004",
    creator: "Marife.altabano",
    licence: "CC BY-SA 4.0",
    licenceUrl: BY_SA_4,
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Calaguas_Island_004.jpg",
  },
  apuao: {
    src: "/photos/apuao-sandbar.jpg",
    alt: "A pale sandbar curving into clear shallow water, with a pine-covered island beyond",
    title: "Apuao Island, Mercedes",
    creator: "Monette Nyem",
    licence: "CC BY 3.0",
    licenceUrl: BY_3,
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Apuao_Island,_Mercedes,_Camarines_Norte,_Philippines_-_panoramio_(1).jpg",
  },
  mercedesPort: {
    src: "/photos/mercedes-port.jpg",
    alt: "Outrigger boats moored at the Mercedes port under a cloudy sky",
    title: "Sa pantalan kan Mercedes",
    creator: "Ringer",
    licence: "CC BY-SA 3.0",
    licenceUrl: BY_SA_3,
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Sa_pantalan_kan_Mercedes029.jpg",
  },
  rizal: {
    src: "/photos/rizal-monument.jpg",
    alt: "The white Rizal monument in Daet, a pylon topped with a star, with a sign reading oldest Rizal monument",
    title: "Jose Rizal's First Monument, Daet",
    creator: "Ralff Nestor Nacor",
    licence: "CC BY-SA 4.0",
    licenceUrl: BY_SA_4,
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Jose_Rizal%27s_First_Monument,_Daet,_Cam_Norte,_May_2024.jpg",
  },
  vinzons: {
    src: "/photos/vinzons-avenue.jpg",
    alt: "Vinzons Avenue in the centre of Daet on a bright day, with festival banners strung across the street",
    title: "Vinzons Avenue, Daet",
    creator: "Ralff Nestor Nacor",
    licence: "CC BY-SA 4.0",
    licenceUrl: BY_SA_4,
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Vinzons_Avenue,_Daet,_C.N.,_May_2024_(2).jpg",
  },
  church: {
    src: "/photos/daet-church.jpg",
    alt: "The red-roofed Saint John the Baptist Church in Daet",
    title: "Saint John the Baptist Church (Daet)",
    creator: "Ralff Nestor Nacor",
    licence: "CC BY-SA 4.0",
    licenceUrl: BY_SA_4,
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Saint_John_the_Baptist_Church_(Daet),_May_2024.jpg",
  },
  // The four hero photos below came from the owner on 2026-11-01 and are
  // temporary: the creator and licence are deliberately blank until the owner
  // supplies them before launch. Don't fill them in from a search.
  calaguasHillside: {
    src: "/photos/hero/calaguas-hillside.jpg",
    alt: "A grassy hilltop path on Calaguas above a turquoise bay, white beaches and nipa huts",
    title: "[replace before launch]",
    creator: "[replace before launch]",
    licence: "",
    licenceUrl: "",
    sourceUrl: "",
  },
  rizalMonumentPark: {
    src: "/photos/hero/rizal-monument-park.jpg",
    alt: "The white Rizal monument in Daet, a pylon topped with a gold star, inside a red and white balustrade under shade trees",
    title: "[replace before launch]",
    creator: "[replace before launch]",
    licence: "",
    licenceUrl: "",
    sourceUrl: "",
  },
  daetHeritageCenter: {
    src: "/photos/hero/daet-heritage-center.jpg",
    alt: "The green-trimmed Daet Heritage Center, with a giant painted pineapple and woven baskets in front",
    title: "[replace before launch]",
    creator: "[replace before launch]",
    licence: "",
    licenceUrl: "",
    sourceUrl: "",
  },
  cathedralHolyTrinity: {
    src: "/photos/hero/cathedral-holy-trinity.jpg",
    alt: "The Cathedral of the Holy Trinity in Daet, a red and stone facade beside a crowned rotunda",
    title: "[replace before launch]",
    creator: "[replace before launch]",
    licence: "",
    licenceUrl: "",
    sourceUrl: "",
  },
} satisfies Record<string, PhotoCredit>;

export type PhotoKey = keyof typeof PHOTOS;
