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
- **Bands:** the page's full-colour bands are `bg-blue-600` with white text. The "Booking, in three moves" band is the owner's **ticket** (image-62): one printed shape — the owner's SVG, inlined so its fill follows the theme — with a bite out of the middle of its top and bottom edges and a dashed perforation at 56% of its width, stretched to whatever box the band gives it. In its left half sits the photograph, inset from the ticket's edge; in its right the three moves on a card of the reference's warm white (`--color-ticket-panel`, rgb(250 246 239)); and across the perforation sits the owner's "Booking in 3 moves" lettering, kept as the file they sent (`public/ticket/booking-in-3-moves.svg`) rather than redrawn. `ticket-noise` — the owner's own noise, fractal turbulence lit by `feSpecularLighting`, so it reads as a raised surface rather than a flat speckle — is the surface of the photograph and the card, always under the words. The ticket is `text-ticket-frame` (`--color-ticket-frame`, the reference's cream rgb(232 215 185)). On a phone the halves stack and the lettering drops between them. In **dark mode the band is seated in the theme** (the owner's note on image-56, "optimize colors for dark mode"): the ticket takes `#152036` and the card `#1b2740` instead of the reference's light values, the copy is the theme's ink (`#e2e8f0`, 12:1 on the card), and a fifth of the page's ground is laid over the photograph so it does not blaze out of the page. The heading the lettering shows is a screen-reader `h2`.
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
- **Checking:** `THEME=dark node scripts/design/shoot.mjs <dir>` takes dark screenshots. `e2e/theme.spec.ts` checks the toggle, the saved choice and dark-mode contrast.

## Frame

- **Header** (`site-header.tsx`):
  - wordmark, a Menu sheet on phones (`mobile-menu.tsx`, built on `<details>`), and the links in the bar from `md` up;
  - Sign out is always visible when signed in.
- **Footer** (`site-footer.tsx`):
  - the full close for visitors and tourists: link columns, the name set large, and photo credits through `PageFrame credits={...}`;
  - a one-line footer on staff work screens.
- **Bottom tab bar** (`role-tab-bar.tsx`) for signed-in users on phones.

## Checking a change

```bash
node scripts/design/shoot.mjs .taste-skill/<name>    # screenshots at 1440 and 390 (dev server on 3101 with the e2e mock)
node scripts/design/measure.mjs                      # overflow and tap targets at 375px
npx jest src/components/ui/design-rules.test.ts
```

Set `PW_CHROMIUM_PATH` to use a preinstalled Chromium.
