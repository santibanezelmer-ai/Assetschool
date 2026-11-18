import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { ClassroomMonitorPage } from './pages/ClassroomMonitorPage';
import { ClassroomControlPage } from './pages/ClassroomControlPage';
import { StudentsPage } from './pages/StudentsPage';
import { CoursesPage } from './pages/CoursesPage';
import { ClassroomsPage } from './pages/ClassroomsPage';
import { DevicesPage } from './pages/DevicesPage';
import { InstitutionsPage } from './pages/InstitutionsPage';
import { UsersPage } from './pages/UsersPage';
import { EnrollmentPage } from './pages/EnrollmentPage';
import { AssessmentsPage } from './pages/AssessmentsPage';
import { ApplicationsPage } from './pages/ApplicationsPage';
import { InternetPage } from './pages/InternetPage';
import { InventoryPage } from './pages/InventoryPage';
import { ReportsPage } from './pages/ReportsPage';
import { AuditPage } from './pages/AuditPage';
import { SettingsPage } from './pages/SettingsPage';
import { LoginPage } from './pages/LoginPage';

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<Layout />}>
              <Route index element={<DashboardPage />} />
              <Route path="monitor" element={<ClassroomMonitorPage />} />
              <Route path="control" element={<ClassroomControlPage />} />
              <Route path="students" element={<StudentsPage />} />
              <Route path="courses" element={<CoursesPage />} />
              <Route path="classrooms" element={<ClassroomsPage />} />
              <Route path="devices" element={<DevicesPage />} />
              <Route path="institutions" element={<InstitutionsPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="enrollment" element={<EnrollmentPage />} />
              <Route path="assessments" element={<AssessmentsPage />} />
              <Route path="applications" element={<ApplicationsPage />} />
              <Route path="internet" element={<InternetPage />} />
              <Route path="inventory" element={<InventoryPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="audit" element={<AuditPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
};
