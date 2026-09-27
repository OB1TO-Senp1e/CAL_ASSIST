import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { LegacyPage } from '@/components/layout/LegacyPage';
import { RouteFallback } from '@/components/layout/RouteFallback';
import { AuthProvider } from '@/contexts/AuthContext';
import { AssistantProvider } from '@/contexts/AssistantContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';

/**
 * Routes are lazy so a cold load only pays for the authenticated shell. Auth is
 * intentionally eager: it is the first thing anyone sees, and a second round-trip
 * before the sign-in form paints is the most expensive wait in the app.
 */
const TodayPage = lazy(() => import('@/pages/TodayPage').then((m) => ({ default: m.TodayPage })));
const CalendarPage = lazy(() => import('@/pages/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const TasksPage = lazy(() => import('@/pages/TasksPage').then((m) => ({ default: m.TasksPage })));
const ArchitecturePage = lazy(() => import('@/pages/ArchitecturePage').then((m) => ({ default: m.ArchitecturePage })));

/**
 * Placeholder surfaces for units 2c–2m. Declared individually (rather than one
 * dynamic helper) so each keeps its own chunk and stays type-checked by name.
 */
const AssistantPage = lazy(() => import('@/pages/AssistantPage').then((m) => ({ default: m.AssistantPage })));
const GoalsPage = lazy(() => import('@/pages').then((m) => ({ default: m.GoalsPage })));
const ProjectsPage = lazy(() => import('@/pages').then((m) => ({ default: m.ProjectsPage })));
const CommitmentsPage = lazy(() => import('@/pages').then((m) => ({ default: m.CommitmentsPage })));
const CompilerPage = lazy(() => import('@/pages').then((m) => ({ default: m.CompilerPage })));
const RealityPage = lazy(() => import('@/pages').then((m) => ({ default: m.RealityPage })));
const InsightsPage = lazy(() => import('@/pages').then((m) => ({ default: m.InsightsPage })));
const MemoryPage = lazy(() => import('@/pages').then((m) => ({ default: m.MemoryPage })));
const RulesPage = lazy(() => import('@/pages').then((m) => ({ default: m.RulesPage })));
const PermissionsPage = lazy(() => import('@/pages').then((m) => ({ default: m.PermissionsPage })));
const ProactivePage = lazy(() => import('@/pages').then((m) => ({ default: m.ProactivePage })));
const IntegrationsPage = lazy(() => import('@/pages').then((m) => ({ default: m.IntegrationsPage })));
const MeetingsPage = lazy(() => import('@/pages').then((m) => ({ default: m.MeetingsPage })));
const SearchPage = lazy(() => import('@/pages').then((m) => ({ default: m.SearchPage })));
const SettingsPage = lazy(() => import('@/pages').then((m) => ({ default: m.SettingsPage })));

/**
 * Every authenticated page owns its own <PageHeader> so that page controls (view
 * switcher, filters, actions) live in the same 48px bar as the title. Routes that
 * are still placeholders get that bar from the LegacyPage wrapper.
 *
 * The Suspense boundary lives in DashboardLayout (around the <Outlet/>) so a lazy
 * chunk resolves inside the real shell — the sidebar and top bar never flicker.
 */
function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/architecture"
            element={
              <Suspense fallback={<RouteFallback />}>
                <ArchitecturePage />
              </Suspense>
            }
          />

          {/* Authenticated shell */}
          <Route
            path="/"
            element={
              <RequireAuth>
                <DashboardLayout />
              </RequireAuth>
            }
          >
            <Route index element={<TodayPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="search" element={<SearchPage />} />

            <Route path="assistant" element={<AssistantPage />} />
            <Route path="goals" element={<LegacyPage title="Goals"><GoalsPage /></LegacyPage>} />
            <Route path="projects" element={<LegacyPage title="Projects"><ProjectsPage /></LegacyPage>} />
            <Route path="commitments" element={<LegacyPage title="Commitments"><CommitmentsPage /></LegacyPage>} />
            <Route path="compiler" element={<LegacyPage title="Time Compiler"><CompilerPage /></LegacyPage>} />
            <Route path="reality" element={<LegacyPage title="Reality &amp; Replanning"><RealityPage /></LegacyPage>} />
            <Route path="insights" element={<LegacyPage title="Insights"><InsightsPage /></LegacyPage>} />
            <Route path="memory" element={<LegacyPage title="Memory"><MemoryPage /></LegacyPage>} />
            <Route path="rules" element={<LegacyPage title="Rules"><RulesPage /></LegacyPage>} />
            <Route path="permissions" element={<LegacyPage title="Permissions"><PermissionsPage /></LegacyPage>} />
            <Route path="proactive" element={<LegacyPage title="Proactive"><ProactivePage /></LegacyPage>} />
            <Route path="meetings" element={<LegacyPage title="Meetings"><MeetingsPage /></LegacyPage>} />
            <Route path="integrations" element={<LegacyPage title="Integrations"><IntegrationsPage /></LegacyPage>} />
            <Route path="settings" element={<LegacyPage title="Settings"><SettingsPage /></LegacyPage>} />
          </Route>
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
