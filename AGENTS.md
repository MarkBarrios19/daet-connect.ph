<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Working in this repo

- Domain terms (Ability, Basic mode, ...) are in `CONTEXT.md`. New assistant capabilities go in `src/lib/tours/assistant/abilities.ts`.
- Form controls use `src/components/ui/field.tsx`; `form-controls.test.ts` fails when a file gains raw `<input>`, `<select>` or `<textarea>`.
- E2E: `npm run test:e2e:tours` (mock Supabase). The default Playwright config has no Supabase and renders nothing. If the bundled Chromium is missing, set `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`.
- Typecheck: `npm run typecheck`. `next-env.d.ts` is generated and ignored.
- Database migrations are applied by the user in the Supabase SQL editor.
- After a PR merges, reset the work branch to `origin/main`, then push.

