# CONNECT-Daet design system

This is the frontend redesign's rulebook. It follows the team's **UI & Mobile-First Standards**, and `src/components/ui/design-rules.test.ts` enforces the parts a test can check.

## Standards (team)

- **Mobile first:** build for 375px, then scale up.
- **Touch targets:** at least 44×44px (`min-h-11`, `min-w-11`). `scripts/design/measure.mjs` reports any smaller ones.
- **Colours:**
  - primary `bg-blue-600` (Daet Blue);
  - success `bg-green-500`;
  - warning `bg-yellow-500`;
  - error `bg-red-600`.
  - Green and yellow fills carry **dark text** (`text-slate-950`); white on them fails contrast.
- **Shapes:** `rounded-2xl` for every card, `rounded-full` for primary buttons.

## House style

- **Cards:** white on the white ground, with **a visible hairline and no resting shadow** — the `card-edge` utility (an inset 1.5px `--color-hairline`, `#d3dae5` in light). The light ground is white (sampled from the owner's FAQ reference, image-46), so the tone step that used to separate a card is gone and the edge does that work instead; the owner asked for that edge a step heavier after seeing it (image-48 against image-47). A card that already draws its own border or ring keeps it. Rules *between* things (FAQ rows, the Getting to Daet band's columns) use `border-hairline` / `divide-hairline` at 1px. Shadows (`shadow-[var(--shadow-float)]`) are only for things that float: menus, dialogs, toasts, the bottom bars.
- **Bands:** the page's full-colour bands are `bg-blue-600` with white text. The "Booking, in three moves" band is the owner's **ticket** (image-62 – image-68): `ticket-shape` masks the band itself — a bite out of each of its four corners and a pair where the paper is torn. Circles of a fixed radius, `clamp`ed so they follow the page (34px at the corner, 26 for the tear, off the owner's own bands): a stretched copy of their drawn shape turned every circle into a capsule, so the edge is a mask, not a picture, and the bites stay circles at any width. A wide band is torn at 56% of its width, where the owner draws the perforation — white dashes on the cream, the page's own ground in the dark (owner's note on image-95: the cyan there out-shouted the band, so the dashes and the bites are now one colour) — and the two bites in the top and bottom edges sit on that line; the lettering is centred on the band at 50%, so it crosses the tear rather than hiding it. On a phone the halves stack: the photograph and the card of moves meet with no gap, the bites move to the left and right edges level with that seam, and the lettering straddles it. Where the seam falls is not guessed — the band is an inline-size container and `ticket-seam` works it out from the band's own padding, its 4:3 photograph and its row gap (`--ticket-pad-x`, `--ticket-pad-y`, `--ticket-gap`), so the mask and the lettering land on the line the layout actually makes. In the left half sits the photograph, inset from the paper's edge; in the right, sized 1.35 : 1 against it, the three moves on a card of the reference's warm white (`--color-ticket-panel`, rgb(250 246 239)). `ticket-noise` — the owner's own noise, fractal turbulence lit by `feSpecularLighting`, so it reads as a raised surface rather than a flat speckle — is the surface of the photograph and the card, always under the words, at 6% on the paper and the photograph and 4.5% on the card: the reference's own grain was too loud at this size, and is down by seventy per cent. The paper is `bg-ticket-frame` (`--color-ticket-frame`, the reference's cream rgb(232 215 185)); the lettering is kept as the file they sent (`public/ticket/booking-in-3-moves.svg`) rather than redrawn, with one value changed inside it: the grain the artwork carries was flooded with black at 0.27 alpha and is at 0.135, half of it, on the owner's note (image-72). In **dark mode the band is the owner's own dark band** (image-67): the paper is a slate blue well off the near-black page (`#334561`) and the card of moves sits *under* it, darker than the paper (`#162648`) rather than lighter, with the tear in the page's own ground, the colour the bites are cut down to. The copy is the theme's ink (`#e2e8f0`), and a fifth of the page's ground is laid over the photograph so it does not blaze out of the page. The heading the lettering shows is a screen-reader `h2`.
- **Button sizes:** `md` (44px), `lg` (48px) and `xl` (50.4px — `lg` five per cent up, used by the hero's two buttons on the owner's note in image-58). The hero's statement runs at `--display-scale: 0.9`, so it is a tenth under `display-1` without a second copy of the utility.
- **The hero is the page, not a band.** Its ground is `bg-canvas` and its headline is `text-daet-ink` in both themes — no dark-theme overrides — so it runs straight into the sections below it and its words are the same ink as their headings (owner's note on image-59). The seams between the photo wedges are the ground showing through, so they follow it for free.
- **The open place's map folds away.** The map card beside the place's own card stands at nine tenths of the viewport (owner's note on image-61) and carries a fold control in its header (image-63): folded, the map is gone, "Show all" goes with it — it acts on a map nobody can see — and the bar that names the place stays. The height is a prop, not a class, and a folded card is a **new box** (a `key`), so the height it was given cannot survive the fold — undoing an inline height in place did not work in Chromium and cost three CI runs to establish. The map itself fills its box by being pinned to it (`absolute inset-0`), not by a height: `FreeMap` wraps it in a `<figure>`, so a percentage or a flex rule sizes it against that figure's auto height and comes out zero tall.
- **No eyebrow labels** above headings. A date or context goes under the title (`CardHeader description`).
- **No small uppercase letter-spaced labels.** Use sentence case at a readable size.
- **No emoji as icons.** Use `LineIcon` (`src/components/ui/icons.tsx`), `TabIcon` or `CategoryIcon`.
- **Type:**
  - Fraunces for display, Public Sans for text — see `docs/FONTS.md`, including how to swap
    the display face (it hangs off one token, `--font-display`);
  - `display-1` (`clamp(2.5rem, 9vw, 6rem)`) and `display-2` (`clamp(1.75rem, 5vw, 3rem)`) for page titles;
  - body text 16px or larger, in full ink.
- **Motion:**
  - add `data-reveal` (and optionally `style={{ "--reveal-index": n }}`) to the parts of a section; they rise in as they scroll into view (pure CSS scroll-driven animation in `globals.css`; browsers without it show the content at once);
  - buttons scale slightly when pressed;
  - the hero's two buttons carry the **Wayra** sweep (the pen the owner pointed at, Codepen OJJZLzX): a slab hinged at the button's bottom-left corner, laid back 45° out of sight, swings up to fill it — the solid button fills a step deeper, the outlined one fills with ink and flips its label to the page's ground. `wayra` in `globals.css`; it runs on `:hover` **and** `:focus-visible`, and its transitions are off under reduced motion;
  - everything is static under `prefers-reduced-motion`.

## Theme tokens and dark mode

The app follows the device (light or dark) until someone picks **Light**, **Dark** or **System**:
- **Desktop:** the sun/moon/monitor button in the header.
- **Phones:** the Theme row in the Menu.

The choice is saved on the device (`localStorage["daet-theme"]`). A script in `<head>` (`src/lib/theme.ts`) applies it before the first paint.

- **Neutral surfaces use tokens that switch by themselves:**

  | Instead of | Use |
  |---|---|
  | `bg-white` | `bg-surface` (cards, sheets, the header) |
  | `bg-slate-50` | `bg-canvas` (page ground) |
  | `bg-slate-100` | `bg-muted` |
  | `bg-slate-200` | `bg-muted-strong` |
  | `bg-slate-300`, `border-slate-200/300` | `bg-line` / `border-line` |

  `text-daet-ink` and `bg-daet-sand` switch too. `design-rules.test.ts` fails on the old light-only classes.
- **Coloured tints and text carry a `dark:` partner**, for example `bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300`. Solid fills (`bg-blue-600`, green and yellow fills) and `text-white` work in both themes and need none.
- **Always light:** wrap anything that must stay light (a printed badge, a QR code) in `data-theme="light"`. Print is always light.
- **The browser's own widgets follow `color-scheme`, which is set in `@layer base` and not with the dark tokens:** scrollbars, date pickers, selects and text fields. It lived in `@layer theme` until round 57, where the `:root` above it beat it (same specificity, earlier layer), so a dark page kept Windows' light scrollbars — a white slab with arrows down the right edge, and the same inside every textarea of the assistant (owner's note, image-97 and image-98). Scrollbars are drawn by the theme too: `scrollbar-width: thin` with the track transparent and the thumb in `--color-line` (hover `--color-muted-strong`), declared once for the page in the same layer and inherited by every scroller inside it, with `::-webkit-scrollbar` for Safari and older Chromium (which also stops Chromium drawing the arrow buttons). `scrollbar-quiet` stays for panels that want it spelled out.
- **Checking:** `THEME=dark node scripts/design/shoot.mjs <dir>` takes dark screenshots. `e2e/theme.spec.ts` checks the toggle, the saved choice and dark-mode contrast.

## Frame

- **Header** (`site-header.tsx`):
  - wordmark, a Menu sheet on phones (`mobile-menu.tsx`, built on `<details>`), and the links in the bar from `md` up;
  - Sign out is always visible when signed in.
- **Footer** (`site-footer.tsx`):
  - the full close for visitors and tourists: link columns, the name set large, and photo credits through `PageFrame credits={...}`;
  - a one-line footer on staff work screens.
- **Bottom tab bar** (`role-tab-bar.tsx`) for signed-in users on phones, and the **back to top** button (`scroll-to-top.tsx`) at the foot of every page: 44px, centred, only once a screen of the page is behind the visitor, and lifted over that tab bar when there is one.
- **A place open on a phone** (`place-detail.tsx`) is a **sheet**, not a floating card: docked to the foot of the hero, the screen's width, only its top corners rounded, a grab handle, the phone's safe area under the words, and it scrolls inside itself if the copy outgrows 85svh (the owner's design, image-74).

## Checking a change

```bash
node scripts/design/shoot.mjs .taste-skill/<name>    # screenshots at 1440 and 390 (dev server on 3101 with the e2e mock)
node scripts/design/measure.mjs                      # overflow and tap targets at 375px
npx jest src/components/ui/design-rules.test.ts
```

Set `PW_CHROMIUM_PATH` to use a preinstalled Chromium.
