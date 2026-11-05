# Handoff: landing hero "fan" of Daet places (GSAP)

> **Source of truth:** the full build plan in `docs/handoff-landing-fan-hero-build.md` supersedes this file where they differ.

## Context

The owner shared a hotel advert from Kodaikanal (Poppys Hotel): photos of local places
cut into wedges that fan out from a road's vanishing point, with a man walking up the
road and text over it. They want that **layout** (without the text and without the man)
as the **CONNECT-Daet landing page hero**, filled with **Daet places and our own
credited photos**:
- **Hover** a wedge: it widens by about 5%.
- **Click** a wedge: it animates to full screen and shows the photo, the place name and
  a short description.
- **Click again** (or close): it collapses back into the fan.
- **Scrolling** reveals more sections below. I'll suggest what goes there.

The poster itself is another business's advert. Nothing from it is copied: not the hotel
name, logo, phone numbers, tagline or photos. Only the idea of the composition is reused.

## Deliverables after approval

1. **An interactive Claude Design mock-up.** It uses the Design type, built on the
   account's **CONNECT-DAET design system**, the only one listed. Its artboards have real,
   working hover and click animations:
   - **A** Desktop 1440, resting fan.
   - **B** Desktop, hover on one wedge: about 5% wider, neighbours give way, name chip
     fades in.
   - **C** Desktop, a wedge opened full screen with name, description and actions, plus
     the close state.
   - **D** Phone 390, resting and opened.
   - **E** A long scroll page with the suggested sections below the hero.
   - **F** A motion spec board: timings, easings, reduced-motion behaviour.
2. **A handoff doc**, `docs/handoff-landing-fan-hero.md` (the plan below), committed and
   pushed to `claude/epic-cray-pgfa7m`. No PR. The landing page code itself is built
   only after the owner signs off on the mock-up.

## Technology: GSAP, not three.js

- The fan is six photos with angled edges. That is DOM images plus `clip-path`, which
  GSAP animates smoothly. It keeps real `<img>` elements, so they're accessible,
  crawlable and use `next/image`.
- three.js would only be worth it for WebGL distortion effects. It costs about 150 KB
  more, loses accessibility, and needs a fallback anyway.
- **Packages:** `gsap` (pin an exact version that is at least two weeks old, e.g.
  `3.12.5`) and `@gsap/react` (`useGSAP` for cleanup in React 19 / Next 16). Use
  ScrollTrigger for the scroll part, which is part of the free gsap package. No other
  libraries.

## Hero design

### Layout (desktop and tablet, 768 px and up)

- A full-viewport hero (`min-h-[100svh]`). Six wedges radiate from a vanishing point at
  bottom centre, as in the poster:
  - three on the left: Calaguas, Apuao sandbar, Mercedes port;
  - three on the right: Bagasbas Beach, First Rizal Monument, St John the Baptist Church.
- Below the vanishing point, a calm road-like band (a dark gradient, no man) holds the
  page headline. The copy is the owner's to approve; a placeholder:
  "Start in Daet. Go anywhere in Camarines Norte." It must not use the poster's tagline.
- Each wedge is an absolutely positioned panel with a `next/image` (`fill`,
  `object-cover`, a `sizes` value per breakpoint, `priority` on the first two) clipped
  by a `clip-path: polygon(...)`.
  - Every wedge's polygon has the same number of points, computed from the angles in
    one helper, `fanGeometry(count, gapDeg, focus?)`, so GSAP can tween between shapes.
  - Thin light seams separate the wedges, as in the poster: either a 2 px gap from the
    geometry, or a `drop-shadow` outline only while hovered. No resting shadows, per the
    design rules.
- **Photos and text:** the existing `PHOTOS` entries and the `PANELS` text in
  `src/app/page.tsx`, so photo credits keep working through `PageFrame credits`.
  - No invented descriptions: reuse the current panel texts. If a longer description is
    wanted, the owner supplies it, or it's taken from `tours_attractions.description`.

### Hover (pointer devices only, `(hover: hover)`)

- The hovered wedge's angular width grows by about 5% of the fan. The other wedges
  shrink proportionally, so the fan keeps its total angle. Tween the clip-path to
  `fanGeometry(..., focus=i)`.
  - 350 ms, `power3.out`. Interruptible: moving to the next wedge re-targets
    mid-tween with `overwrite: "auto"`.
- The image inside scales from 1.0 to 1.04 and nudges 1% toward the pointer (subtle
  parallax, `quickTo`).
- Other wedges dim to `brightness(0.8)`.
- A name chip ("Bagasbas Beach") fades and rises 6 px in, anchored near the wedge's
  outer edge.
- The cursor shows that the wedge can be clicked. Keyboard focus gets the same
  treatment, plus a visible focus ring.

### Click → full screen (an expand transition)

One GSAP timeline per open, reversed to close:

1. **0–450 ms, `power3.inOut`:**
   - the chosen wedge's clip-path tweens to the full rectangle,
     `polygon(0 0, 100% 0, 100% 100%, 0 100%)`, with the same point count, padded;
   - its image settles to scale 1 and centred;
   - the other wedges fade to 0 and slide 4% outward;
   - the headline band fades out.
2. **300–650 ms (overlapping):**
   - a bottom gradient fades in;
   - the info panel slides up 24 px and fades in, holding:
     - the place name (display font);
     - a 1–2 sentence description;
     - a small facts row, only where we have the data (e.g. category "Beach",
       "Heritage site");
     - actions: **"See tours to here"** (links to `/tours/packages` filtered, or to
       matching packages), **"Open on the map"** (`/tours/attractions/{slug}` when an
       attraction matches), and **Close** (an ✕ button, top right);
   - arrow buttons (desktop) and swipe (touch) move to the previous or next place while
     open: a cross-fade, then re-run step 2 for the new text.

**Closing:** the ✕, Esc, clicking the photo again, or the browser Back button all run
the timeline in reverse, about 500 ms, and focus returns to the wedge that was opened.

**State and URL:**
- Opening sets `#place-bagasbas` with `history.pushState`, so Back closes it and the
  link can be shared. Loading with a hash opens that place without animating.
- The page doesn't scroll while a place is open (`overflow: hidden` on the hero
  container only). Scrolling up or down closes it first.

### Phones (under 768 px)

- Six wedges are too thin at 375 px. Instead, show **two stacked fans of three**:
  - the top fan opens upward, the bottom fan opens downward, meeting at a central band
    that holds the headline;
  - or a single fan of three with a "More places" swipe. Pick in the mock-up; the
    two-fan version is the default proposal.
- **Tap** opens full screen straight away (there's no hover on touch).
  - The info panel becomes a bottom sheet, with the photo filling the screen above it.
  - Swipe down or tap ✕ to close, using the existing `use-drag-dismiss.ts`.

### Accessibility

- Each wedge is a `<button>`:
  - `aria-label` is "Bagasbas Beach: open photo and details";
  - `aria-expanded` and `aria-controls` point to the detail region.
  - The six buttons sit in a `role="group"` labelled "Places in Daet".
  - ← / → move focus between wedges; Enter or Space opens one.
- The opened view is a `role="region"` labelled by the place name. Focus moves to its
  heading, Esc closes it, and focus returns to the wedge.
- Everything that matters is plain DOM text. Images have real `alt` text from `PHOTOS`.
- **`prefers-reduced-motion`:** no clip-path morph, parallax or slides. Hover only
  brightens the wedge. Open and close are a 150 ms cross-fade to and from a full-screen
  photo.
- **Contrast:** the info panel text sits on a solid-ish gradient, AA at least, in light
  and dark themes.

### Performance

- Animate only `clip-path`, `transform`, `opacity` and `filter` (brightness). Use
  `will-change` only while a tween is running.
- Load the first two images with `priority`, the rest lazily. Use responsive `sizes` so
  phones don't download 1440 px wedges.
- Import GSAP only in the client component (`"use client"`). The hero renders the fan
  statically on the server, so first paint shows the composition before any JS runs.
- **Targets:** Lighthouse mobile performance at least 90 on `/`, Largest Contentful Paint
  under 2.5 s, layout shift under 0.05, and no long tasks over 50 ms during hover.

## Below the hero: suggested sections (scroll)

Use only real data from the app's database or the owner's own copy. Nothing is invented.

1. **Scroll handoff:** as the page scrolls past the hero, the fan **folds into a row of
   six cards** (ScrollTrigger `scrub`, about 1 screen tall, pinned).
   - The cards are the existing **"Places to start"** panels (`place-panels.tsx`), so the
     story continues.
   - Under reduced motion it's a simple fade.
2. **Featured tours:** 3–4 published packages from `tours_packages` (e.g. Kalmado's
   Calaguas trips once they're approved). Each card shows the cover, price from the
   default option, and the next open date. Cards reveal with a 40 ms stagger.
3. **What's on:** upcoming events from `tours_events` (the Pinyasan 2026 programme is
   already in the database), as a horizontal date strip.
4. **All places on one map:** a `FreeMap` strip with pins for the six places and the
   attractions. Tapping a pin opens the same full-screen detail as the hero, reusing
   that component.
5. **Plan with the travel guide:** a short invitation to the existing AI assistant
   ("Ask what to do in 1 day"), opening the chat dock.
6. **Trusted locals:** accredited operators and guides from the Tourism Office, as a
   count plus a few names and logos, only if they consent to appear. Links to the guide
   directory.
7. **Getting to Daet:** routes by bus, plane and van. **Owner-provided facts only.** It
   ships as a placeholder until they give the text.
8. **Footer** with the photo credits (already handled by `PageFrame`).

**Scroll motion for all sections:** content rises 16 px and fades in, once
(ScrollTrigger `once: true`). The hero photos get a gentle parallax (`yPercent: -8`)
while it's leaving view. Nothing scroll-jacks except the one pinned fold in item 1.

## Build plan (after the mock-up is approved)

- **New files:**
  - `src/components/home/place-fan.tsx`: the client component with the fan, hover,
    open/close and keyboard;
  - `src/components/home/fan-geometry.ts`: a pure function that turns angles into
    polygons, with the same point count for every shape;
  - `src/components/home/use-place-hash.ts`: syncs the URL hash and Back button.
- **`src/app/page.tsx`:**
  - the hero uses `<PlaceFan places={PANELS} />`;
  - "Places to start" stays, as the target of the scroll fold.
- **Tests:**
  - `fan-geometry.test.ts`: angles add up, same point count, focus widens about 5%;
  - `place-fan.test.tsx`:
    - buttons and labels;
    - Enter opens the region and moves focus;
    - Esc closes and returns focus;
    - the hash opens the right place;
    - reduced motion skips the GSAP timelines (mock `gsap`);
  - e2e in `e2e/public.spec.ts`, at 375 px and 1280 px with axe:
    - open a place, see its name and description, close it;
    - Back closes it;
    - no horizontal overflow.
  - Keep `design-rules.test.ts` and the existing home tests passing.
- **Checks:**
  - `npx tsc --noEmit`, `npm test`, `npm run test:e2e`, and the build;
  - Lighthouse mobile on `/`;
  - screenshots and a screen recording for the owner.
- **Delivery:** a new branch, `claude/landing-place-fan`. No PR unless the owner says
  "make PR".


## Mock-up

Interactive Claude Design canvas: https://claude.ai/artifact/LLgvcRPKmEJh7hETTJrCzf
(desktop hero, phone hero, the scroll page below the hero, and the motion spec).
The mock-up animates with CSS transitions on the same clip-path geometry; the app uses GSAP.

Photos: the owner sent ten more photos (Daet Heritage Center, the Rizal monument park,
a plaza with a statue, Bagasbas from the air, Calaguas hillside, a Calaguas boat, an
island aerial, bodyboards for rent, a beach aerial with boats, a hillside walk). Add them
as files in `public/photos/` with their source and licence in `src/lib/photo-credits.ts`
before they go on the site. Photos that look AI-generated must not be shown as the real place.
