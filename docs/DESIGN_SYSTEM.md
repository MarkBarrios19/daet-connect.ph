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

- **Cards:** white on the slate-50 ground, with **no border and no resting shadow**. The tone step separates them. Shadows (`shadow-[var(--shadow-float)]`) are only for things that float: menus, dialogs, toasts, the bottom bars.
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
