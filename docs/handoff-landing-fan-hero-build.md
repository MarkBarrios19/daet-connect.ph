# Build plan for Arena: the "place fan" landing hero (GSAP)

> **Built in PR 44.** The bugs found in that build, and how to fix them, are in `docs/handoff-landing-fixes-arena.md`.

You are **Arena**, an AI coding agent. This file is everything you need to build the new
landing page hero for **CONNECT-Daet**, `tellmemaya25-lang/daet-connect.ph`:
- the stack and every library involved;
- the geometry and the animation code;
- the interaction rules and accessibility;
- tests and the order of work.

Read it fully once before writing code.

- **Interactive mock-up (the visual target):** https://claude.ai/artifact/LLgvcRPKmEJh7hETTJrCzf
  - Boards: Desktop hero (hover and click work), Phone hero (tap works), Below the hero
    (scroll page), Motion spec.
  - It may be private to the owner. If you can't open it, everything it shows is described
    here.
- **Earlier plan, shorter:** `docs/handoff-landing-fan-hero.md`. This file supersedes it
  where they differ.

---

## 0. In one paragraph

Replace the top of the home page (`src/app/page.tsx`) with a full-screen hero:
- **Rest:** six photos of Daet places, cut into wedges that fan out from a point near the
  bottom centre, with the headline in the dark area under that point.
- **Hover** (mouse only): the wedge widens by about 5% while the others give way, and its
  name appears.
- **Click:** the wedge grows to fill the hero, and a panel slides in with the place name,
  a short description and links.
- **Close:** click again, press Esc, the ✕ or Back, and it folds back into the fan.
- **Phones:** two fans of three, tap to open, with details in a bottom sheet.
- **Scrolling** past the hero: the fan folds into the "Places to start" cards, then the
  rest of the page follows.

Animations use **GSAP** (with `@gsap/react` and ScrollTrigger). Photos are real
`next/image` elements clipped with CSS `clip-path`. **No three.js, no canvas, no WebGL.**

---

## 1. Ground rules (read first)

1. **Plan first.** Send the owner a short plan (the steps in section 14, plus anything you
   would change) and wait for their OK before coding.
2. **Next.js 16 is not the Next.js you remember.** Read the relevant guides in
   `node_modules/next/dist/docs/` before writing code, at least these:
   - Server and Client Components;
   - `next/image`;
   - Metadata;
   - Caching / data fetching.

   `AGENTS.md` at the repo root says the same. Heed deprecation notices.
3. **Branch:** `claude/landing-place-fan`, cut from the latest `origin/main`. **No pull
   request** unless the owner says "make PR".
4. **No database changes.** Read-only queries only, through the existing server Supabase
   client.
5. **Secrets and tests:**
   - Never print or commit secrets.
   - Never skip, disable or quarantine a test.
   - Don't invent prices, facts, photos or coordinates. Anything missing ships as a
     visible `[placeholder]` and goes on the owner's list.
6. **Photos:** see section 4. The four photos in `docs/hero-photos/` are temporary; the owner
   will replace them later. Build with them, marked "[replace before launch]" in `PHOTOS`,
   and don't search for their photographers.
7. End every commit message with:
   ```
   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   Claude-Session: https://claude.ai/code/session_01FH1Apt7Sb28d1BVdJ8Loxp
   ```

---

## 2. The stack you are working in

All of these are already in the repo; check `package.json`.

| Layer | What | Version in repo | Notes for this build |
|---|---|---|---|
| Framework | **Next.js** App Router | `^16.4.2` | `src/app/page.tsx` is an async **Server Component** that queries Supabase. The hero animation lives in a **Client Component** (`"use client"`) it renders. |
| UI runtime | **React** / react-dom | `^19.3.1` | Use `useRef`, `useState`, `useId`, `useCallback`. No class components. |
| Language | **TypeScript** | `^5.9.3` | Strict. `npx tsc --noEmit` must pass. |
| Styling | **Tailwind CSS v4** (`@tailwindcss/postcss`) | `^4.3.3` | Tokens and utilities are defined in `src/app/globals.css`, e.g. `text-daet-ink`, `bg-surface`, `display-1`, `rounded-2xl`. Use them, not raw hex. |
| Images | **`next/image`** | (Next) | `fill` + `object-cover` + `sizes`; `priority` only on the first two wedges. Images come from `/public`. |
| Data | **Supabase** (`@supabase/ssr`) | (repo) | `createSupabaseServerClient()` from `src/lib/supabase/server.ts`, server only. |
| Unit tests | **Jest** + **Testing Library** (`@testing-library/react`) | `^30.5.2` / `^16.3.0` | `npm test` runs `jest --runInBand` in jsdom. |
| e2e | **Playwright** + **axe** (`@axe-core/playwright`) | `^1.64.1` / `^4.14.0` | `npm run test:e2e`, against a mock Supabase in `e2e/mock-supabase.cjs`. |
| Maps (scroll section only) | **MapLibre GL** via `src/components/maps/free-map.tsx` | `6.14.0` | Reuse the existing `FreeMap` (with its sketch-map fallback) for the "All on one map" section. |

**Shared code to reuse, not re-create:**
- `src/components/ui/page-frame.tsx`: `PageFrame bleed credits={...}` prints photo credits
  at the foot of the page.
- `src/lib/photo-credits.ts`: `PHOTOS`, the single source of photo `src`, `alt` and credit.
  Add new photos here.
- `src/components/home/place-panels.tsx`: the existing "Places to start" panels, the
  target of the scroll fold.
- `src/components/ui/button.tsx` (`ButtonLink`) and `src/components/ui/icons.tsx` (`LineIcon`).
- `src/components/ui/use-drag-dismiss.ts`: swipe-down-to-close for the phone bottom sheet.
- `src/components/ui/design-rules.test.ts`: the design guard. It must keep passing:
  - no resting shadows;
  - no eyebrow labels or uppercase tracking;
  - `rounded-2xl` for cards;
  - no `bg-white` except exempt lines.
- The existing reveal helpers in `globals.css` (`data-reveal`, the `drift` class): look at
  how the current hero uses them, and keep or retire them consistently.

## 3. Libraries to add (exactly these, nothing else)

| Package | Version to pin | Why | How it's used |
|---|---|---|---|
| `gsap` | **exact** version, e.g. `3.13.0` | The tweening engine. It interpolates `clip-path: polygon(...)` strings point by point and handles timelines, reversal, interruption, `quickTo` and `matchMedia`. Since 3.13 every plugin is free and inside this one package, ScrollTrigger included. | `import { gsap } from "gsap"; import { ScrollTrigger } from "gsap/ScrollTrigger";` |
| `@gsap/react` | **exact** version, e.g. `2.1.2` | Supplies the `useGSAP()` hook: scoped selectors, automatic cleanup (`gsap.context().revert()`) on unmount and on React 19 strict-mode double mount, and `contextSafe()` for event handlers. | `import { useGSAP } from "@gsap/react";` |

- **Install:** `npm install --save-exact gsap@<version> @gsap/react@<version>`, then commit
  `package-lock.json`.
- **Versions:** check with `npm view gsap version` / `npm view @gsap/react version`. Pin
  an exact version **published at least two weeks ago**; if the newest is younger, take
  the previous one.
- **Register plugins once**, in the client module: `gsap.registerPlugin(useGSAP, ScrollTrigger)`.

**Why not three.js?** The effect is flat photos with angled edges. DOM images with
`clip-path` give you, for free, all of these:
- real `<img>` alt text and real `<button>`s;
- server rendering and a fast first paint;
- the image optimisation in `next/image`;
- crawlable text.

three.js would add about 150 KB and a WebGL fallback, and lose all of that, for no visible
gain. Don't add `framer-motion`, `motion`, `lenis` or a carousel library either.

---

## 4. Content and assets

### 4.1 The six places in the fan (left to right)

| # | Place | Photo now in repo | Final path (after owner OK) | `alt` | Description (use exactly) | Tag | Link |
|---|---|---|---|---|---|---|---|
| 1 | Calaguas | `docs/hero-photos/calaguas-hillside.jpg` (1500×2000) | `public/photos/hero/calaguas-hillside.jpg` | A grassy hilltop path on Calaguas above a turquoise bay, white beaches and nipa huts | A long white-sand beach on Tinaga Island, with no roads and no hotels. Two to three hours by boat from Paracale or Vinzons. | Beach | `/tours/attractions/tinaga-island-calaguas` |
| 2 | Apuao sandbar | existing `PHOTOS.apuao` (`/photos/apuao-sandbar.jpg`, Wikimedia, credited) | (unchanged) | (from `PHOTOS.apuao`) | Apuao's sandbar rises out of the sea at low tide, about an hour by boat from Mercedes port. | Beach | `/tours/attractions/apuao-grande-island` |
| 3 | Bagasbas Beach | existing `PHOTOS.bagasbas` (`/photos/bagasbas-beach.jpg`, Wikimedia, credited) | (unchanged) | (from `PHOTOS.bagasbas`) | Daet's wide, flat surf beach, ten minutes from the plaza by tricycle. Come for the sunrise waves. | Beach | `/tours/attractions/bagasbas-beach` |
| 4 | First Rizal Monument | `docs/hero-photos/rizal-monument-park.jpg` (1400×788) | `public/photos/hero/rizal-monument-park.jpg` | The white Rizal monument in Daet, a pylon topped with a gold star, inside a red and white balustrade under shade trees | The first monument to José Rizal, raised in Daet in 1898. Start a walk of the old town here. | Heritage site | `/tours/attractions/first-rizal-monument` |
| 5 | Daet Heritage Center | `docs/hero-photos/daet-heritage-center.jpg` (1280×964) | `public/photos/hero/daet-heritage-center.jpg` | The green-trimmed Daet Heritage Center, with a giant painted pineapple and woven baskets in front | A museum in the old municipal hall facing the Rizal Monument, with displays and relics on the history of Daet. | Museum | `/tours/attractions/daet-heritage-center` |
| 6 | Cathedral of the Most Holy Trinity | `docs/hero-photos/cathedral-holy-trinity.jpg` (1024×768) | `public/photos/hero/cathedral-holy-trinity.jpg` | The Cathedral of the Holy Trinity in Daet, a red and stone facade beside a crowned rotunda | The cathedral church of Daet. | Church | `/tours/attractions/cathedral-most-holy-trinity` |

Descriptions 1–4 are the existing `PANELS` copy in `src/app/page.tsx`. Descriptions 5 and
6 are from the `tours_attractions` table, slugs `daet-heritage-center` and
`cathedral-most-holy-trinity`. Don't rewrite them.

### 4.2 Photo rules

- **The owner's four photos are temporary** (Calaguas, Rizal Monument, Heritage Center,
  Cathedral, in `docs/hero-photos/`). The owner will replace them later with their own
  photos and credits.
  - **Don't search for the photographers.**
  - Build with these files: copy them to `public/photos/hero/` and add `PHOTOS` entries
    with `creator: "[replace before launch]"` and empty licence fields.
  - Keep every hero photo reference going through `PHOTOS`, so swapping a photo later is a
    one-line change per place.
- **Bagasbas:** decided. It uses the existing credited `PHOTOS.bagasbas`. The AI-looking
  aerial and the "Alay sa Bayan" building photo were dropped.
- **Resize** each photo to at most 1600 px on the long side and compress (JPEG quality
  about 80). `next/image` handles the responsive sizes.

### 4.3 Headline and copy

- **Hero headline (approved by the owner):** two lines:
  - "Start in Daet."
  - "Go anywhere in Camarines Norte."

  Don't reuse any copy from the poster that inspired this (a hotel advert): no tagline,
  name or phone numbers.
- **Subline:** "Beaches, islands and old-town walks, with operators and guides verified by
  the Daet Tourism Office."
- **Buttons:**
  - "Find a tour" → `/tours/browse`;
  - "Ask the travel guide": opens the existing assistant; check how the current page
    launches it.
- **Keep the current hero's signed-in behaviour:** signed-in users see "My dashboard"
  instead of the second button.

---

## 5. Architecture

```
src/app/page.tsx                      (Server Component, unchanged data fetching + new hero)
└─ <PlaceFan places={FAN_PLACES} signedIn={!!user} />     ← new, "use client"
     ├─ fan-geometry.ts               pure functions, no React, no DOM
     ├─ use-place-hash.ts             URL hash ⇄ open place, Back button
     ├─ use-fan-animation.ts          all GSAP code (useGSAP), returns handlers
     └─ place-detail.tsx              the info panel / bottom sheet (presentational)
└─ <PlacePanels .../>                 existing "Places to start" (scroll-fold target)
└─ <FanFold />                        optional client wrapper that owns the ScrollTrigger fold
└─ rest of the page sections (section 11)
```

New files, all in `src/components/home/`:

| File | Responsibility |
|---|---|
| `place-fan.tsx` | The client component. Renders the hero `<section>`, six wedge `<button>`s, the name chips, the headline, and `<PlaceDetail>` when open. Owns the state machine (section 8). |
| `fan-geometry.ts` | `fanGeometry()`, `wedgePolygon()`, `rectPolygon()`, `toClipPath()`. Pure, unit-tested. Section 6. |
| `use-fan-animation.ts` | `useGSAP` setup: hover tweens, open/close timeline, next/prev, reduced-motion branch through `gsap.matchMedia()`. Section 7. |
| `use-place-hash.ts` | Reads and writes `#place-<slug>` with `history.pushState`, listens to `popstate`, and returns `[openSlug, setOpenSlug]`. |
| `place-detail.tsx` | Name, counter ("3 of 6"), description, tag, actions, ✕, prev/next. A desktop panel and a phone bottom sheet. |
| `fan-places.ts` | The `FAN_PLACES` array (section 4.1) typed as `FanPlace`. Imported by `page.tsx`. |

The data type:

```ts
export type FanPlace = {
  slug: string;            // "bagasbas-beach" (also used in the URL hash)
  name: string;            // "Bagasbas Beach"
  shortName: string;       // "Bagasbas" (phone tags)
  photo: { src: string; alt: string };
  text: string;            // description, verbatim from section 4.1
  tag?: string;            // "Beach" | "Heritage site" | "Museum" | "Church"
  href: string;            // place page
  toursHref: string;       // e.g. /tours/browse?q=Calaguas (check the browse page's real filter params)
};
```

---

## 6. Geometry (the heart of it)

All shapes are `clip-path: polygon(...)` with **exactly the same number of points**. GSAP
can only morph between two polygon strings when they have the same number of numeric
tokens, in the same units.

### 6.1 Coordinate space

- Compute in the hero's **actual pixel size** (`width`, `height`). Write the polygon in
  **percent** of that box, so the string stays valid while the box resizes between
  frames:
  `x% = x / width * 100`, `y% = y / height * 100`.
- **Server render:** compute with a default size of 1440×900, so the first paint already
  shows the fan.
- **After mount:** a `ResizeObserver` on the hero gives the real size, and you recompute.
  Debounce with `requestAnimationFrame`. The hero's CSS size is fixed (`h-[100svh]`,
  `min-h-[560px]`), so this causes no layout shift.

### 6.2 Desktop and tablet fan (≥ 768 px)

Constants, relative to the hero box:

| Name | Value | Meaning |
|---|---|---|
| `VP` | `(0.5 * width, 0.578 * height)` (720, 520 at 1440×900) | The vanishing point the wedges radiate from |
| `A0`, `A1` | `178°` → `362°` | Fan span, measured clockwise in screen coordinates (0° = right, 90° = down, 270° = up). So 178° is just under horizontal-left and 362° just under horizontal-right. |
| `GAP` | `1.2°` | Seam between wedges (the dark ground shows through, like the poster's white seams) |
| `R` | `2.5 * max(width, height)` | Ray length, far outside the box; the polygon is clipped by the box anyway |
| `N` | `8` | Points sampled along each wedge's outer arc |

```ts
const toRad = (deg: number) => (deg * Math.PI) / 180;
const pt = (vp: P, deg: number, r: number): P => [vp[0] + r * Math.cos(toRad(deg)), vp[1] + r * Math.sin(toRad(deg))];

/** Angular widths for n wedges; `focus` widens one by `bump` (fraction of the span) and shrinks the rest equally. */
export function fanWidths(n: number, span: number, focus: number | null, bump = 0.05): number[] {
  const base = span / n;
  if (focus === null) return Array(n).fill(base);
  const extra = span * bump;
  return Array.from({ length: n }, (_, i) => (i === focus ? base + extra : base - extra / (n - 1)));
}

/** 1 + N points: the apex, then N points along the arc from a0 to a1 (inset by GAP/2 each side). */
export function wedgePolygon(vp: P, a0: number, a1: number, r: number, gap: number, n = 8): P[] {
  const s = a0 + gap / 2, e = a1 - gap / 2;
  return [vp, ...Array.from({ length: n }, (_, k) => pt(vp, s + ((e - s) * k) / (n - 1), r))];
}

/** The full box as the SAME number of points (1 + N = 9), ordered so the morph sweeps cleanly. */
export function rectPolygon(w: number, h: number): P[] {
  return [[w / 2, h], [0, h], [0, h / 2], [0, 0], [w / 3, 0], [(2 * w) / 3, 0], [w, 0], [w, h / 2], [w, h]];
}

export const toClipPath = (ps: P[], w: number, h: number) =>
  `polygon(${ps.map(([x, y]) => `${((x / w) * 100).toFixed(3)}% ${((y / h) * 100).toFixed(3)}%`).join(", ")})`;
```

- **Apex mapping:** `rectPolygon` maps the apex to the bottom centre and the arc points
  clockwise around the box. Opening therefore looks like the wedge spreading out from its
  point, as in the mock-up.
- **`fanGeometry`** returns, per wedge:
  - `rest`: the clip-path string;
  - `focusVariants[i]`: the clip-path string when wedge `i` is hovered;
  - `open`: the rect string;
  - `mid`: the mid angle, used for the image offset, chip placement and the outward slide
    when another wedge opens.
- **Keep the headline clear:** the headline sits below `VP`. Check at 768, 1024, 1280 and
  1440 px wide that its text box doesn't intersect any wedge.
  - The angle at a horizontal distance `dx` from `VP` reaches
    `y = VP.y + tan(A0 - 180°) * dx`.
  - Adjust `VP.y` (keep it 0.55–0.6 of the height) or the font size if it does.

### 6.3 Phones (< 768 px): two fans of three

- **Top fan:** `VP = (0.5w, 0.479h)` (195, 404 at 390×844); angles `188°` → `352°`;
  places 1–3.
- **Bottom fan:** `VP = (0.5w, 0.659h)` (195, 556); angles `8°` → `172°`; places 4–6.
- **Middle band:** between the two apexes (about 0.48–0.66 of the height). It holds the
  headline at phone size and "Tap a place to see it".
- **No hover widening on touch.** Name tags are always visible, at `VP + 150px` along each
  mid angle.
- **Detect the layout** with `gsap.matchMedia()` (section 7.5) and a `useMediaQuery`-style
  state, so the markup re-renders with the right geometry.

### 6.4 The photo inside each wedge

Every wedge is a full-hero-size `<button>` (absolute, `inset-0`) clipped by its polygon.
Its photo sits in an inner wrapper that **only moves with `transform`**:

- **Rest:** wrapper `transform: translate(dx, dy) scale(1.15)`.
  `(dx, dy) = (cos(mid), sin(mid)) * 0.18 * min(w, h)`, so the subject sits inside the
  visible slice. Tune per photo with an optional `focus: { x, y }` (object-position) in
  `FanPlace`.
- **Hover:** `scale(1.2)` (1.15 × about 1.04), plus a small pointer parallax (section 7.2).
- **Open:** `translate(0,0) scale(1)`.
- **Image:** `next/image` with `fill`, `className="object-cover"`, and
  `sizes="(min-width: 768px) 100vw, 100vw"`. The full image is needed when open.
- **Never animate** `left`, `top`, `width` or `height`. (The mock-up does, for simplicity;
  don't copy that.)

---

## 7. Animation with GSAP

### 7.1 Setup

```tsx
"use client";
import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function PlaceFan(props: Props) {
  const root = useRef<HTMLElement>(null);
  const { contextSafe } = useGSAP(() => {
    // set initial clip-paths from geometry (gsap.set), build matchMedia branches
  }, { scope: root, dependencies: [size.w, size.h, layout], revertOnUpdate: true });
  // handlers wrapped in contextSafe(...) so their tweens are cleaned up with the component
}
```

- Use `data-wedge={i}`, `data-photo={i}` and `data-chip={i}` attributes, and select with
  scoped selectors (`gsap.utils.toArray<HTMLElement>("[data-wedge]")` inside `useGSAP`).
- **Initial state is server-rendered** as inline `style={{ clipPath: rest[i] }}`, so there
  is no flash before GSAP runs. GSAP only animates from there.

### 7.2 Hover (pointer devices only)

Use `pointerenter` / `pointerleave` with `if (e.pointerType !== "mouse") return;`, plus
`focus` / `blur` for the keyboard.

```ts
const hover = contextSafe((i: number | null) => {
  wedges.forEach((el, j) => {
    gsap.to(el, {
      clipPath: i === null ? geo.rest[j] : geo.focusVariants[i][j],
      filter: i === null || i === j ? "brightness(1)" : "brightness(0.75)",
      duration: 0.35, ease: "power3.out", overwrite: "auto",
    });
  });
  photos.forEach((el, j) => gsap.to(el, { scale: i === j ? 1.2 : 1.15, duration: 0.35, ease: "power3.out", overwrite: "auto" }));
  chips.forEach((el, j) => gsap.to(el, { autoAlpha: i === j ? 1 : 0, y: i === j ? 0 : 6, duration: 0.2, ease: "power3.out", overwrite: "auto" }));
});
```

- **Leaving the fan entirely:** `pointerleave` on the group container calls `hover(null)`.
  Moving between wedges re-targets mid-tween; `overwrite: "auto"` makes that smooth.
- **Pointer parallax:** a `gsap.quickTo(photo, "x", { duration: 0.6, ease: "power2.out" })`
  pair per wedge. On `pointermove`, nudge the photo toward the pointer by ±1% of the hero
  width. Reset on leave.
- **Hover amount:** expose it as a constant `HOVER_BUMP = 0.05`, the "about 5%" the owner
  asked for.

### 7.3 Open (click, Enter or Space)

```ts
const open = contextSafe((i: number) => {
  tl.current?.kill();
  const others = wedges.filter((_, j) => j !== i);
  tl.current = gsap.timeline({ defaults: { ease: "power3.inOut" } })
    .set(wedges[i], { zIndex: 5 })
    .to(wedges[i], { clipPath: geo.open, filter: "brightness(1)", duration: 0.45 }, 0)
    .to(photos[i], { x: 0, y: 0, scale: 1, duration: 0.45 }, 0)
    .to(others, { autoAlpha: 0, x: (j) => offsets[j].x, y: (j) => offsets[j].y, duration: 0.45 }, 0)  // 60px outward along each mid angle
    .to(headline, { autoAlpha: 0, duration: 0.25, ease: "power2.out" }, 0)
    .add(() => setPhase("open"), 0.3)            // mounts <PlaceDetail>, which animates itself in
    .eventCallback("onComplete", () => detailHeading.current?.focus());
});
```

- **Close** = `tl.current.reverse()`, about 0.45 s. `onReverseComplete`:
  - set `zIndex` back;
  - set the phase to `"rest"`;
  - return focus to the wedge that was opened.
- **Next or previous while open:**
  1. cross-fade: the next wedge is set to `geo.open` with `autoAlpha: 0`, then tweened to
     1 over 0.3 s (`power2.inOut`), while the current one fades to 0;
  2. swap the indices in state;
  3. the panel text re-enters with the 7.4 animation.
- **Details panel** (`place-detail.tsx`):
  - enter: `gsap.from(panel, { y: 24, autoAlpha: 0, duration: 0.35, ease: "power3.out", delay: 0.3 })`;
  - phone sheet: `yPercent: 100` → 0 over 0.38 s;
  - the ✕ and arrows fade in at 0.25 s.

### 7.4 Timings (from the mock-up's Motion spec board)

| Moment | Duration | Ease |
|---|---|---|
| Hover widen, dim, photo scale | 350 ms | `power3.out` |
| Name chip in/out | 200 ms | `power3.out` |
| Pointer parallax | 600 ms | `power2.out` (`quickTo`) |
| Open morph | 450 ms | `power3.inOut` |
| Details panel in | 350 ms, starting at 300 ms | `power3.out` |
| Next/previous cross-fade | 300 ms | `power2.inOut` |
| Close (reverse) | about 450–500 ms | (reverse of open) |
| Phone sheet in | 380 ms, starting at 220 ms | `power3.out` |
| Scroll fold | scrubbed | `none` (scrub) |
| Section reveal | 500 ms, once | `power2.out` |
| Card hover lift (CSS) | 200 ms | `cubic-bezier(.215,.61,.355,1)` |

Animate **only** `clip-path`, `transform` (`x`, `y`, `scale`, `yPercent`), `opacity` /
`autoAlpha` and `filter: brightness()`. Set `will-change` only during a tween, if at all.

### 7.5 Reduced motion and breakpoints: `gsap.matchMedia()`

```ts
const mm = gsap.matchMedia();
mm.add(
  { desktop: "(min-width: 768px)", phone: "(max-width: 767px)", reduce: "(prefers-reduced-motion: reduce)" },
  (ctx) => {
    const { desktop, reduce } = ctx.conditions!;
    // build geometry for desktop or phone, set initial clip-paths
    // if reduce: hover only changes brightness (no clip-path, no scale, no parallax);
    //            open/close = 150ms autoAlpha cross-fade of a full-box copy; no ScrollTrigger pin/scrub
  }
);
```

`useGSAP` reverts the `matchMedia` context on unmount. Never rely on motion alone to
explain a change: the counter, the heading focus and the live region do that.

---

## 8. Interaction and state

**State machine** (`useReducer`):
- **States:** `rest` → `hover(i)` → `opening(i)` → `open(i)` → `closing(i)` → `rest`.
  `open(i)` can go to `open(j)` through next/prev.
- **Hover** is ignored outside `rest` / `hover`.
- **Clicks during `opening` / `closing`** re-target: kill the timeline, then reverse or
  open the new one. Don't queue.

**Ways to open:**
- clicking a wedge;
- Enter or Space on a focused wedge;
- loading the page with `#place-<slug>`: open instantly with `progress(1)` and no
  animation.

**Ways to close:**
- clicking the open photo, or the ✕;
- Esc, from a `keydown` listener on the hero section (not on `window`), only while open;
- the browser Back button: opening pushes `#place-<slug>`, so `popstate` closes it;
- scrolling the page while open: close first, then let the page scroll.

**Moving between places while open:** ← / → keys, the arrow buttons on desktop, and a
horizontal swipe on phones. Use `pointerdown` / `pointerup` deltas over 40 px, ignoring
mostly-vertical drags.

**While open:** lock scroll only inside the hero, with `overflow: hidden` on the hero
`<section>` and `overscroll-behavior: contain`. Don't lock `<body>` on desktop. On phones,
the open view covers the viewport, so add `touch-action: none` on it and let
`use-drag-dismiss` handle swipe-down.

## 9. Accessibility checklist

- [ ] **Wedges:** the six wedges are `<button type="button">` inside
      `<div role="group" aria-label="Places in Daet">`, in DOM order 1→6.
- [ ] **Labels:** each wedge has `aria-label="<Name>: open photo and details"` (when open:
      "close photo and details"), plus `aria-expanded` and
      `aria-controls="<detail region id>"`.
- [ ] **Keys:** ← / → move focus between wedges while closed (roving focus is fine,
      plain Tab order is fine too). Enter or Space opens.
- [ ] **Focus ring:** clip-path clips outlines, so show focus on the **name chip** instead
      (visible chip + 2 px ring, `#93c5fd` on dark), triggered by `:focus-visible` on the
      wedge.
- [ ] **Detail region:** `<section role="region" aria-labelledby="<h2 id>">`. On open,
      focus moves to its `<h2 tabIndex={-1}>`. On close, it returns to the wedge.
- [ ] **Live region:** an `aria-live="polite"` region announces "Bagasbas Beach, 3 of 6",
      also on next/previous.
- [ ] **Alt text:** every photo has the alt from section 4.1. Name chips are
      `aria-hidden="true"`, because the button label already says the name.
- [ ] **Contrast:** text on photos sits on a **flat** `rgba(15,23,42,0.8)` panel (the
      design system forbids gradients), and passes 4.5:1. Check with axe.
- [ ] **Targets:** tap targets are at least 44×44 px; the ✕ and arrows are 48–52 px.
- [ ] **Reduced motion:** honoured (section 7.5).
- [ ] **Without JavaScript:** the fan still renders (server-side clip-paths), and every
      wedge works as a link, because the button wraps or falls back to an `<a href>` to
      the place page. Choose one of these:
      - keep `<button>`s and add a visually hidden list of links, or
      - render `<a>`s and intercept the click when JS is running.

## 10. Responsive behaviour

| Width | Layout |
|---|---|
| ≥ 1280 | Desktop fan, headline 64/68 px Fraunces (use the repo's display utility nearest that size) |
| 768–1279 | Desktop fan, headline scaled with `clamp()`. Re-check the headline clearance (6.2). |
| < 768 | Two fans of three (6.3), headline 34/38 px in the middle band, tap to open, bottom sheet |

- Hero height `h-[100svh]` with `min-h-[560px]` and `max-h-[1000px]`. The site header
  overlaps it (flat `rgba(15,23,42,0.8)` bar). Check how `PageFrame bleed` positions the
  header and keep that.
- **Landscape phones** (height < 500 px): **one fan of six** (owner's decision), using
  the desktop geometry. No name tags; tap opens the place full screen.

## 11. Below the hero (scroll)

**Every section reads real data or shows a visible placeholder.**

1. **The fold** (ScrollTrigger, desktop only, not under reduced motion):
   - as the hero scrolls out, the wedges' clip-paths tween toward the six "Places to
     start" card rectangles (or simply scale and fade toward them);
   - `scrub: true`, `pin: true` on the hero for about `+=100%`;
   - **simplest acceptable version:** pin plus a fade, with the cards rising in;
   - call `ScrollTrigger.refresh()` after images load (`onLoadingComplete` of the first
     two images).
2. **Places to start:** the **existing `PlacePanels` section, unchanged** (owner's
   decision). It keeps its six panels: Calaguas, Apuao sandbar, Mercedes port, Bagasbas
   Beach, First Rizal Monument, St John the Baptist Church. Don't redesign it or swap in
   cards; the scroll fold just hands off to it.
3. **Trips you can book:**
   - published `tours_packages` with the minimum `price_per_pax` from
     `tours_package_price_variants`;
   - card text: "3 days · from ₱3,799 per person", plus the operator name;
   - **no found photo on a package card**: use the operator's cover image, or a
     `brand-deep` block with the place name (design system rule);
   - the line "Every operator is verified by the Daet Tourism Office." appears once, here.
4. **What's on:** the existing events query already in `page.tsx` (`tours_events`,
   upcoming, published), as date cards.
5. **All on one map:** `FreeMap` with pins only for places that have coordinates in
   `tours_attractions`. Tapping a pin scrolls to the top and opens that place in the fan
   (`setOpenSlug`).
6. **Not sure where to start?** A blue band with "Ask what to do in one day", opening the
   assistant.
7. **Travel with people from here:**
   - an ink band showing counts of approved operators and guides, using `count` queries
     on `tours_operators` / `tours_guides` where `accreditation_status = 'approved'`;
   - a "Find a guide" link.
8. **Getting to Daet:** three short cards using this copy, researched on 2026-11-01 from
   the sources listed. Show **no fares or exact times as fact**, and end with the
   check-before-you-travel line.
   - **By bus:** "Direct buses run from Metro Manila, from Cubao and from PITX, to the
     Daet Integrated Terminal in Lag-on. Plan on about 7 to 10 hours, depending on
     traffic. Changing buses at Lucena is often cheaper."
   - **By plane:** "There are no scheduled flights to Daet. Fly from Manila to Naga
     Airport in Pili, Camarines Sur, then take a van or bus to Daet, about 2 to 3 hours
     more."
   - **By van:** "Vans leave Naga's westbound van terminal for Daet Central Terminal
     through the day, roughly 5 AM to 5 PM. The ride takes about 2 hours."
   - **Closing line:** "Check schedules and fares with the bus company or terminal before
     you travel."
   - **Sources** (link them in the footer credits line):
     [Pamasahe: DLTB Manila–Camarines Norte](https://pamasahe.com/routes/manila-camarines-norte-dltb-co-schedule-fares),
     [Rome2rio Cubao–Daet](https://www.rome2rio.com/s/Cubao/Daet),
     [Rome2rio Manila–Daet](https://www.rome2rio.com/s/Manila/Daet),
     [Wikipedia: Bagasbas Airport](https://en.wikipedia.org/wiki/Bagasbas_Airport),
     [Wikipedia: Philippine Airlines destinations](https://en.wikipedia.org/wiki/List_of_Philippine_Airlines_destinations) (Daet route terminated),
     [Flights from Naga (WNP)](https://www.flightconnections.com/flights-from-naga-camarines-sur-wnp),
     [Wikivoyage: Daet (2025 snapshot)](https://kwx.liehendr.com/content/wikivoyage_en_all_maxi_2025-02/A/Daet).
   - Keep this copy in one constant (e.g. `src/lib/getting-here.ts`), so the Tourism Office
     can correct it in one place.
9. **Footer credits:** through `PageFrame credits`. Add the new `PHOTOS` keys.

**Section reveals:**
- `gsap.from(el, { y: 16, autoAlpha: 0, duration: 0.5, ease: "power2.out", scrollTrigger: { trigger: el, start: "top 85%", once: true } })`;
- or keep the existing `data-reveal` CSS if it already does this. One system, not two.

## 12. Performance budget

- **Lighthouse mobile on `/`:** Performance ≥ 90, LCP < 2.5 s, CLS < 0.05, TBT < 200 ms.
- **Images:**
  - only wedges 1–2 are `priority`;
  - the rest load normally (they're visible, so don't lazy-load them below the fold
    incorrectly);
  - give `sizes` correctly;
  - resize sources (4.2).
- **GSAP size:** core plus ScrollTrigger is about 45 KB gzipped, loaded only in the
  client hero chunk. Don't import GSAP in any server file.
- **Smoothness:** no long tasks over 50 ms during hover, in a Chrome DevTools Performance
  recording with 4× CPU slowdown at 375 and 1440 px.

## 13. Tests

**Unit (Jest + Testing Library)**
- `fan-geometry.test.ts`:
  - `fanWidths` sums to the span, with and without focus;
  - focus widens by exactly `span * 0.05`;
  - every polygon from `wedgePolygon` and `rectPolygon` has 9 points;
  - `toClipPath` outputs percentages;
  - the phone fans don't overlap the middle band.
- `place-fan.test.tsx` (mock GSAP: `jest.mock("gsap", ...)` and `jest.mock("@gsap/react", ...)`,
  with `useGSAP` running its callback once, `timeline()` returning a chainable stub whose
  `eventCallback("onComplete")` runs immediately, and `matchMedia().add` calling back with
  `{ conditions: { desktop: true, reduce: false } }`):
  - renders 6 buttons with the right labels inside the labelled group;
  - Enter opens the region, focuses the heading and sets `aria-expanded="true"`;
  - Esc closes and returns focus to the wedge;
  - the URL hash `#place-bagasbas-beach` opens Bagasbas on mount;
  - next and previous change the heading and the live region;
  - with the reduced-motion condition, no `clipPath` tween is created.
- `use-place-hash.test.ts`: pushState on open, `popstate` closes.
- **Keep passing:** `design-rules.test.ts`, `place-panels.test.tsx`, and every existing test.

**e2e (Playwright + axe), at 375 px and 1280 px**
- Add a test in `e2e/public.spec.ts` (or a new `e2e/home-fan.spec.ts`):
  1. the hero shows 6 place buttons;
  2. at 1280, hover one and its chip is visible;
  3. click Bagasbas: the region heading "Bagasbas Beach" and its description are visible,
     and the URL has `#place-bagasbas-beach`;
  4. press Escape: the region is gone and the URL hash is cleared;
  5. reopen, go Back: it closes;
  6. no horizontal overflow (`scrollWidth <= clientWidth`);
  7. axe has no violations.
- Run once with `page.emulateMedia({ reducedMotion: "reduce" })`, so clicks don't wait on
  animations.
- **Wait for end states** (visible, URL), never fixed timeouts.
- **Mock data:** extend `e2e/mock-supabase.cjs` if the new sections query tables it
  doesn't stub yet (`tours_package_price_variants` min price, operator and guide counts).
- **Commands:** `npx tsc --noEmit`, `npm test`, `npm run test:e2e`, and the build:
  `rm -rf .next && NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build`.
- **Screenshots:**
  - hero at rest, hover and open, at 375 and 1440, light and dark;
  - a short screen recording of hover → open → next → close → scroll fold;
  - send all of these to the owner.

## 14. Order of work (one commit each, tests with each)

1. Add `gsap` and `@gsap/react` (exact versions) and the lockfile. Register the plugins in
   a tiny `src/lib/gsap.ts` that client code imports.
2. Write `fan-geometry.ts` and its tests.
3. Write `fan-places.ts`. Copy and resize the temporary photos into `public/photos/hero/`,
   and add them to `photo-credits.ts` as "[replace before launch]".
4. Build `place-fan.tsx`, static only: server-rendered fan with clip-paths, headline,
   buttons, labels. Wire it into `page.tsx` in place of the current hero. Add a snapshot or
   DOM test.
5. Add hover (`use-fan-animation.ts`): widen, dim, chip, parallax, focus chip.
6. Add open/close/next/prev, `place-detail.tsx`, `use-place-hash.ts`, focus management and
   the live region.
7. Phone layout: two fans, tap, bottom sheet, swipe-down to close.
8. Reduced motion through `gsap.matchMedia()`, and the no-JS fallback links.
9. Scroll: the fold (ScrollTrigger), section reveals, and the new sections with their real
   queries and placeholders.
10. Tests: e2e and axe at both widths. Lighthouse. Screenshots and recording for the owner.

## 15. Done means

- [ ] **Desktop:** hovering a place widens its wedge by about 5% and shows its name,
      smoothly, and moving across wedges never jumps.
- [ ] **Opening and closing:** clicking a place morphs it to full screen with its name,
      description and links. Clicking again, ✕, Esc or Back folds it back. Next and
      previous work while it's open.
- [ ] **Phones:** two fans of three, tap to open, a bottom sheet with swipe-down to close.
- [ ] **Keyboard and screen readers:** keyboard-only and screen-reader use works
      (section 9). axe is clean.
- [ ] **Reduced motion:** gives cross-fades only.
- [ ] **Scroll:** the fan hands off to "Places to start", and the sections below use real
      data or visible placeholders.
- [ ] **Performance:** the section 12 budget is met.
- [ ] **Checks:** all tests and the build pass. Screenshots and a recording have been sent
      to the owner.
- [ ] **No pull request** until the owner says "make PR".

## 16. Owner decisions and what's still open

**Decided (2026-11-01):**
- **Bagasbas:** uses the credited `PHOTOS.bagasbas`. The aerial and the "Alay sa Bayan"
  building photo were dropped.
- **Headline:** "Start in Daet. Go anywhere in Camarines Norte." is approved.
- **Places to start:** keep the original `PlacePanels` section unchanged, Mercedes port
  and church included.
- **Landscape phones:** one fan of six.
- **Getting to Daet:** use the researched copy in §11, item 8.

**Still open (ask the owner):**
1. Replacement photos and their credits for Calaguas, the Rizal Monument, the Heritage
   Center and the Cathedral. The owner will supply them later (see §4.2).
2. Whether the Tourism Office has confirmed the "Getting to Daet" text before launch.
