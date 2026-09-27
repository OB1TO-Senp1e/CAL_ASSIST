import { Sparkles } from 'lucide-react';

function ComingSoonPage({ title, description }: { title: string; description: string }) {
  return (
    <section className="grid min-h-[60vh] place-items-center p-8 text-center" aria-label={title}>
      <div className="max-w-xs">
        <div className="mx-auto mb-3 grid size-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground shadow-e1">
          <Sparkles className="size-4" />
        </div>
        <h2 className="text-sm font-medium">{title} is coming soon</h2>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
    </section>
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
