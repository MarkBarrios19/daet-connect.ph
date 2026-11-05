# Handoff: remove the "How long have you got?" section from the landing page

**For:** the next coding agent working in this repo (`tellmemaya25-lang/daet-connect.ph`).
**Ask from the owner:** remove the "How long have you got?" section from the landing page entirely: its heading, intro text, the length buttons (Half a day / A full day / Two days or more), the photo, the trip list and "See all trips". Nothing replaces it. That's it.

**Your first job is to plan, not to code.** Read this file and the code it points to, write a short plan (files you'll touch, what you'll delete, how you'll verify), and get the owner's OK before editing.

---

## 1. Ground rules for this repo
- **Next.js is version 16 and differs from older versions.** Per `AGENTS.md`, read the relevant guide in `node_modules/next/dist/docs/` before writing code.
- **Branch:** work on a new branch from `origin/main`, e.g. `claude/remove-trip-length`. Never push to `main`.
- **No PR** unless the owner says "make PR".
- **Commit trailer**, to end every commit message:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01FH1Apt7Sb28d1BVdJ8Loxp
  ```
- **Never commit secrets.** No database change is needed for this task.
- **Code style:** the repo has no Prettier config and uses long lines (about 160 characters). Don't reformat files you didn't change.

## 2. What the section is today (on `main`)
All of it lives in **`src/app/page.tsx`** (the `HomePage` server component):

| Part | Where (approximate) | What it is |
|---|---|---|
| Imports | top of file | `TripLengthPicker, type BoardTrip` from `@/components/tours/trip-length-picker`; `toManilaDateKey` from `@/lib/tours/events-calendar`; `durationLabel, fromPrice, nextOpenDate, placePhoto, tripLength` from `@/lib/tours/trip-board` |
| `type PackageRow` | about line 74 | Shape of the packages query; used only by this section |
| `const today = toManilaDateKey(new Date())` | first line in `HomePage` | Used only by this section |
| 4th query in `Promise.all` (`packagesResult`) | `supabase.from("tours_packages")…limit(40)` | Fetches published packages only for this section |
| `const trips: BoardTrip[] = …map(…)` | after the queries | Builds the trip list for the picker |
| The JSX `<section aria-labelledby="home-length">…</section>` | just after the hero section; comment `{/* The live thing: real trips, by the time they take. */}` | The heading, text and `<TripLengthPicker trips={trips} />` |

The picker component is **`src/components/tours/trip-length-picker.tsx`**: the buttons, the photo card with its caption, the trip rows with "Ask for dates", and "See all trips".

## 3. What to change
1. **In `src/app/page.tsx`:**
   - Delete the whole `<section aria-labelledby="home-length">` block, including the comment above it.
   - Delete the 4th `Promise.all` entry (the `tours_packages` query) and remove `packagesResult` from the destructuring. The array becomes `[{ data: { user } }, eventsResult, merchResult]`.
   - Delete `type PackageRow`, `const today`, and the `trips` mapping.
   - Remove the imports that become unused: `TripLengthPicker`/`BoardTrip`, `toManilaDateKey`, and the `trip-board` helpers. Check each one: if `tsc` or ESLint still finds a use, keep it.
   - Keep everything else exactly as it is: the hero, "Places to start" (`PlacePanels`), events, the booking band, merch, and operators.
2. **Spacing check:** the next section ("Places to start", `aria-labelledby="home-places"`) now follows the hero directly. Look at it at 375 px and 1280 px. Its top padding (`pt-20 sm:pt-32`) may be too large there; if so, reduce it. A good target is the removed section's `pt-16 sm:pt-24`.
3. **Delete `src/components/tours/trip-length-picker.tsx`**, but only after confirming nothing else imports it (`git grep trip-length-picker`). When this handoff was written, the landing page was its only user.
4. **Leave `src/lib/tours/trip-board.ts` alone.** Its helpers (`durationLabel`, `fromPrice`, `placePhoto`, `matchPlacePhoto`, …) are used by many other pages: browse, package detail, attractions, bookings, the tourist dashboard. It also has its own tests (`trip-board.test.ts`). `tripLength`, `nextOpenDate` and the length labels may become unused outside tests. That is fine; don't remove them in this task, just mention it in your summary.
5. **Photo credits:** `HOME_PHOTOS` in `page.tsx` lists the photos credited in the page footer. The picker's photo came from `placePhoto(...)`, usually `bagasbas`, which is also used by the Places panels. Make sure `HOME_PHOTOS` still lists only photos the page actually shows. As far as we know none needs removing, but check.

## 4. Things to check that might break
- **Tests:**
  - `git grep -n "How long have you got\|Half a day\|A full day\|Two days or more\|See all trips\|home-length\|TripLengthPicker"` across `src/` and `e2e/`. When this handoff was written, there were no e2e or unit tests for the picker besides the `trip-board` lib tests.
  - Re-check anyway, and update or remove any test that targets the removed section. Never skip or disable a test just to get green.
- **Design rules:** `src/components/ui/design-rules.test.ts` runs over all of `src/`; it should still pass.
- **Mock data:** the mock Supabase (`e2e/mock-supabase.cjs`) serves `tours_packages`. Other pages still use it, so don't change the mock.

## 5. Verification (run all, report results honestly)
```bash
npx tsc --noEmit
npx jest
# production build (dummy env is enough)
rm -rf .next && NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build
# e2e at phone width with axe; uses the preinstalled Chromium
rm -rf .next && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:e2e:tours
```
- After e2e, stop leftover servers and restore the generated file:
  `ps -eo pid,args | grep -E "^ *[0-9]+ (node e2e/mock|node .*next dev|next-server)" | awk '{print $1}' | xargs -r kill; git checkout -q next-env.d.ts`
- **Screenshots** of the landing page at 375 px and 1280 px, light and dark:
  - Start `node e2e/mock-supabase.cjs`, with `MOCK_SUPABASE_PORT=54329 MOCK_COVERS=1`.
  - Start `npx next dev --port 3101`, with `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54329 NEXT_PUBLIC_SUPABASE_ANON_KEY=e2e-anon-key`.
  - Capture with Playwright.
  - Confirm three things: the section is gone, the hero flows straight into "Places to start" with sensible spacing, and there's no horizontal scroll.

## 6. Done means
- The landing page no longer shows "How long have you got?", the length buttons, the photo card, the trip rows, or "See all trips".
- The packages query for it is gone, so the page makes one fewer database call.
- No unused imports remain, `trip-length-picker.tsx` is deleted (if nothing else uses it), and everything else on the page is unchanged.
- `tsc`, Jest, the build and the full e2e suite all pass.
- One commit is pushed to the new branch with the trailer above.
- A short summary for the owner covering: what was removed, the spacing decision, and any helpers in `trip-board.ts` that are now used only by tests.
