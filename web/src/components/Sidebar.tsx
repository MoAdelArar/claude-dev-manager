import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import {
  Home, FolderGit2, Terminal, Receipt, Settings,
  LayoutDashboard, Users, Container, CreditCard,
  LogOut, Shield, ChevronLeft, ChevronRight, Code2,
} from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'

const userLinks = [
  { to: '/dashboard', icon: Home, label: 'Dashboard' },
  { to: '/repos', icon: FolderGit2, label: 'Repositories' },
  { to: '/sessions', icon: Terminal, label: 'Sessions' },
  { to: '/billing', icon: Receipt, label: 'Billing' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

const adminLinks = [
  { to: '/admin', icon: LayoutDashboard, label: 'Overview' },
  { to: '/admin/users', icon: Users, label: 'Users' },
  { to: '/admin/sessions', icon: Terminal, label: 'Sessions' },
  { to: '/admin/containers', icon: Container, label: 'Containers' },
  { to: '/admin/billing', icon: CreditCard, label: 'Billing' },
]

export function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    clsx(
      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
      isActive ? 'bg-adel-500/15 text-adel-400 font-medium' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
    )

  return (
    <aside className={clsx('flex flex-col h-screen bg-gray-900 border-r border-gray-800 transition-all', collapsed ? 'w-16' : 'w-60')}>
      <div className="flex items-center gap-2 px-4 h-16 border-b border-gray-800">
        <Code2 className="w-7 h-7 text-adel-500 shrink-0" />
        {!collapsed && <span className="font-bold text-lg">AdelBot</span>}
        <button onClick={() => setCollapsed(!collapsed)} className="ml-auto text-gray-500 hover:text-gray-300">
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
        {!collapsed && <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-600">User</p>}
        {userLinks.map(l => (
          <NavLink key={l.to} to={l.to} className={linkClass} title={l.label}>
            <l.icon className="w-4 h-4 shrink-0" />
            {!collapsed && <span>{l.label}</span>}
          </NavLink>
        ))}

        {user?.is_admin && (
          <>
            <div className="my-3 border-t border-gray-800" />
            {!collapsed && (
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-600 flex items-center gap-1">
                <Shield className="w-3 h-3" /> Admin
              </p>
            )}
            {adminLinks.map(l => (
              <NavLink key={l.to} to={l.to} end={l.to === '/admin'} className={linkClass} title={l.label}>
                <l.icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span>{l.label}</span>}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      <div className="border-t border-gray-800 p-3">
        <div className="flex items-center gap-2">
          {user?.avatar_url && <img src={user.avatar_url} className="w-8 h-8 rounded-full shrink-0" />}
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.github_username}</p>
              {user?.is_admin && <p className="text-[10px] text-adel-400">Admin</p>}
            </div>
          )}
          <button onClick={() => { logout(); navigate('/login') }} className="text-gray-500 hover:text-gray-300 shrink-0" title="Sign out">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
