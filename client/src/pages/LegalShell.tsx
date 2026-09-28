import { Link } from 'react-router-dom';

/**
 * C5 — shared chrome for the public legal pages (privacy/terms). Draft for
 * owner review, not legal advice. Placeholders marked [LIKE_THIS] must be
 * replaced before publishing; Google OAuth verification needs this page at a
 * stable HTTPS URL.
 */
export function LegalShell({
  title,
  updated,
  sibling,
  children,
}: {
  title: string;
  updated: string;
  sibling: { to: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-sm leading-relaxed text-foreground">
      <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">CalAssist</p>
      <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
      <p className="mt-1 text-xs text-muted-foreground">Last updated: {updated}</p>
      <div className="mt-6 space-y-6 [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold">{children}</div>
      <p className="mt-10 border-t border-border pt-4 text-xs text-muted-foreground">
        Questions? <a className="text-primary hover:underline" href="mailto:[CONTACT_EMAIL]">[CONTACT_EMAIL]</a>
        {' · '}Also see our{' '}
        <Link to={sibling.to} className="text-primary hover:underline">{sibling.label}</Link>.
      </p>
    </main>
  );
}

export function Section({ id, heading, children }: { id: string; heading: string; children: React.ReactNode }) {
  return (
    <section id={id}>
      <h2>{heading}</h2>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}
