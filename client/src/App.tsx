import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
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
 * Product surfaces are lazy so a cold load pays only for the authenticated shell.
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
            <Route path="goals" element={<GoalsPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="commitments" element={<CommitmentsPage />} />
            <Route path="compiler" element={<CompilerPage />} />
            <Route path="reality" element={<RealityPage />} />
            <Route path="insights" element={<InsightsPage />} />
            <Route path="memory" element={<MemoryPage />} />
            <Route path="rules" element={<RulesPage />} />
            <Route path="permissions" element={<PermissionsPage />} />
            <Route path="proactive" element={<ProactivePage />} />
            <Route path="meetings" element={<MeetingsPage />} />
            <Route path="integrations" element={<IntegrationsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
