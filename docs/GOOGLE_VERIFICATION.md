# Google OAuth API Verification — Owner Handoff (C10)

This document is the human-facing package for passing Google's OAuth API
verification for the **CalAssist** project. Everything code-side (C1–C9) is
implemented; this file tells you *what to click, what to write, and what to
record* in Google Cloud Console. Items marked **HUMAN** cannot be automated.

App: **CalAssist** — personal task & schedule assistant that reads/writes the
user's Google Calendar events.

---

## 0. Scopes we request (and nothing else)

| Scope | Where requested | Justification (use this wording in the console) |
| --- | --- | --- |
| `https://www.googleapis.com/auth/calendar.events` | Calendar connect flow (`google-calendar.adapter.ts:26`) | "CalAssist creates, updates and reads the user's own calendar events so scheduled work blocks, meeting prep reminders and plan changes appear in the user's calendar. Event-level access is the minimum needed; we do not request full calendar or settings access." |
| `openid` | Calendar connect flow + login flow | "Required to know which Google account is connecting so the stored calendar connection can be labelled with the account email the user sees in Settings." |
| `email` | Calendar connect flow + login flow | "Used only to display and store the account email that owns the connection; no marketing use, no sharing." |
| `profile` | Login-only flow (`src/auth/google.strategy.ts:18`) | "Sign-in only. Used to show the user's name in the app header after login. Never requested together with calendar scopes." |

**Note:** login flow (`GOOGLE_LOGIN_CALLBACK_URL`) and calendar flow
(`GOOGLE_REDIRECT_URI`) are two different authorisation URLs from the same
client. The calendar flow never asks for `profile`; the login flow never asks
for any calendar scope.

### HUMAN — classify scopes in the console
Confirm in Cloud Console → OAuth consent screen → Scopes whether Google
classifies `calendar.events` as **Sensitive** or **Restricted** for this
project. The console is authoritative. Restricted would add a security-
assessment requirement (CSE) — stop and check before submitting if it shows
Restricted.

## 1. OAuth consent screen fields (copy these values)

| Field | Value |
| --- | --- |
| App name | CalAssist |
| User support email | `[CONTACT_EMAIL]` — must match the privacy policy contact |
| Developer contact email | `[CONTACT_EMAIL]` |
| Authorized domains | `[APP_DOMAIN]` (the privacy/terms pages must be hosted there) |
| Privacy Policy link | `https://[APP_DOMAIN]/privacy` |
| Terms of Service link | `https://[APP_DOMAIN]/terms` |
| Account deletion link | `https://[APP_DOMAIN]/settings` (in-app: Settings → Danger zone → Delete my account). **HUMAN:** if the console exposes a dedicated "Account deletion link" field, use it; otherwise paste the settings URL or the free-text description Google allows. |

The /privacy page (built, C5) already contains every required disclosure,
including the verbatim Google API Services User Data Policy / Limited Use
sentence (`client/src/pages/PrivacyPage.tsx:34`). Replace the `[PLACEHOLDER]`
tokens there before publishing. **HUMAN.**

## 2. Redirect URIs (must match env exactly)

Register under Credentials → OAuth client → Authorized redirect URIs:

- Dev: `http://localhost:3000/api/calendar/callback/google`,
  `http://localhost:3000/auth/google/callback`
- Prod (HTTPS only — enforced at boot by
  `src/config/production-config.validator.ts`):
  `https://[APP_DOMAIN]/api/calendar/callback/google`,
  `https://[APP_DOMAIN]/auth/google/callback`

Never add wildcards. The values in the production `.env`
(`GOOGLE_REDIRECT_URI`, `GOOGLE_LOGIN_CALLBACK_URL`) must be
character-for-character identical to the console entries.

## 3. Limited Use compliance — what the code already does

Use these as evidence when answering verification questions:

1. **Scope minimization** — only the four scopes above; broad `calendar` and
   `userinfo.profile` (calendar flow) removed (C1).
2. **Encryption at rest** — all Google tokens AES-256-GCM encrypted with
   `OAUTH_TOKEN_KEY`; app refuses to store plaintext (C2).
3. **Revocation** — disconnect and account deletion call Google's revoke
   endpoint *before* deleting rows (C3/C4).
4. **Account deletion in-app** — Settings → Danger zone → type-email
   confirmation → `DELETE /api/users/me` cascades everything (C4).
5. **Consent gate (Limited Use: no AI use without consent)** — no
   calendar-derived content is sent to OpenAI/NIM/Ollama unless the user
   granted AI-processing consent; the gate is fail-closed and revocation
   takes effect immediately (C6, `src/ai/consent/`,
   `AI_CONSENT_POLICY_VERSION`).
6. **Payload minimization** — meeting prompts never include attendee emails;
   memory-conflict prompts send only content/category/tags (C6).
7. **No ad monetization, no resale, no generalized model training** — stated
   in the privacy policy and enforced by provider contracts.
8. **PKCE (S256)** on the calendar authorization flow; verifier is
   server-side only, 10-minute TTL, single-use (C7).
9. **Webhook validation** — Google push notifications are accepted only with
   the registered channel token + channel id + resource URI; the
   notification body is never trusted, changes are re-fetched with the
   user's own token (C8).
10. **HTTPS redirect URIs in production** — enforced by boot validation (C9).

## 4. Demo video script (record ~2–3 min, screen capture + narration)

Google requires a video showing each scope's core use case. Shot list:

1. **0:00 Setup** — Show the app at `https://[APP_DOMAIN]`, sign in (Google
   login, `openid email profile`), land on Dashboard.
2. **Calendar connect** — Settings → Calendar → "Connect Google Calendar" →
   the Google consent screen (point out the scope list on screen) → approve →
   connection appears with account email. *(shows calendar.events + email use)*
3. **Event creation (`calendar.events` write)** — Ask the assistant to block
   2 hours for "Finish quarterly report" tomorrow morning → confirm → open
   Google Calendar in a second tab, show the event CalAssist created.
4. **Event read/plan** — Trigger re-plan / open Today view; show real Google
   events driving schedule suggestions.
5. **Consent gate** — Settings → AI processing consent: toggle OFF → ask a
   calendar question that needs AI → show the consent-required message (no
   data left the app). Toggle ON → repeat → assistant answers. Narrate: "AI
   processing of calendar data only happens after explicit opt-in."
6. **Disconnect + revocation** — Settings → Calendar → Disconnect; then open
   myaccount.google.com → Security → Third-party apps → show CalAssist's
   access removed (proves server-side revoke worked).
7. **Account deletion** — Settings → Danger zone → type email → Delete →
   show logout + account gone; privacy page reachable while logged out.
8. **Privacy policy** — Scroll /privacy quickly, pointing at the Limited Use
   paragraph and contact email.

**HUMAN:** record, upload unlisted to YouTube/Drive, paste the link into the
verification form's "Demo video" field.

## 5. Verification form answers (draft)

- **Requested scopes**: exactly the table in §0.
- **Why each scope is needed**: the justification column of §0, verbatim.
- **Core use case**: "Personal scheduling assistant that writes work blocks
  and reminders to the user's own calendar and reads event times to plan
  around them."
- **Test credentials**: provide a whitelisted test Gmail + password/2FA or
  mark the app as test users only during review. **HUMAN.**
- **Privacy/Terms URLs**: the §1 values.

## 6. Pre-submission checklist

- [ ] **HUMAN** Replace all `[PLACEHOLDER]`s in PrivacyPage/TermsPage and deploy to `[APP_DOMAIN]`.
- [ ] **HUMAN** Consent-screen fields match §1; support email live.
- [ ] **HUMAN** Production redirect URIs registered, HTTPS, exact-match.
- [ ] **HUMAN** Scope classification for `calendar.events` confirmed (Sensitive expected; if Restricted → security assessment needed, STOP).
- [ ] **HUMAN** PKCE: confirm whether Google requires it for this client type (we already send it).
- [ ] **HUMAN** Account-deletion field: record what the console actually offers (URL field vs. free text).
- [ ] Publish with `WEBHOOK_PUBLIC_URL` + HTTPS so watch channels can be registered for live users.
- [ ] **HUMAN** Demo video recorded per §4 and linked in the form.
- [ ] **HUMAN** Verification submitted from Cloud Console → OAuth approval status → "Publish App" / "Request verification".

## 7. Follow-up engineering items (recorded, not silently closed)

- Auto-create the Google watch channel on connect (createWatch exists, not wired).
- Ops endpoint / job to recreate channels before the 7-day expiry.
- Decide whether embedding calls also fall under the C6 consent gate.
- Confirm CI/prod migrations run against a session-mode Postgres connection
  (transaction poolers hang `prisma migrate`; local applies used the
  session port + `migrate resolve`, see COMPLIANCE_LOOP D16).
