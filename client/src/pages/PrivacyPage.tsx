import { LegalShell, Section } from './LegalShell';

/**
 * C5 — public privacy policy route (no auth). Owner must replace every
 * [PLACEHOLDER] and review before this goes live.
 */
export function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      updated="[EFFECTIVE_DATE]"
      sibling={{ to: '/terms', label: 'Terms of Service' }}
    >
      <p className="text-xs text-muted-foreground">
        Plain-language summary: we connect to your Google Calendar, store what you tell us, and use an AI
        provider to help plan your day. We do not sell your data, we do not run advertising, and we do not
        use your data to train generalized AI models.
      </p>

      <Section id="google-data" heading="1. Google account and Calendar data we access, and why">
        <p>
          When you sign in with Google or connect a calendar, CalAssist requests the minimum Google scopes
          the features need: your Google <strong>email address</strong> for authentication, and calendar{' '}
          <strong>event access</strong> (<code>calendar.events</code>) so the app can read, create, update,
          and delete events on your behalf for scheduling, reminders, travel-time buffers, and AI planning.
        </p>
        <p>
          Calendar events (titles, times, locations, attendees, and descriptions) are accessed only to
          provide the features you ask for — for example, finding free time or estimating travel between
          events. We do not use this data for any other purpose.
        </p>
        <p>
          The app's use and transfer to any other app of information received from Google APIs will adhere
          to the Google API Services User Data Policy, including the Limited Use requirements.
        </p>
      </Section>

      <Section id="storage" heading="2. How your data is stored, secured, and for how long">
        <p>
          Your data is stored in our database at <code>https://[APP_DOMAIN]</code> (managed PostgreSQL).
          OAuth access and refresh tokens are encrypted at rest with AES-256-GCM; keys live only on our
          application servers. Traffic between your browser, our API, and Google uses HTTPS.
        </p>
        <p>
          Retention: calendar caches, tasks, notes, conversations, and assistant memories are kept while
          your account exists. Deleting your account (Settings → Delete account, or email us) revokes your
          Google grant and removes all of it, except where a specific legal retention obligation applies.
        </p>
      </Section>

      <Section id="third-parties" heading="3. Third parties that receive your data">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Google Calendar API</strong> — to read and write the events you ask us to manage, under
            your OAuth grant.
          </li>
          <li>
            <strong>Google Maps Platform</strong> — event <em>locations/addresses</em> are sent to Google
            geocoding and distance-matrix services solely to compute travel times and buffers.
          </li>
          <li>
            <strong>AI provider (OpenAI; NVIDIA NIM or local Ollama where configured)</strong> — calendar
            and task content is sent so it can answer questions and plan your schedule. We minimize the
            payload (only the fields the feature needs). Providers process data under enterprise terms;
            your data is not used to train generalized/foundation AI models, not used for advertising, and
            never sold.
          </li>
          <li>
            <strong>Infrastructure</strong> — hosting/database providers store encrypted data on our behalf
            under confidentiality obligations.
          </li>
        </ul>
      </Section>

      <Section id="your-choices" heading="4. Revoking access, deleting data, and your choices">
        <p>
          Revoke Google access any time from your Google Account (myaccount.google.com → Security →
          Third-party access → CalAssist → Remove). Disconnecting a calendar inside CalAssist also revokes
          our stored tokens with Google immediately.
        </p>
        <p>
          Delete individual items in the app whenever you like, or delete the entire account via Settings →
          Notification &amp; Account → Delete account (irreversible, and also available by emailing{' '}
          <a className="text-primary hover:underline" href="mailto:[CONTACT_EMAIL]">[CONTACT_EMAIL]</a>).
        </p>
        <p>
          AI features that process calendar content require a one-time explicit consent inside the app and
          can be withdrawn in Settings at any time; withdrawal stops all future AI processing.
        </p>
      </Section>

      <Section id="contact" heading="5. Security, changes, and contact">
        <p>
          We use least-privilege scopes, encrypted OAuth tokens, HTTPS-only endpoints in production, rate
          limiting, and access logging. This service is not directed at children under 13 (or the minimum
          age in your country). Material changes to this policy will be posted here with an updated date.
        </p>
        <p>
          Data controller: <strong>[LEGAL_ENTITY_NAME]</strong>. Privacy contact:{' '}
          <a className="text-primary hover:underline" href="mailto:[CONTACT_EMAIL]">[CONTACT_EMAIL]</a>.
          Canonical URL: <code>https://[APP_DOMAIN]/privacy</code>.
        </p>
      </Section>
    </LegalShell>
  );
}
