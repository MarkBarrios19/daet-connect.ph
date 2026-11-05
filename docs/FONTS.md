# Fonts

Two families, both **SIL Open Font License 1.1**, both served from this site by
`next/font/local` (`src/app/layout.tsx`) so no page waits on a third-party font host and no
request leaves for Google.

| Role | Family | File | Weights |
|---|---|---|---|
| Display (headings, the wordmark, numbers) | **Fraunces** (variable) | `src/app/fonts/Fraunces-Variable.woff2` | 100–900, plus `opsz`, `SOFT`, `WONK` |
| Text | **Public Sans** | `PublicSans-400.ttf`, `PublicSans-700.ttf` | 400, 700 |

`src/app/fonts/Fraunces-OFL.txt` is the licence, and it ships with the font.

Provenance: `Fraunces-Variable.woff2` is `files/fraunces-latin-full-normal.woff2` from
`@fontsource-variable/fraunces@5.3.0`, itself built from the Fraunces project
(`github.com/undercasetype/Fraunces`). 121 KB, latin subset, all four axes.

## How display type is set

`--font-display` in `src/app/globals.css` is the **only** place the display family is named.
Every heading, the wordmark, the footer's name-in-large and the `display-1` / `display-2`
utilities read that token, so swapping the display face is a one-line change.

`display-1` and `display-2` set **900**. With the variable font's optical-size axis left on
`auto`, the browser asks for a display cut at display sizes and a text cut at small ones —
which is why 900 reads as a tight, high-contrast display serif at the hero's 96px and stays
legible on a 28px section heading. `SOFT 0` keeps the terminals crisp and `WONK 0` turns off
Fraunces' quirkier letterforms; A clean, tight display cut is the point.

Measured with fontTools, at the hero's sizes the 900/`opsz 144` cut is **~12% narrower** than
the old single-weight 600 file, so the hero's line count (and the "hero ends at the fold"
test) is unaffected — heavier, not taller.

## Swapping in another display face

The owner asked for **Migra ExtraBold** (Pangram Pangram Foundry). It is a commercial
typeface: it needs a **webfont licence**, bought from the foundry, before it can be served
from this site. It was offered on a third-party download page; that is not a licence, and
embedding that file in a public Tourism Office site would be unlicensed redistribution — so
this repo does not contain it, and nothing here will fetch it.

If a licence is bought, swapping it in takes three steps and no component changes:

1. Put the licensed `.woff2` (and its licence file) in `src/app/fonts/`.
2. In `src/app/layout.tsx`, load it beside the others and add its variable to `<html>`:

   ```ts
   const migra = localFont({
     src: [{ path: "./fonts/Migra-Extrabold.woff2", weight: "800", style: "normal" }],
     variable: "--font-migra",
     display: "swap",
     fallback: ["Georgia", "Times New Roman", "serif"],
   });
   ```

   ```tsx
   <html className={`${migra.variable} ${display.variable} ${sans.variable}`}>
   ```

3. In `src/app/globals.css`, put it in front of the display stack:

   ```css
   --font-display: var(--font-migra), var(--font-fraunces), Georgia, "Times New Roman", serif;
   ```

Then check `display-1` / `display-2`'s weight against the face's own weights (Migra ships
ExtraBold as 800) and run the hero tests — `e2e/home-fan.spec.ts` holds the fold and the
button contrast.

Free stand-ins, if a licence is not on the cards: **Fraunces 900** (already shipping),
**Playfair Display Black**, **Bodoni Moda 900**. All three are OFL, and all three swap in by
the same three steps.
