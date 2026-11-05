
# Handoff for Arena: fix the landing page (PR 44)

**Branch to work on:** `arena/93ffc379-daet-connect-ph`. This is PR 44's own branch; push ordinary commits, with no rebase or force-push. **Base:** `main` at `0466589`.

**Source of truth for intent:** `docs/handoff-landing-fan-hero-build.md` (the build plan). This doc only fixes what that build got wrong. Don't redesign anything it doesn't mention.

**Evidence:** a 24-second screen recording by the owner. It shows the PR 44 preview in desktop Chrome, about 1920×994, at scroll top, then hovering the fan, then scrolling to the footer. The frames the bugs come from are cited as `t=Ns`.

Read `AGENTS.md` first. This Next.js has breaking changes, so check `node_modules/next/dist/docs/` before touching routing or images.

## 0. Rules

- **Never** skip, loosen or delete a test. Don't remove the axe audits.
- **Never** invent photos, prices, credits, coordinates or copy.
- **Don't change** the "[replace before launch]" credits. The owner will replace those photos.
- **Don't touch** `PlacePanels` ("Places to start"). The owner chose to keep the original.
- **No schema changes.**
- Keep reduced-motion, no-JavaScript and keyboard behaviour working as they do now.
- Motion may only animate `clip-path`, `transform`, `opacity` and `filter: brightness()`.

## 1. Bug list, ranked

| # | Severity | What the owner sees | Root cause |
|---|---|---|---|
| B1 | Critical | Hovering any wedge makes the fan collapse. The photos shrink to a strip along the top, the lower half goes dark, and at one point only a red sliver is left. Then it snaps back (t=3–9s, t=12s). | GSAP's CSS plugin blends the `clip-path` strings wrongly when the percentages go past ±100, and every arc point does. See §2.1, where the fault is proven. |
| B2 | High | A wedge's name tag shows when nothing is hovered. "Calaguas" is visible at t=0 with the cursor up in the address bar, and "Cathedral of the Most Holy Trinity" stays on after the mouse leaves (t=7–12s). | Two systems control the tag's opacity: CSS (`group-hover:opacity-100` plus `transition-opacity`) and GSAP (`autoAlpha`). `hover(null)` passes `autoAlpha: undefined`, so the last inline value sticks. |
| B3 | High | The headline's first line sits on top of the photos. "Find a tour" and "Ask the travel guide" are cut off at the bottom of the first screen (t=0–11s). | The hero is `h-[100svh]` but sits under the 64–80 px header, so its bottom 64–80 px start below the fold. The fan's point is fixed at 57.8% of the height, while the headline is anchored at `bottom: 7%` and grows upward past that point. |
| B4 | Medium | The seams between wedges are dark wedges themselves. They are thin at the point and tens of pixels wide at the edges, and look like broken glass rather than the poster's thin lines. | The gap is an angle (`GAP_DEGREES = 1.2`), so its width grows with distance from the point. The radius is 2.5× the hero. |
| B5 | Medium | Scrolling turns the hero into a shrunken, boxed card with white margins on both sides and a white band under it, before "Places to start" (t=12–13s). | `useHeroFold` scales the whole `<section>` to 0.92. Also, `getBoundingClientRect()` in `place-fan.tsx` measures the scaled box, so the fan's geometry can be rebuilt at the wrong size mid-scroll. |
| B6 | Medium | Sections stay half-faded while you look at them. On the blue "Booking, in three moves" band the heading is a pale blue ghost, with steps fading in one at a time, and bands show as empty colour strips (t=15–18s). | The `[data-reveal]` CSS ties opacity to scroll position (`animation-timeline: view()`, range `entry 0% → entry 45%`). Whatever is part-way into the view stays part-transparent, which also fails contrast. |
| B7 | Low | The "Daet AI assistant" pill sits over the hero's bottom-right corner, next to the headline buttons. | The floating widget has no offset for the full-bleed hero. |

**Not bugs; leave them:**
- The small dark round button on the right edge is the Vercel preview toolbar. It doesn't appear in production.
- The "[replace before launch]" credits in the footer stay, as the owner decided.
- The single souvenir card in "Take Daet home" is real data (one featured item).

## 2. Fixes

### 2.1 B1: stop letting GSAP blend clip-path strings

**Proof.** This was reproduced with `gsap@3.15.0` (the PR's version) and jsdom, using the PR's own `fanGeometry(1440, 900)`:

```
from:      polygon(10% 20%, -199.700% 38.194%, 30% 40%)
to:        polygon(10% 20%, -199.353% 29.035%, 30% 40%)
gsap.to → polygon(10% 20%, -149.5147% 31.3248%, 30% 40%)   // halfway; x should be about -199.53
gsap.utils.interpolate(from, to, 0.5) → -199.5265% 33.6145%   // correct
```

With values above +100% the same thing happens mirrored: 199.7 goes to 149.5. Halfway through a hover, each wedge's outer points jump by about 50% of the hero's width (about 720 px), which is the collapse in the video. The e2e suite runs with `reducedMotion: "reduce"`, which skips the morph, so no test ever ran it.

**Fix: GSAP tweens numbers, and our own code writes the clip-paths.**

1. **`src/components/home/fan-geometry.ts`.** Export pure helpers that work in pixels:
   - `fanWedgePoints(geometry, fanIndex, widths: number[]): Point[][]` gives one wedge per width. It reuses `wedgePolygon`, and the widths are normalised so they always add up to the fan's span.
   - `lerpPoints(a: Point[], b: Point[], t: number): Point[]` blends two point lists; both must be the same length.
   - `rectPoints(width, height)`: the existing `rectPolygon`.
   - Keep `toClipPath` as the only place strings are made. Keep `rest` strings, because the server render needs them for no-JS.
2. **`src/components/home/use-fan-animation.ts`.** Keep one plain state object per hero:
   ```ts
   const state = { widths: number[] /* per wedge, degrees */, open: number[] /* 0..1 per wedge */ };
   function render() {
     // for each wedge i: pts = lerpPoints(wedgePts[i], rectPts, state.open[i]);
     // el.style.clipPath = toClipPath(pts, w, h)
   }
   ```
   - **Hover:** `gsap.to(state.widths, { endArray: target, duration: 0.35, ease: "power3.out", overwrite: true, onUpdate: render })`. `target` is `fanWidths(...)` for the hovered wedge, or for `null`.
   - **Open:** a timeline tweens `state.open[index]` from 0 to 1, with `onUpdate: render`. The other wedges keep their `autoAlpha` and `x/y` slide tweens (transforms are fine).
   - **Close:** `tl.reverse()` as now.
   - **Next/previous:** set `state.open[next] = 1` and render, then cross-fade as now.
   - **Ban:** no `clipPath` key in any `gsap.to/set/fromTo` or `tl.to` call. Add a source-guard Jest test that fails if `/clipPath\s*:/` shows up inside a GSAP call in `src/components/home/`.
   - **Geometry changes** (resize or rotation): rebuild `wedgePts` and `rectPts` and call `render()` from the current `state`. Drop `revertOnUpdate: true`, which kills tweens in mid-flight and snaps the fan.
   - Reduced motion stays as it is: brightness only, and a cross-fade on open.
3. **`src/components/home/place-fan.tsx`.** Measure with `element.clientWidth` and `element.clientHeight` (or the `ResizeObserver` entry's `contentRect`), not `getBoundingClientRect()`, so transforms never change the geometry (see B5).

### 2.2 B2: one owner for the name tag

- Remove `transition-opacity`, `opacity-0`, `group-hover:opacity-100` and `opacity-100` from the tag for mouse users. GSAP alone sets `autoAlpha`.
- Server render: phone tags are visible; desktop tags start with an inline `style={{ opacity: 0, visibility: "hidden" }}`.
- `hover(null)` sets `autoAlpha: 0` and `y: 6` on every tag. It never passes `undefined`.
- Keyboard focus still has to show a tag. On the wedge's `onFocus`/`onBlur` (only when `:focus-visible` matches), call the same `hover(index)`/`hover(null)`. Keep the `group-focus-visible:ring-2` ring.
- Reduced motion: `gsap.set` the tag to 1 or 0, as now.

### 2.3 B3: the hero fits under the header, and the headline sets the point

1. **Header height:** `SiteHeader` is `min-h-16 sm:min-h-20`. Expose that height as a CSS variable, `--header-h: 4rem`, with `5rem` from `sm` up, set on `:root` in `globals.css`. Use the same breakpoint values as the header. Don't measure it with JavaScript.
2. **Hero height:** change the section's class from `h-[100svh] max-h-[1000px] min-h-[560px]` to `h-[calc(100svh-var(--header-h))] max-h-[1000px] min-h-[520px]`.
3. **Headline sets the fan's point (desktop layout only):**
   - Measure the `[data-headline]` block's `offsetTop` alongside the hero size.
   - Pass `vpY = clamp(headlineTop - 16, 0.45 * h, 0.62 * h)` into `fanGeometry(width, height, layout, { vpY })`. Make `vpY` an optional argument; the default stays 0.578 h, so the server render and existing tests are unchanged.
   - This way the headline always sits in the dark under the point and never on a photo.
4. **Short desktop screens:** at `h < 640`, use `display-2` for the headline and hide the subline, so the buttons always fit. The phone layout is unchanged.
5. **Acceptance:** at 1280×720, 1366×768, 1440×900, 1920×1080 and 1920×994:
   - the bottom of both buttons is ≤ `innerHeight - 16`;
   - the top of the `h1` is ≥ the fan's point.

### 2.4 B4: seams of constant width

- Replace the angular gap with a gap in pixels: `GAP_PX = 3` on desktop, `2` on phone.
- Build each wedge from its two edge rays, each pushed inward by `GAP_PX / 2` along its normal:
  - point = the intersection of the two offset rays (very close to the true apex);
  - then the same 8 arc samples, taken between the offset edges.
  - Keep the point count at 9.
- Lower the radius to `1.5 * Math.hypot(w, h)`. That is enough to cover the box and keeps the numbers smaller.
- Update `fan-geometry.test.ts`:
  - the seam width measured 50 px and 800 px from the point is the same, within 0.5 px;
  - there are still 9 points;
  - the widths still add up to the span.

### 2.5 B5: a fold that doesn't shrink the page

In `use-hero-fold.ts`:
- Stop scaling the `<section>`. It stays full-bleed and keeps its size.
- Scrub inner layers instead, over `start: "top top"` to `end: "bottom top"`:
  - the wedges' group (`[role=group]`) moves `yPercent` from 0 to -8;
  - `[data-headline]` goes from `opacity: 1` to `0` over the first 60%.
- It stays desktop-only and is still never registered under reduced motion. Keep the `ScrollTrigger.refresh()` on load.

### 2.6 B6: reveals that finish and stay finished

- Replace the scroll-linked CSS animation with a one-time reveal.
- **New client component `src/components/ui/reveal-observer.tsx`**, mounted once in `PageFrame`:
  - one `IntersectionObserver` with `rootMargin: "0px 0px -10% 0px"` and `threshold: 0`;
  - it sets `data-revealed` on each `[data-reveal]` element and then stops watching it.
- **`globals.css`:**
  - `[data-reveal]:not([data-revealed])` gets `opacity: 0` and `translateY(16px)`, but only under `html.js`;
  - `[data-revealed]` transitions to visible over 300 ms ease-out, with `transition-delay: calc(var(--reveal-index, 0) * 60ms)`;
  - add `js` to `<html>` with a tiny inline script in the root layout, so no-JS visitors see everything;
  - reduced motion: no transform, and opacity changes instantly;
  - delete the `@supports (animation-timeline: view())` block.
- This also covers `/tours/browse`, `/tours/attractions` and `/tours/merch`, which use the same attribute. Check each one.

### 2.7 B7: keep the assistant pill off the hero's buttons

- In `assistant-widget.tsx`, while the home hero is in view, raise the pill to `bottom: max(1rem, var(--hero-cta-clear))`, or hide it until the hero has scrolled out.
- Prefer hiding it, using an `IntersectionObserver` on `#home-title`. Then the headline's own "Ask the travel guide" button is the only way in on the first screen.
- Keep it reachable by keyboard everywhere else.

## 3. Tests to add

The e2e tests go in `e2e/home-fan.spec.ts`, in a new `describe` **with motion on** (`reducedMotion: "no-preference"`, 1280×800, desktop). The existing reduced-motion block stays as it is.

1. **The fan stays whole while you hover.**
   - Hover wedge 0 and wedge 3.
   - At 100 ms, 175 ms and 400 ms, sample a 12×6 grid of points inside the hero and above the fan's point (keep 8 px inside each edge).
   - At every point, `document.elementFromPoint` must return something inside `[data-wedge]`.
   - Chrome hit-tests `clip-path`, so a hole in the fan hits the `<section>` and fails. This test fails on today's branch; check that it does before fixing.
2. **Tags:**
   - On load, no desktop tag is visible.
   - Hover wedge 2, and only tag 2 is visible.
   - Move the mouse off the hero, and after 300 ms no tag is visible.
   - Tab to a wedge, and its tag is visible.
3. **Fit:** run §2.3's checks at each listed viewport. Don't scroll the page during the test.
4. **Fold:** scroll down 400 px. The section's `getBoundingClientRect().width` still equals `innerWidth`.
5. **Reveal:** scroll to `#home-how`. Within 600 ms, the heading's computed opacity is 1. Run axe on that band.

Jest tests:
- `fan-geometry.test.ts`: `lerpPoints`, constant-width seams, and the optional `vpY`.
- `use-fan-animation.test.tsx`: hover and close write clip-path strings that only come from `toClipPath`. The source-guard test from §2.1.
- A test that the reveal observer marks elements and stops watching them.

## 4. Order of work

1. Write e2e test 1 and watch it fail on today's branch (proof of B1).
2. Fix B1 (§2.1) until test 1 passes.
3. Fix B2, then B4 (geometry tests first).
4. Fix B3, then B5, then B6, then B7.
5. Run the full checks (§5) and push one commit per bug, so each one can be reviewed on its own.

## 5. Done means

Locally, with the Chromium the CI uses (`PW_CHROMIUM_PATH` if needed), all of these pass:
- `npx tsc --noEmit`
- `npm test`
- `npm run test:e2e:tours`, both the existing tests and the new motion tests;
- `next build`, run with the dummy Supabase env the CI uses.

Then, on the Vercel preview:
- Record 1920×1080 and 1440×900: hover across all six wedges, open and close one, and scroll to the footer. Also do 375 px portrait and a landscape phone.
- Attach the recordings or screenshots to PR 44.
- CI on PR 44 is green, and the PR description lists B1–B7 with the commit that fixed each.

## 6. Files

| File | Change |
|---|---|
| `src/components/home/fan-geometry.ts` | pixel helpers, `lerpPoints`, gap in pixels, optional `vpY` |
| `src/components/home/use-fan-animation.ts` | tween a state object and render clip-paths ourselves; tag logic; no `revertOnUpdate` |
| `src/components/home/place-fan.tsx` | measure without transforms, headline-based `vpY`, tag classes, focus → hover, hero height |
| `src/components/home/use-hero-fold.ts` | scrub inner layers, not the section |
| `src/components/ui/reveal-observer.tsx` (new), `src/components/ui/page-frame.tsx`, `src/app/layout.tsx`, `src/app/globals.css` | one-time reveal, `--header-h` |
| `src/components/assistant/assistant-widget.tsx` | hidden while the hero is on screen |
| `e2e/home-fan.spec.ts`, `src/components/home/*.test.ts(x)` | the tests in §3 |

