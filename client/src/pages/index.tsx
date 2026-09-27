import type { ReactNode } from 'react';
import { Compass, HardDrive, Search, ShieldCheck, Sparkles, Users, Zap, Activity } from 'lucide-react';

/**
 * Placeholder pages for screen-groups not yet built (2e–2m).
 *
 * Each one states which unit will build it, so the nav is fully walkable in
 * Stage 2 and nobody mistakes a stub for a finished surface. They are replaced
 * one-for-one as their unit lands.
 */
function PlannedPage({
  title,
  unit,
  description,
  icon,
}: {
  title: string;
  unit: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <section className="grid min-h-[60vh] place-items-center p-8 text-center" aria-label={title}>
      <div className="max-w-sm">
        <div className="mx-auto mb-3 grid size-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground shadow-e1">
          {icon}
        </div>
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        <p className="mt-3 inline-flex items-center rounded-xs bg-muted px-1.5 py-0.5 text-2xs font-medium text-subtle-foreground">
          Builds in unit {unit}
        </p>
      </div>
    </section>
  );
}

export function GoalsPage() {
  return <PlannedPage title="Goals" unit="2d" icon={<Sparkles className="size-4" />} description="Goals, projects and the task hierarchy — with progress roll-up from the real API." />;
}

export function ProjectsPage() {
  return <PlannedPage title="Projects" unit="2d" icon={<Sparkles className="size-4" />} description="Projects and their milestones, grouped under the goal they serve." />;
}

export function CommitmentsPage() {
  return <PlannedPage title="Commitments" unit="2f" icon={<Sparkles className="size-4" />} description="Promises made to other people, with deadline-risk indicators." />;
}

export function AssistantPage() {
  return <PlannedPage title="Assistant" unit="2c" icon={<Sparkles className="size-4" />} description="The full conversation thread, tool-call proposals and confirm/reject controls." />;
}

export function InsightsPage() {
  return <PlannedPage title="Insights" unit="2j" icon={<Activity className="size-4" />} description="The proactive feed: nudges the assistant raises before you ask." />;
}

export function SettingsPage() {
  return <PlannedPage title="Settings" unit="2j / 2k" icon={<ShieldCheck className="size-4" />} description="Profile, autonomy and permission controls, plus notification preferences." />;
}

export function CompilerPage() {
  return <PlannedPage title="Time Compiler" unit="2e" icon={<Zap className="size-4" />} description="Turn a goal into a plan: review the schedule proposal and its alternatives before accepting." />;
}

export function RealityPage() {
  return <PlannedPage title="Reality & Replanning" unit="2g" icon={<Activity className="size-4" />} description="Deviation alerts when the day runs off plan, and the re-plan review that follows." />;
}

export function MemoryPage() {
  return <PlannedPage title="Memory" unit="2h" icon={<HardDrive className="size-4" />} description="Browse, correct and confirm what the assistant has remembered, and resolve conflicts." />;
}

export function RulesPage() {
  return <PlannedPage title="Rules" unit="2i" icon={<Sparkles className="size-4" />} description="Describe a scheduling rule in plain language; see how it is interpreted and applied." />;
}

export function PermissionsPage() {
  return <PlannedPage title="Permissions" unit="2j" icon={<ShieldCheck className="size-4" />} description="Which actions the assistant may take on its own, and which always need your confirmation." />;
}

export function ProactivePage() {
  return <PlannedPage title="Proactive" unit="2j" icon={<Activity className="size-4" />} description="Interventions the assistant raises on its own — acknowledge, dismiss or snooze them." />;
}

export function IntegrationsPage() {
  return <PlannedPage title="Integrations" unit="2k" icon={<Compass className="size-4" />} description="Connect calendars and services, and watch sync status and travel-time settings." />;
}

export function MeetingsPage() {
  return <PlannedPage title="Meetings" unit="2l" icon={<Users className="size-4" />} description="Pre-meeting preparation packages and post-meeting extraction review." />;
}

export function SearchPage() {
  return <PlannedPage title="Search & commands" unit="2m" icon={<Search className="size-4" />} description="The global command palette: jump anywhere, run anything, ask the assistant." />;
}
