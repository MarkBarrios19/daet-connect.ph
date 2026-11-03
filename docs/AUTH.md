# Sign in, sign up, Google and email verification

Reviewed and rebuilt on 2026-11-03. This is the record of the audit, the
decisions behind the new flows, and the dashboard settings the app cannot make
for itself.

---

## 1. What was wrong

The sign-in and sign-up pages worked, in the sense that a visitor could get a
session. Everything around that was weak.

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | **Email confirmation was switched off, and the app depended on it.** `signUp` signed the new account in immediately, with `emailRedirectTo: undefined`. `supabase/migrations/APPLY_THIS_disable_email_confirm.sql` had mass-confirmed every account and told the operator to turn the switch off. Anyone could register `someone@else.ph` and use the site as them — including an address that belongs to an official. | Critical | **Fixed**: sign-up no longer signs in; a session handed out without confirmation (a misconfigured project) is thrown away and reported. The script is deleted and replaced by `APPLY_THIS_enable_email_confirm.sql`. |
| 2 | **No email verification existed at all**: no landing page for the link, no "your address is not confirmed yet" state, no way to ask for another link. | Critical (same root) | **Fixed**: `/auth/callback` completes both shapes of link, `/verify-email` resends, sign-in recognises an unconfirmed account and offers a new link. |
| 3 | **Sign-up leaked which addresses have accounts.** `error.message.includes("already registered")` produced "This email is already registered." That is a free account-enumeration oracle on a public form. | High | **Fixed**: one answer for new and existing addresses, and the "existing user with no identities" case Supabase returns is treated the same way. |
| 4 | **Raw provider errors were shown to visitors.** `return { message: error.message }` printed GoTrue's own words (mailer limits, SMTP failures, internal codes). | Medium | **Fixed**: a short mapping in `src/lib/auth/errors.ts`; anything unrecognised becomes one calm sentence and the detail goes to the server log. |
| 5 | **Input was barely validated.** `email` was only checked for presence; `password.length < 8` was the whole policy; the name was not checked at all. A 10 MB string, a newline, or a bidi override went straight to the auth service. | High | **Fixed**: one zod schema set (`src/lib/auth/validation.ts`) shared by the forms and the Server Actions, which are the real gate. |
| 6 | **No rate limiting of our own.** A script could try thousands of passwords, or use the sign-up form to post mail to strangers; Supabase's limits are per address, so they catch neither. | High | **Fixed**: `src/lib/auth/rate-limit.ts`, with per-IP and per-address windows on sign-in, sign-up, resend and reset. |
| 7 | **Timing told the two failures apart.** "No such address" came back faster than "wrong password". | Low | **Fixed**: every sign-in answer takes at least 400ms. |
| 8 | **The email link was built from the `Host` header.** A forged header could point the link at another site (Supabase's allow list then refuses it, so this was defence in depth). | Low | **Fixed**: `authOrigin()` prefers `NEXT_PUBLIC_APP_URL` and otherwise accepts only a bare, well-formed hostname. |
| 9 | **Where to land after sign-in travelled in the email link.** `redirectTo` carried `?next=`; anyone who saw the message could edit it. `safeNextPath` blocked the off-site consequence, but the pattern is wrong. | Low | **Fixed**: the destination is a short-lived, http-only cookie of the browser that asked (`daet-auth-next`), still run through `safeNextPath` on the way out. |
| 10 | **Sign-out was a bare POST with no origin check**, and ended only the current session. | Low | **Fixed**: origin-checked, `scope: "global"`, `Cache-Control: no-store`. |
| 11 | **No Google sign-in**, so every visitor had to invent and remember another password. | Feature | **Added**: `GET /auth/oauth`, a Google button on both forms, PKCE flow, account chooser on shared devices. |
| 12 | **No security headers.** | Low | **Fixed**: `nosniff`, `Referrer-Policy`, `X-DNS-Prefetch-Control`, and HSTS in production (`next.config.ts`). A full CSP is deliberately left for a change that can test the maps and gallery against it. |
| 13 | **Reset-password left other sessions alive**, and a reset was accepted for a weak password. | Medium | **Fixed**: shared password policy, and `signOut({ scope: "others" })` after a change. |

Not changed, and worth knowing: the reset and confirmation links depend on
Supabase's own signed, single-use tokens. Using the `{{ .TokenHash }}` template
(§5) is what makes them work across devices.

## 2. How the flows work now

```
sign-up ──► Supabase sends a link ──► /auth/callback ──► session ──► next page
   │                                     ▲                              ▲
   └── no session, "check your inbox"    │                              │
                                         │                              │
Google ──► /auth/oauth ──► Google ──► /auth/callback ──────────────────┘
```

- **Sign-up** (`src/app/signup/actions.ts`) validates, rate-limits per IP,
  creates the account with `emailRedirectTo` = `<origin>/auth/callback`, and
  remembers `next` in a cookie. It returns `check-email` — never a session. If
  Supabase hands back a session anyway, the session is signed out and the visitor
  is told the project is misconfigured, because that is the only honest reading.
- **Sign-in** (`src/app/login/actions.ts`) validates, rate-limits per IP and per
  address, answers failures identically, and refuses a session whose
  `email_confirmed_at` is empty. An unconfirmed account gets a warning with a
  link to `/verify-email?email=…`.
- **Google** (`src/app/auth/oauth/route.ts`) starts the PKCE flow with
  `prompt=select_account`, and only ever follows a URL on the configured Supabase
  origin. The PKCE verifier cookie is written onto the redirect response
  explicitly — without that the callback would arrive with nothing to exchange.

  **The round trip stays on the host it started on.** `redirectTo` is built from
  the request's own host (`requestOrigin`), never from `NEXT_PUBLIC_APP_URL`:
  the verifier is a cookie *for that host*, so a code delivered to another alias
  of the same site can never be exchanged, and the visitor is left signed out
  with nothing to read. `NEXT_PUBLIC_APP_URL` is for the links in emails, which
  have to work on whatever device the inbox is on. Both hosts must appear in
  Supabase's redirect allow list, with the scheme (`https://…`), or Supabase
  refuses the redirect and drops the code on the Site URL instead.
- **Callback** (`src/app/auth/callback/route.ts`) accepts `?code=` (default
  templates) and `?token_hash=&type=` (`.TokenHash` templates), exchanges on the
  server, and redirects to the remembered page. Codes and tokens never stay in
  the address bar. Failures go to `/login` or `/forgot-password` with a sentence
  that says what to do next — a cancelled Google prompt, a provider still
  switched off in the dashboard, credentials Google refused and an unconfirmed
  address each get their own. A code that still lands on the site's root (which
  is what Supabase's Site URL fallback does) is handed to the callback by
  `src/proxy.ts`, but only when this browser holds the verifier, so it can
  actually be exchanged.
- **Resend** (`src/app/verify-email/actions.ts`) always answers the same thing,
  whatever the address is or whether Supabase accepted it.
- **Sign-out** (`src/app/auth/logout/route.ts`) ends every session of the account,
  and ends the one in this browser even if the auth service cannot be reached.
  Its same-site check compares the *host* the request arrived on, not the whole
  origin: a preview deployment, a LAN address and a custom domain are the same
  site, and comparing origins signed nobody out of anything.

  The session refresher in `src/proxy.ts` skips `/auth/oauth`, `/auth/callback`
  and `/auth/logout`: those three end or replace the session themselves, and a
  refresh in front of them wrote a fresh cookie onto the same response a sign-out
  was deleting it from — the visitor stayed signed in after clicking Sign out.

  Two variables decide which host email links name: `NEXT_PUBLIC_APP_URL` if it
  is set, otherwise the request's own host. Set it to the origin you actually
  browse — a stale `http://localhost:3000` copied from `.env.example` builds
  every confirmation and reset link against your own machine.

## 3. Input validation, in one place

`src/lib/auth/validation.ts` is imported by the forms (to be helpful) and by the
Server Actions (to be safe). A Server Action is a public endpoint: the browser's
`required`, `minLength` and `type=email` are conveniences, not checks.

| Field | Rule | Why |
|---|---|---|
| Email | trimmed, lower-cased, ≤254 chars, one `@`, a dot in the domain, no spaces or control characters | Lower-casing is the only normalisation that is safe everywhere; `+` tags and dots stay as typed. |
| Password | 8–72 characters, not only spaces, more than two distinct characters, not on a common-password list | 72 is bcrypt's limit: past it the password is silently cut, so two different long passwords would open the same account. No composition rules — NIST asks for length and breach checks, not `Aa1!`. |
| Confirm | must equal the password; the message is attached to the second field | The second field is the one with the mistake. |
| Full name | 2–80 characters, letters and marks plus space, hyphen, apostrophe, dot, comma; no digits, no control characters, no bidi overrides; runs of spaces collapsed | A name is displayed on badges, tickets and chats. A bidi override is how a name renders as someone else's. |

Sign-in deliberately checks only that a password is present: a rule added today
must not lock out an account created under yesterday's rule.

## 4. Rate limits

`src/lib/auth/rate-limit.ts`, sliding windows in process memory (bounded to 5,000
keys). On one Node server the windows are exact; across serverless instances each
instance keeps its own, which still stops a single client's burst and never lets a
key grow without limit. If the site is ever spread over many instances and this
needs to be global, move the counter to Postgres or Upstash — the call sites do
not change.

| Action | Window |
|---|---|
| Sign-in, per IP | 20 / 10 min |
| Sign-in, per account | 6 / 15 min |
| Sign-up, per IP | 10 / hour |
| Resend, per IP | 10 / hour |
| Resend, per address | 3 / 15 min |
| Reset, per IP | 10 / hour |
| Reset, per address | 3 / 15 min |
| OAuth starts, per IP | 30 / 10 min |

## 5. What the dashboard still has to do

The app cannot create a Google client, and it cannot switch Supabase's own
confirmation check on. These are the steps, in order.

1. **Confirm email ON.** Authentication → Sign In / Providers → Email →
   *Confirm email*. This is the setting the old migration told you to switch off.
2. **URL configuration.** Authentication → URL Configuration:
   - Site URL: the address visitors actually use, with its scheme —
     `https://daet-connect-ph.vercel.app` for this project.
   - Redirect URLs, **each written as a full URL with `https://`** (an entry that
     is only a hostname never matches, and Supabase then falls back to the Site
     URL, dropping the sign-in code on the home page):

     ```
     https://daet-connect-ph.vercel.app/**
     https://daet-connect-ph-<team>.vercel.app/**
     https://daet-*-<team>.vercel.app/**      # preview deployments
     http://localhost:3000/**
     ```

   Every alias the site is browsed at has to be listed, because a Google
   round trip comes back to the host it started on.
3. **Google provider.** Google Cloud Console → APIs & Services → Credentials →
   *Create OAuth client ID* → Web application:
   - Authorised JavaScript origin: `https://<your-domain>`
   - Authorised redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
     (Supabase's callback, not ours — it is the party Google talks to.)
   - OAuth consent screen: app name "CONNECT-DAET.ph", your support email, scopes
     `openid`, `email`, `profile`. While the app is in *Testing*, only listed test
     users can sign in; publish it before evaluation.
   Then Supabase → Authentication → Providers → Google: paste the client ID and
   secret, enable. The secret belongs in the dashboard, never in this repo.
4. **A mail server that can reach strangers.** Authentication → SMTP Settings.
   Supabase's built-in email service only delivers to addresses on your own team
   and is capped at a couple of messages an hour — fine for testing your own
   address, useless for real visitors. Point it at a transactional provider
   (Resend, Brevo, SendGrid, Amazon SES) with a verified sending domain before
   you turn confirmations on for the public. Until then, sign-up is honest: it
   says to check the inbox, and no link arrives.
5. **Email templates.** Authentication → Email Templates. Replace the link in
   *Confirm signup*, *Magic Link*, *Reset password* and *Change email address*
   with the `{{ .TokenHash }}` form, so a link also works on a second device:

   ```html
   <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup">Confirm your email</a>
   ```

   `type=recovery` for *Reset password*, `type=email_change` for *Change email
   address*. The app accepts this shape and the default `{{ .ConfirmationURL }}`
   shape.
6. **Passwords.** Authentication → Passwords → *Leaked password protection* ON
   (Have I Been Pwned check), and keep the minimum length at 8 or higher.
7. **Rate limits.** Authentication → Rate Limits: no looser than 2 sign-ups/min,
   30 verifications/min, 2 emails/hour per address.
8. **`NEXT_PUBLIC_APP_URL`** in production env (`.env.example` has it). It fixes
   the address used in the links Supabase sends (confirmation, reset, resend), so
   a mail is never built from a header alone. It does **not** move a Google
   sign-in: that round trip always returns to the host the visitor is on. Without
   it the app falls back to the request's host, which is correct but one proxy
   configuration away from being wrong.

## 5a. An account made before Google sign-in was switched on

Nothing special is needed, and nothing is lost. When Google reports an address
that already belongs to an account — with that email confirmed, which the sign-up
flow requires — Supabase attaches the Google identity to **that** account instead
of making a second one. The visitor keeps their bookings, messages and role, and
can still sign in with their password. This has happened in the live project:
`tellmemaya25@gmail.com`, `tellmemaya25.4@gmail.com` and `barlanjayson968@gmail.com`
each carry both an `email` and a `google` identity on one user id.

Two things it will not do:

- **A different Google address is a different person.** Signing in with
  `someone-else@gmail.com` creates a new account with that address; Google has
  not proved anything about the older one. To reach the older account, sign in
  with the Google address that matches it, or use the password.
- **An unconfirmed address is not linked.** The account has to have confirmed its
  email first (`mailer_autoconfirm` is off). The sign-in form says so when it
  sees an unconfirmed account, and `/verify-email` can send a fresh link.

Nothing about Google's client secret or Supabase's keys is stored in this repo;
`.env.example` lists only what the app itself reads.

## 6. What is tested

Unit and Server Action tests (`npm test`), all with the auth service mocked:

- `src/lib/auth/validation.test.ts` — 45 cases across email, password, name and
  the two-password match, including the inputs written to get past a naive check.
- `src/lib/auth/rate-limit.test.ts` — the window slides, keys are independent,
  and the windows stay tight.
- `src/lib/auth/request.test.ts` — the origin cannot be forged through `Host`,
  and the client address cannot become a key of its own choosing.
- `src/app/signup/actions.test.ts` — no session is issued; an existing address
  and a new one get byte-identical answers; a session from a misconfigured
  project is discarded; the loop stops at the rate limit.
- `src/app/login/actions.test.ts` — one vague sentence; the unconfirmed state;
  the redirect target cannot leave the site; the reply floor holds.
- `src/app/auth/callback/route.test.ts` — both link shapes, refused types, an
  open redirect in the cookie, and the session cookies landing on the redirect.
- `src/app/auth/oauth/route.test.ts` — provider, scopes, callback, chooser, and
  refusing a URL outside the configured project.
- `src/app/auth/logout/route.test.ts` — a cross-site POST is refused.
- `src/app/verify-email/actions.test.ts` — the same answer for every address.
- `src/app/login/login-form.test.tsx`, `src/app/signup/signup-form.test.tsx` —
  the Google link, the field errors, the "check your inbox" panel.

In a real browser (`npm run test:e2e:tours`, against the mock Supabase):
`e2e/auth.spec.ts` signs up and checks no session exists, tries a taken address,
sends bad input, is stopped at an unconfirmed sign-in, gets the vague wrong-
password answer, signs in properly, completes the Google round trip and the
verification link, and lands on advice rather than an error for an expired link.

## 7. Deliberate limits

- **No Multi-Factor Authentication yet.** Supabase supports TOTP; adding it is a
  later feature, not a fix.
- **Sessions are Supabase's own.** Cookie flags are set by `@supabase/ssr`
  (`HttpOnly`, `SameSite=Lax`, `Secure` on HTTPS). Sign-out is global, so a
  stolen cookie stops working at the next refresh.
- **Enumeration is not perfectly closed.** An unconfirmed account gets its own
  message, because that visitor needs a way forward. Everything else — a wrong
  password, an address with no account, a resend for any address — answers
  identically.
- **The rate limiter is per process.** See §4.
- **No CAPTCHA.** Turn on Supabase's Turnstile/hCaptcha option if the sign-up
  form is ever attacked at scale; the Server Action needs the token passed
  through, which is a small change in `signup/actions.ts`.
