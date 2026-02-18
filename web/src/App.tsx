import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { Sidebar } from './components/Sidebar'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/user/DashboardPage'
import { ReposPage } from './pages/user/ReposPage'
import { SessionsPage } from './pages/user/SessionsPage'
import { SessionDetailPage } from './pages/user/SessionDetailPage'
import { BillingPage } from './pages/user/BillingPage'
import { SettingsPage } from './pages/user/SettingsPage'
import { AdminOverviewPage } from './pages/admin/OverviewPage'
import { AdminUsersPage } from './pages/admin/UsersPage'
import { AdminUserDetailPage } from './pages/admin/UserDetailPage'
import { AdminSessionsPage } from './pages/admin/SessionsPage'
import { AdminContainersPage } from './pages/admin/ContainersPage'
import { AdminBillingPage } from './pages/admin/BillingPage'

function AuthLayout() {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin w-8 h-8 border-2 border-adel-500 border-t-transparent rounded-full" /></div>
  if (!user) return <Navigate to="/login" />
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6 lg:p-8"><Outlet /></main>
    </div>
  )
}

function AdminLayout() {
  const { user } = useAuth()
  if (!user?.is_admin) return <Navigate to="/dashboard" />
  return <Outlet />
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<LoginPage />} />
      <Route element={<AuthLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/repos" element={<ReposPage />} />
        <Route path="/sessions" element={<SessionsPage />} />
        <Route path="/sessions/:id" element={<SessionDetailPage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<AdminOverviewPage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/users/:id" element={<AdminUserDetailPage />} />
          <Route path="/admin/sessions" element={<AdminSessionsPage />} />
          <Route path="/admin/containers" element={<AdminContainersPage />} />
          <Route path="/admin/billing" element={<AdminBillingPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" />} />
    </Routes>
  )
}
