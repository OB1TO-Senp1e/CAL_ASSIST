import { Sparkles } from 'lucide-react';

function ComingSoonPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-5 md:p-8">
      <header>
        <p className="page-eyebrow mb-2">Your personal time OS</p>
        <h1 className="page-title">{title}</h1>
      </header>
      <section className="surface-card grid min-h-72 place-items-center p-8 text-center">
        <div className="max-w-sm">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <h2 className="font-semibold tracking-tight">Coming soon</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </section>
    </div>
  );
}

export function GoalsPage() {
  return <ComingSoonPage title="Goals" description="Goals management is on the way. Use the Assistant to create goals." />;
}

export function ProjectsPage() {
  return <ComingSoonPage title="Projects" description="Your projects and their next milestones will live here." />;
}

export function CommitmentsPage() {
  return <ComingSoonPage title="Commitments" description="Track promises, deadlines, and commitments in one place." />;
}

export function AssistantPage() {
  return <ComingSoonPage title="Assistant" description="Your planning partner will help turn intentions into a clear next step." />;
}

export function InsightsPage() {
  return <ComingSoonPage title="Insights" description="Patterns and progress from your time will be summarized here." />;
}

export function SettingsPage() {
  return <ComingSoonPage title="Settings" description="Personalize your schedule, preferences, and connected services." />;
}
