# Prompt for Arena: gallery drag-to-reorder, upload loading tiles, animation, better layout

Copy everything below to Arena.

You're working on CONNECT-Daet (`tellmemaya25-lang/daet-connect.ph`). It's a Next.js 16
App Router app with Tailwind v4 and Supabase. Read `AGENTS.md` and the relevant guide in
`node_modules/next/dist/docs/` before writing code.

### Where you're starting from

Your branch **`arena/2f2dab27-daet-connect-ph`** already has a first version of this work:
- `9b8060f` fixes package image uploads;
- `8392d0e` adds drag-and-drop and gallery reordering;
- `d8281f2` uploads a batch of photos at once;
- `91ad18c` puts a spinner inside the upload button.

**Build on that branch**, or on `main` if it has been merged by then. Don't start over.

The relevant files are in `src/app/(subsystems)/tours/operator/packages/[id]/edit/`:
- `GalleryStep.tsx`: the gallery section of the operator's Edit Package page;
- `use-sortable-list.ts`: drag to reorder, using native HTML5 drag events;
- `use-file-drop.ts`: dropping files from the computer to upload them;
- `edit-order.ts`: `moveItem` / `withDisplayOrder`, which keep positions 1..n;
- `actions.ts` (`uploadPackageImage`) and `permissions.ts`;
- tests: `use-sortable-list.test.tsx`, `use-file-drop.test.tsx`, `edit-order.test.ts`, `image-actions.test.ts`.

### What the owner sees today (from their screenshot of `/tours/operator/packages/[id]/edit`)

- A 4-column grid of 8 photo cards. Each card has a number badge, "No caption", ↑ ↓
  and "Caption" buttons, and a full-width red "Delete" button. That's four controls
  under every photo, which is heavy and repetitive.
- A blue "+ Add Image" button top right, and the hint "Drag photos here to upload them,
  or drag a photo onto another to reorder."
- A box with formats, size and the count limit, and a yellow warning that adding,
  removing or reordering photos on a published package sends it back for review.

### The four things the owner wants

#### 1. Drag a photo to rearrange, with the photos moving as you drag

The current hook uses native HTML5 drag-and-drop. It doesn't work on phones or tablets,
gives no live preview (you drop onto a card and the order jumps), and can't be used from
the keyboard.

Replace the reordering with a proper sortable grid:
- **Library:** use `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`.
  - Install exact versions that are at least two weeks old, and commit the lockfile.
  - It handles mouse, touch and keyboard, and has screen-reader announcements.
  - If you'd rather not add a dependency, build it on Pointer Events instead, but it
    must give the same behaviour.
- **While dragging:**
  - the picked-up photo follows the pointer, slightly lifted (a small scale and a ring,
    no resting shadows per the design rules), using a `DragOverlay`;
  - the other photos **slide aside live** to show where it will land
    (`rectSortingStrategy`), and the empty slot shows a dashed outline;
  - number badges update to the new order on drop.
- **Sensors:**
  - `PointerSensor` with a small activation distance (about 6 px), so clicks and caption
    edits don't start a drag;
  - `TouchSensor` with about a 200 ms press-and-hold, so scrolling the page on a phone
    still works;
  - `KeyboardSensor` with `sortableKeyboardCoordinates`.
- **Drag handle:** a grip icon button on each card, `aria-label="Move photo n"`. Allow
  dragging the whole photo with a mouse too.
- **Keyboard and screen readers:**
  - Space picks a photo up, arrow keys move it, Space drops, Esc cancels.
  - Provide plain-language announcements, e.g. "Photo 3 moved to position 1."
  - Keep "Move earlier" / "Move later" in each card's menu (section 3) as a fallback.
- **Saving:** keep using `moveItem` + `withDisplayOrder` from `edit-order.ts`, so
  positions stay 1..n and the existing save path and database guard keep working.
- **Status rules:** respect `permissions.gallery.reorder` and the existing rules for
  published packages. A reorder on a published package still sends it back for review,
  so the warning (section 3) must be visible before the person drags.
- **Uploads from the computer:** keep `use-file-drop.ts`. A drag that carries files is an
  upload, never a reorder. Make sure dnd-kit and the file drop don't fight each other.
- **Reduced motion:** with `prefers-reduced-motion`, no slide animations; items simply
  swap places.
- **Remove what's left over:** delete `use-sortable-list.ts` and its test, or keep the
  test's behaviour covered by new tests. Don't leave dead code. Never skip a test.

#### 2. A loading indicator in the gallery while photos upload

The button spinner exists. Now show the upload **where the photo will appear**:
- **Placeholder tiles:** as soon as files are picked or dropped, add one tile per file
  at the end of the grid.
  - Show a local preview with `URL.createObjectURL`, dimmed, with a spinner and
    "Uploading…" over it. Revoke the object URLs afterwards.
  - Don't invent a percentage: the server action gives no progress events. Show
    "2 of 5" at the batch level only.
- **On success:** the tile becomes the real photo card in place, with no layout jump.
- **On failure:** the tile shows the error message from the action, with "Try again"
  and "Remove" buttons.
- **While uploading:**
  - the button keeps its spinner and is disabled;
  - placeholder tiles can't be dragged;
  - the counter counts them toward the 20-photo limit.
- **Accessibility:**
  - an `aria-live="polite"` region announces "Uploading 2 of 5" and then "5 photos added";
  - spinners use `motion-reduce:animate-none`.

#### 3. A better layout (proposal; build it after a quick OK from the owner)

- **Header row:**
  - "Gallery" on the left, with the count "8 of 20 photos" and a one-line hint: "Drag to
    reorder. The first photo is shown first on the package page."
  - The Add button on the right, labelled "Add photos" (it accepts several files).
  - Move formats, size and the limit into one short line of help text under the grid,
    instead of a separate box.
- **Review warning:**
  - On published packages, show it at the **top** of the section, so it's read before
    anyone drags or deletes.
  - After an add, remove or reorder, change it to a short "Unsaved changes: saving sends
    this package back for review" notice.
- **First photo as the lead:**
  - At `lg` and up, photo 1 is a large tile spanning 2×2 with a "First photo" label, and
    the rest flow around it.
  - Grid: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`, square tiles (`aspect-square`,
    `object-cover`), `gap-3`.
- **Cleaner cards:** the photo fills the card.
  - Top-left: the number badge. Top-right: the drag grip and a "⋯" menu button.
  - Caption on the photo's lower edge over a dark gradient. If empty, show "Add caption"
    as a subtle button, and edit it inline in place.
  - The "⋯" menu holds: Edit caption, Move earlier, Move later, Make first photo, and
    Delete (in red, last).
  - That replaces the four buttons under every card. On touch devices the grip and menu
    are always visible; on desktop they're visible at reduced opacity and fully on
    hover/focus, never hidden from keyboard users.
- **Delete with undo:** remove the card right away and show "Photo removed · Undo" for
  about 5 seconds. Nothing is saved until the form is saved, so undo just restores local
  state. Use this instead of a confirm dialog.
- **An "Add photos" tile at the end of the grid:** dashed border, plus icon, "Add photos
  or drop them here". It's also the file drop target, and it's hidden at 20 photos. The
  whole section still accepts dropped files, with a clear highlight while files are
  dragged over.
- **Empty state:** one large dashed drop area with "Add photos" and the help line.
- **Design rules:**
  - Follow `src/components/ui/design-rules.test.ts`: no resting shadows, no
    eyebrow/uppercase-tracking labels, `rounded-2xl`, no `bg-white` except exempt lines.
  - Support light and dark themes and phone width (375 px) with no horizontal scroll.

#### 4. Animation: make every change feel smooth, and never make anyone wait

Motion here should explain what happened (where the photo went, what got added or
removed). It isn't decoration. Keep it quick so it doesn't slow down someone sorting
20 photos.

**Rules for all motion**
- Animate only `transform` and `opacity`, never `width`, `height`, `top` or `left`, so
  it stays smooth on mid-range phones.
- Durations:
  - **150–200 ms** for small feedback (hover, press, pick-up);
  - **200–250 ms** for things moving into place;
  - nothing over **300 ms**.
- Easing:
  - things settling into place use `cubic-bezier(0.2, 0, 0, 1)` (fast out, gentle stop);
  - things leaving use `ease-in`;
  - no bouncy springs, since this is a work screen.
- Everything is interruptible: a new drag, upload or click must never wait for an
  animation to finish.
- Define the shared values once (duration and easing tokens, e.g. CSS variables or Tailwind
  theme values in `src/app/globals.css`) and reuse them.

**Drag to reorder**

| Moment | What happens |
|---|---|
| Hover over a photo (mouse) | The grip and "⋯" menu fade from reduced opacity to full, 150 ms. The cursor becomes `grab`. |
| Pick up (drag starts) | The dragged copy in the `DragOverlay` scales to about 1.03 with a 2 px ring in the accent colour, 150 ms. The original slot fades to 40% opacity with a dashed outline. Cursor `grabbing`. |
| Moving over the grid | The other photos slide to their new spots with dnd-kit's sortable transitions, about 200 ms with the easing above. Use `CSS.Transform.toString` and `transition` from `useSortable`. |
| Drop | The overlay glides into the open slot and the scale returns to 1. Use dnd-kit's `dropAnimation` (about 200 ms, same easing). Number badges change on drop only, without animating. |
| Cancel (Esc, or dropped outside the grid) | The photo glides back to where it started, using the same drop animation. |
| Keyboard move | The same slide as a mouse drag. The focused card keeps a clear focus ring the whole time, and the screen-reader message is sent once the move finishes. |
| Long-press on a phone | After the ~200 ms hold, the card scales to about 1.03 to show it's picked up. Optionally vibrate briefly with `navigator.vibrate?.(10)`, only where supported. |

**Uploads**

| Moment | What happens |
|---|---|
| Files picked or dropped | Each placeholder tile fades in (opacity 0→1, translateY 4px→0), 200 ms, staggered about 40 ms per tile with at most 5 staggered. |
| While uploading | The preview sits dimmed with a spinner. The spinner is the only thing that moves continuously. |
| Upload finishes | The real photo cross-fades over the preview (150 ms), and the spinner fades out in the same tile, so nothing jumps. |
| Upload fails | The tile's overlay changes to the error state with a 150 ms fade. No shake. |
| Files dragged over the section | The drop highlight (ring and tint) fades in, 150 ms, and fades out when the files leave or are dropped. |

**Delete and undo**
- **Delete:** the card fades and shrinks slightly (opacity 1→0, scale 1→0.96) over
  150 ms. The other photos then slide in to fill the gap with the same 200 ms sortable
  movement. Animate the neighbours moving with transforms (a FLIP approach); don't
  animate the grid's height.
- **"Photo removed · Undo" bar:** it slides up and fades in, 200 ms. It fades out after
  about 5 seconds or when Undo is pressed.
- **Undo:** the photo fades back in at its old position, and the neighbours slide aside.

**Other small moments**
- The "⋯" menu opens with a fade and a 0.98→1 scale from its button (150 ms), and closes
  faster (100 ms).
- "Make first photo": the photo moves to position 1 with the same slide as a drag.
- The review warning changing to "Unsaved changes…": a cross-fade of the text, no
  movement.

**Reduced motion (`prefers-reduced-motion: reduce`)**
- No sliding, scaling, gliding or staggering. Items appear in their new place at once,
  and the drop animation is set to `null`.
- Short opacity fades (100 ms or less) may stay. The spinner becomes a static
  "Uploading…" label (`motion-reduce:animate-none`).
- Never rely on motion alone to explain a change: the number badges, the live region and
  the focus ring still say what happened.

**Animation checks**
- Unit tests:
  - with reduced motion emulated, the drop animation is off and no transition classes
    are applied;
  - cards being removed are skipped by assistive technology (`aria-hidden` while
    fading out) and are removed from the DOM afterwards.
- e2e:
  - one run with `page.emulateMedia({ reducedMotion: "reduce" })`, checking reorder
    still works;
  - wait for the end state (order and badges), never for fixed sleeps.
- Check in Chrome DevTools Performance with 4× CPU slowdown at 375 px: dragging a photo
  across 20 photos stays smooth (no long tasks over 50 ms during the drag).
- Record a short screen capture of drag, upload, delete and undo for the owner, along
  with the screenshots.

### Ground rules

- **Plan first.** Send the owner a short plan, including the layout proposal, and wait
  for their OK before coding.
- Stay on your branch. **No pull request** unless the owner says "make PR".
- No database changes are needed for this. If you find you need one, stop and ask:
  migrations go to production only with the owner's explicit yes.
- Never print or commit secrets. Don't invent photos, captions or facts.
- End every commit message with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01FH1Apt7Sb28d1BVdJ8Loxp
  ```

### Tests

- **Unit (Jest + Testing Library):**
  - keyboard reordering moves items and renumbers them 1..n;
  - a drag carrying files doesn't reorder;
  - reordering is disabled when `permissions.gallery.reorder` is false;
  - placeholder tiles appear per file and turn into cards or error tiles;
  - undo restores a deleted photo;
  - the counter includes uploading tiles.
- **Keep passing:** `edit-order.test.ts`, `use-file-drop.test.tsx`,
  `image-actions.test.ts`, `design-rules.test.ts`.
- **e2e (Playwright, 375 px and 1280 px, with axe):**
  - on a draft package in the mock (`e2e/mock-supabase.cjs`), reorder with the keyboard
    and with a mouse drag (`page.mouse` down, move in steps, up);
  - upload two files and see the loading tiles, then the cards;
  - no axe violations.
- **Commands:**
  - `npx tsc --noEmit`
  - `npm test`
  - `rm -rf .next && NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build`
  - `npm run test:e2e`

### Done means

- Photos can be rearranged by dragging with a mouse, by press-and-hold drag on a phone,
  and with the keyboard. The other photos slide aside live, and the new order saves.
- Each uploading photo shows as a tile with its preview and a spinner where it will
  land, and failures can be retried.
- The new card layout is in place, after the owner's OK.
- Animations follow section 4: quick, interruptible, transform/opacity only, and fully
  calmed under reduced motion. A short screen recording of them is sent to the owner.
- Screenshots at 375 and 1280 px, in light and dark, are sent to the owner. All checks
  pass.
