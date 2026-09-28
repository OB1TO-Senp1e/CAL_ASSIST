import { LegalShell, Section } from './LegalShell';

/**
 * C5 — public terms of service route (no auth). Owner must replace every
 * [PLACEHOLDER] and review before this goes live. Draft, not legal advice.
 */
export function TermsPage() {
  return (
    <LegalShell
      title="Terms of Service"
      updated="[EFFECTIVE_DATE]"
      sibling={{ to: '/privacy', label: 'Privacy Policy' }}
    >
      <Section id="service" heading="1. The service">
        <p>
          CalAssist ([LEGAL_ENTITY_NAME], "we") provides an AI calendar assistant at{' '}
          <code>https://[APP_DOMAIN]</code> that can connect to your Google (or other) calendar, organize
          tasks and events, and suggest schedules. The service is provided "as is", without warranty of any
          kind, and AI output may be wrong — you stay responsible for your own calendar decisions.
        </p>
      </Section>

      <Section id="account" heading="2. Your account and acceptable use">
        <p>
          You must keep your login credentials safe and are responsible for activity under your account.
          You may not abuse the service (e.g. probing, overloading, or attempting unauthorized access to
          other users' data) or use it to violate any law or third party's rights.
        </p>
      </Section>

      <Section id="your-data" heading="3. Your content and third-party services">
        <p>
          You keep your rights in the content you store. You grant us only the limited license needed to
          operate the features you request (processing, temporary caching, display). Using calendar
          connection features requires access to your Google account; your relationship with Google (and
          Google's terms) also apply, and you can revoke our access at any time — see the{' '}
          <a className="text-primary hover:underline" href="/privacy">Privacy Policy</a>.
        </p>
      </Section>

      <Section id="termination" heading="4. Changes, suspension, and termination">
        <p>
          We may change or discontinue features with reasonable notice posted on this page. You may
          terminate at any time via Settings → Delete account, which deletes your data as described in the
          Privacy Policy. We may suspend accounts that clearly breach these terms.
        </p>
      </Section>

      <Section id="liability" heading="5. Liability and governing law">
        <p>
          To the maximum extent permitted by law, our aggregate liability is limited to the amount you paid
          for the service in the preceding twelve months (or zero for free use), and we are not liable for
          indirect or consequential damages. Governing law: [JURISDICTION].
        </p>
        <p>
          Contact: <a className="text-primary hover:underline" href="mailto:[CONTACT_EMAIL]">[CONTACT_EMAIL]</a>.
          Canonical URL: <code>https://[APP_DOMAIN]/terms</code>.
        </p>
      </Section>
    </LegalShell>
  );
}
