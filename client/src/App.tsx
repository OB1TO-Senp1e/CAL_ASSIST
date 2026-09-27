import { Routes, Route } from 'react-router-dom';
import { CheckSquare, FolderKanban, Handshake, LineChart, Settings, Sparkles, Sun, Target } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { LegacyPage } from '@/components/layout/LegacyPage';
import { TodayPage } from '@/pages/TodayPage';
import { CalendarPage } from '@/pages/CalendarPage';
import { TasksPage } from '@/pages/TasksPage';
import { GoalsPage, ProjectsPage, CommitmentsPage, AssistantPage, InsightsPage, SettingsPage } from '@/pages';
import { LoginPage } from '@/pages/LoginPage';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { ArchitecturePage } from '@/pages/ArchitecturePage';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/architecture" element={<ArchitecturePage />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <DashboardLayout />
              </RequireAuth>
            }
          >
            <Route index element={<LegacyPage title="Today" icon={<Sun />}><TodayPage /></LegacyPage>} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="tasks" element={<LegacyPage title="Tasks" icon={<CheckSquare />}><TasksPage /></LegacyPage>} />
            <Route path="goals" element={<LegacyPage title="Goals" icon={<Target />}><GoalsPage /></LegacyPage>} />
            <Route path="projects" element={<LegacyPage title="Projects" icon={<FolderKanban />}><ProjectsPage /></LegacyPage>} />
            <Route path="commitments" element={<LegacyPage title="Commitments" icon={<Handshake />}><CommitmentsPage /></LegacyPage>} />
            <Route path="assistant" element={<LegacyPage title="Assistant" icon={<Sparkles />}><AssistantPage /></LegacyPage>} />
            <Route path="insights" element={<LegacyPage title="Insights" icon={<LineChart />}><InsightsPage /></LegacyPage>} />
            <Route path="settings" element={<LegacyPage title="Settings" icon={<Settings />}><SettingsPage /></LegacyPage>} />
          </Route>
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
