# Prompt for Arena: redesign the operator's package editor

Copy everything below to Arena.

You're working on CONNECT-Daet (`tellmemaya25-lang/daet-connect.ph`). It's a Next.js 16
App Router app with Tailwind v4 and Supabase. Read `AGENTS.md` and the relevant guide in
`node_modules/next/dist/docs/` before writing code.

### Goal

The owner wants the operator's **package screens**, above all **editing a package**, to
be much easier to use:
- redesign the forms;
- rethink how edits are made and saved;
- use **modals** where they help;
- use **dropdowns** (or searchable dropdowns) wherever a list is too long to show in full.

Users are tour operators in Daet and Camarines Norte, often on phones and often not
technical.

### Where you're starting from

Build on your branch **`arena/2f2dab27-daet-connect-ph`**. It already has the upload fix,
published-gallery review, and the dnd-kit gallery (`57618ef`). If it has been merged,
build on `main`. Don't redo the gallery work; fit it into the new layout.

The screens are in `src/app/(subsystems)/tours/operator/packages/`:
- `page.tsx`: the package list;
- `[id]/page.tsx`: package overview;
- `[id]/availability/`: calendar of open dates;
- `create/`: a 5-step wizard, `package-create-form.tsx` + `components/package-*-step.tsx`;
- `[id]/edit/`: the editor:
  - `EditPackageForm.tsx` (~475 lines);
  - the sections `BasicDetailsStep`, `CoverImageStep`, `PricingStep`, `InclusionsStep`,
    `StopsStep`, `GalleryStep`;
  - the logic `permissions.ts` (what each status may change), `change-detection.ts`,
    `validation.ts`, `edit-mappers.ts`, `edit-order.ts`, `actions.ts` (`updatePackageCore`,
    `submitPackageForReview`, `uploadPackageImage`).

Shared UI to **reuse**, not re-create:
- `src/components/ui/modal.tsx`: `Modal` and `ConfirmDialog`, built on the native
  `<dialog>`, with a focus trap and Esc to close, docking to the bottom on phones;
- `src/components/ui/field.tsx`: `Field`, `Input`, `Textarea`, `Select`, `fieldDescribedBy`;
- `button.tsx`, `card.tsx`, `notice.tsx`, `feedback.tsx`, `badge.tsx`, `empty-state.tsx`,
  `use-popover.ts`, `icons.tsx`.

### What's wrong today (read the code to confirm)

1. **One long page, one save button.**
   - All six sections are stacked, and the only save is at the very bottom, labelled
     "Save as Draft" (or "Save changes" when published).
   - There's no unsaved-changes indicator, no warning when leaving with unsaved edits, and
     no quick way to jump to a section.
2. **Hand-built popups.**
   - Pricing, Inclusions and Stops each open a hand-made `fixed inset-0` overlay instead
     of the shared `Modal`.
   - That means no focus trap, no Esc, no phone bottom sheet, and three slightly different
     copies of the same pattern.
3. **Raw inputs** instead of `Field`/`Input`/`Select`. Labels, hints, errors and
   `aria-describedby` are inconsistent.
4. **Stops ask for raw coordinates.** Latitude and longitude are typed numbers that
   default to a fixed point. Operators don't know coordinates, and the app already has an
   attractions list with names and coordinates (`tours_attractions`) plus a MapLibre map
   (`src/components/maps/free-map.tsx`).
5. **Long lists shown in full.**
   - 13 inclusions and 4 exclusions each take a full row with ↑ ↓ Edit buttons.
   - Every row repeats the same controls.
6. **Locked fields aren't explained.** On published packages many things can't change.
   The page shows small "cannot be modified for this package status" notes after the
   fact, instead of saying up front what can change and how.
7. **The create wizard and the editor look and behave differently** for the same data.

### The redesign

#### A. Page structure for the editor (`[id]/edit`)

- **Header:**
  - package title, a status badge (Draft / In review / Published / Rejected / Archived),
    and a "View public page" link when published;
  - one line saying what this status allows. For published packages, for example:
    "Text, cover photo and captions save straight away. Prices, inclusions and photos go
    back to the Tourism Office for review."
- **Section navigation:**
  - *Desktop (`lg`+):* a sticky left sidebar listing Basics, Photos, Prices, What's
    included, Route & stops, and Trip details. If the Kalmado `[id]/details` editor has
    been merged, link to it from Trip details or fold it in.
  - Each item shows a dot for unsaved changes and a red dot for errors.
  - *Phones:* the sidebar becomes a sticky **"Jump to section" dropdown** at the top.
    That's six or more sections, too many for tabs at 375 px.
  - Use anchor links with `scroll-margin-top`, and update the active item on scroll
    (an `IntersectionObserver`).
- **Each section is a summary card** showing the current values in readable form.
  - Simple text fields (title, location, description, duration) edit **in place** in
    the card.
  - Lists (price options, inclusions, stops) show compact rows, and adding or editing one
    item opens the shared **`Modal`** (see C).
- **Sticky save bar** at the bottom of the viewport, shown only when there are unsaved
  changes:
  - "3 unsaved changes", a **Discard** button (with `ConfirmDialog`), and the primary
    **Save** button;
  - for published packages, the bar says when saving will send the package back for
    review, and the button reads "Save and send for review" in that case;
  - drafts get a second button, **Submit for review**, enabled only when the package is
    valid and saved;
  - the bar never covers the last field: add bottom padding equal to its height, and keep
    it above the mobile tab bar (`role-tab-bar.tsx`).
- **Leaving with unsaved changes:** warn with a `beforeunload` guard, and use
  `ConfirmDialog` for in-app links, e.g. the breadcrumb.
- **Saving feedback:**
  - the button shows a spinner and "Saving…";
  - on success, a toast ("Saved" or "Sent for review"), and the dots clear;
  - on failure, the error appears in the bar, and the bad section scrolls into view with
    the first invalid field focused;
  - keep the existing stale-edit check (`expected_updated_at`) and explain it in plain
    words if it triggers: "This package was changed somewhere else. Reload to see the
    latest version."
- **Optional draft recovery:** keep unsent edits in `localStorage` per package, so a
  reload doesn't lose them, with a "Restore unsaved changes?" notice. Wrap all storage
  calls in try/catch. Ask the owner whether they want this.

#### B. Forms

- Use `Field` + `Input` / `Textarea` / `Select` everywhere, so labels, hints, character
  counters, errors and `aria-describedby` are consistent.
- Validate on blur and on save, not on every keystroke. Show errors under the field in
  plain words, and a short summary at the top of the section when it has errors.
- **Locked fields** (by status, from `permissions.ts`): show them as read-only text with
  a lock icon and one line, "Changes through review — copy to a new draft to change
  this." Don't show a disabled input that looks broken. Keep `permissions.ts` the single
  source of truth for both client and server.
- Use the right input types and keyboards:
  - `inputmode="decimal"` for prices, with a peso prefix;
  - `inputmode="numeric"` for counts;
  - number-of-guests ranges as a "From 1 to [ ] guests" pair, with "No limit" as a
    checkbox instead of "leave blank".
- **Duration:** a number plus an Hours / Days select, as now. Show a live preview such as
  "3 days 2 nights" only where the data really supports it; don't invent nights.
- Keep descriptions as a `Textarea` that grows with its content, with a character counter.

#### C. Modals: when and how

Use the shared `Modal` (and `ConfirmDialog`) for **adding or editing one item in a
list**, and for confirmations. Don't use modals for simple text fields; those edit in
place.

- **Price option modal:**
  - name, guests from–to, price per guest **or** flat price (a segmented control between
    the two), and "Make this the default";
  - if trip-details pricing is merged: child price and group deal, in a collapsible
    "More pricing options" part.
- **Inclusion modal:** the text, plus "Included" / "Not included" as a segmented
  control. "Add another" keeps the modal open for quick entry of several items.
- **Stop modal:** see D for choosing the place.
- **Footer:** Cancel and Save. Save applies the change to the local form state; it does
  not save to the server, since the sticky bar does that. Say so in the modal hint:
  "You'll save everything with the Save button."
- **Confirmations** (`ConfirmDialog`): Discard all changes, Delete a price option that
  bookings use (if the server says so), and Submit for review.
  - **Deleting a list row** uses undo ("Removed · Undo", about 5 s) instead of a confirm
    dialog, the same pattern as the gallery.
- **Phones:** modals dock as bottom sheets (the shared `Modal` already does this). Fields
  stay visible above the on-screen keyboard, and Save sits in a sticky footer inside the
  sheet.

#### D. Dropdowns for long lists

The rule: **up to about 5 options → segmented control or radio buttons; 6–15 →
`Select`; more than 15, or anything people search by name → a searchable dropdown
(combobox).**

- **Stop location → searchable combobox of attractions.**
  - Type "Bagasbas" and pick "Bagasbas Beach". The name, coordinates and a short
    description fill in from `tours_attractions`; query only active rows, ordered by name.
  - Show a small map preview with the pin (`FreeMap`, with the sketch-map fallback), and a
    "Not in the list? Pick on the map" option that lets the operator tap the map to set
    the point.
  - Never ask for typed latitude and longitude. Keep the coordinates in an "Advanced" part
    for admins if they're needed.
  - Don't invent coordinates or places: only attractions in the database, or the point the
    operator picks.
- **Section navigation on phones:** the "Jump to section" dropdown (see A).
- **Inclusions with more than 6 items:**
  - show the first 5 plus "Show all 13". Expanding is a disclosure, not a new page.
  - Optional: suggested common items ("Boat transfer", "Life vest", "Meals",
    "Environmental fee") as quick-add chips. Each suggestion is only a starting text the
    operator can edit, never added automatically.
- **Price options with more than 4:** compact rows, plus a "Show all" disclosure.
- **Row actions:** replace the repeated ↑ ↓ Edit Delete buttons on every row with a
  **"⋯" menu** (Edit, Move up, Move down, Delete), built with `use-popover.ts`. Allow
  drag-to-reorder with dnd-kit where order matters (inclusions, stops), reusing the
  gallery's sortable setup and its keyboard support.
- Build the combobox once as `src/components/ui/combobox.tsx`:
  - accessible, following the ARIA combobox pattern: `role="combobox"`, `aria-expanded`,
    `aria-activedescendant`, a `listbox` of `option`s;
  - arrow keys, Enter and Esc;
  - type to filter, with a "No matches" state.
  - Add unit tests next to the existing UI kit tests.

#### E. Package list (`packages/page.tsx`) and overview (`[id]/page.tsx`)

- **List:**
  - cards with the cover photo, title, status badge, the next open date, and the price
    from the default option;
  - a **status filter** as a `Select` on phones and tabs on desktop (All, Drafts, In
    review, Published, Rejected, Archived), and a search box once there are more than
    about 8 packages;
  - one primary action per card ("Edit"), with the rest in a "⋯" menu (View public page,
    Open dates, Copy to new draft, Archive).
- **Overview:**
  - a checklist of what's missing before the package can be submitted or booked: cover
    photo, at least one price option, at least one stop, open dates;
  - each item links straight to the section that needs it.

#### F. Create wizard (`create/`)

- Use the same field components, modals and combobox as the editor, so creating and
  editing feel the same.
- Show a progress indicator ("Step 2 of 5: Prices"), and save the draft after each step,
  so leaving partway keeps the work. Check how `create/actions.ts` creates the package
  first.
- The last step is a review page that reuses the editor's section summary cards.

#### G. Visual and accessibility rules

- **Design rules:** follow `src/components/ui/design-rules.test.ts`: no resting shadows,
  no eyebrow or uppercase-tracking labels, `rounded-2xl`, no `bg-white` except exempt
  lines.
- **Layout:** light and dark themes, 375 px with no horizontal scroll, and 44 px minimum
  tap targets.
- **Keyboard and screen readers:** everything works by keyboard. Modals return focus to
  the button that opened them. Saving status and errors are announced (`aria-live`).
- **Motion:** quick (150–250 ms), transform and opacity only, and none under
  `prefers-reduced-motion`, the same rules as the gallery.
- **Language:** plain, friendly English, the same terms everywhere:
  - "price option", not "variant";
  - "What's included", not "Inclusions & Exclusions";
  - "Route & stops".
  Keep labels short. Don't invent facts, prices or places.

### Order of work (separate commits, each with its tests)

1. Shared pieces:
   - `combobox.tsx`;
   - a `SectionCard` (summary + inline edit);
   - a `RowMenu` ("⋯");
   - a `StickySaveBar` with the dirty count, using `change-detection.ts`;
   - an unsaved-changes guard hook.
2. Editor structure: header, section nav (sidebar plus the phone dropdown), save bar,
   leave guard, and saving feedback.
3. Basics and the published-package locked-field treatment.
4. Prices and What's included: the shared `Modal`, the row menu, "Show all", undo
   delete, and reordering.
5. Route & stops: the attraction combobox, the map preview, and pick-on-map.
6. Photos: fit the existing cover and gallery components into the new section cards.
7. Package list and overview checklist.
8. Create wizard alignment.

### Ground rules

- **Plan first.** Send the owner a short plan with rough wireframes (ASCII or
  screenshots) of the editor at 375 px and 1280 px, and wait for their OK before coding.
  Ask them about draft recovery (A) and suggested inclusion chips (D).
- Stay on your branch. **No pull request** unless the owner says "make PR".
- **No database changes are expected.** Saving keeps using the existing actions and RPCs,
  and the status rules stay in `permissions.ts` and the database guard. If you think you
  need a migration, stop and ask: migrations go to production only with the owner's
  explicit yes.
- Never print or commit secrets. Never skip, disable or quarantine a test.
- End every commit message with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01FH1Apt7Sb28d1BVdJ8Loxp
  ```

### Tests

- **Unit (Jest + Testing Library):**
  - combobox: filtering, keyboard, selection, empty state;
  - save bar: shows the count, hides when clean, Discard restores the original;
  - leave guard;
  - every list modal: adds, edits, validates, Cancel leaves state untouched;
  - locked fields render read-only per status (draft, published, in review, archived);
  - stop picker fills the name and coordinates from an attraction;
  - "Show all" disclosure;
  - undo delete.
- **Keep passing:** `permissions`, `change-detection`, `validation`, `edit-order`,
  `image-actions` and gallery tests, `design-rules.test.ts`, and the UI kit tests.
- **e2e (Playwright with axe, 375 px and 1280 px, mock Supabase in `e2e/mock-supabase.cjs`):**
  - edit a draft: change the title, add a price option in the modal, add a stop by
    searching an attraction, save, and see the toast and the values after reload;
  - published package: locked fields show the lock text, and the save bar says it will
    send for review when needed;
  - navigating away with unsaved changes shows the confirm;
  - phone: the "Jump to section" dropdown scrolls to the section;
  - no axe violations.
- **Commands:**
  - `npx tsc --noEmit`
  - `npm test`
  - `rm -rf .next && NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build`
  - `npm run test:e2e`

### Done means

- An operator on a phone can find any section in one tap, edit a field in place, and add
  or edit a price option, inclusion or stop in a modal.
- They always see whether there are unsaved changes, and save them in one place.
- Stops are chosen by name or on a map, never by typing coordinates.
- Long lists are collapsed, or use dropdowns and searchable dropdowns per the rule in D.
- Published-package limits are explained up front.
- The create wizard uses the same pieces.
- Screenshots at 375 and 1280 px, in light and dark, plus a short screen recording of an
  edit-and-save, are sent to the owner. All checks pass.
