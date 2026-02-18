import { useAuth } from '../../lib/auth'
import { useFetch } from '../../hooks/useFetch'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { StatCard } from '../../components/StatCard'
import { StatusBadge } from '../../components/StatusBadge'
import { Terminal, Timer, FolderGit2, CreditCard } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: usage } = useFetch(() => api.billing.usage())
  const { data: sessions } = useFetch(() => api.sessions.list(5))
  const { data: repos } = useFetch(() => api.repos.list())

  return (
    <div>
      <PageHeader title={`Welcome back, ${user?.display_name || user?.github_username}`} subtitle="Here's your development overview" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Sessions" value={usage?.totals.total_sessions ?? '—'} icon={Terminal} color="text-adel-400" />
        <StatCard title="Minutes Used" value={usage ? `${usage.totals.total_minutes.toFixed(0)}` : '—'} icon={Timer} color="text-cyan-400" subtitle={usage ? `${usage.subscription.minutes_used_this_period.toFixed(0)} / ${usage.subscription.minutes_limit} this period` : undefined} />
        <StatCard title="Repositories" value={repos?.length ?? '—'} icon={FolderGit2} color="text-emerald-400" />
        <StatCard title="Total Spent" value={usage ? `$${(usage.totals.total_spent_cents / 100).toFixed(2)}` : '—'} icon={CreditCard} color="text-amber-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl">
          <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
            <h2 className="font-semibold">Recent Sessions</h2>
            <button onClick={() => navigate('/sessions')} className="text-xs text-adel-400 hover:underline">View all</button>
          </div>
          <div className="divide-y divide-gray-800/50">
            {sessions?.sessions.map(s => (
              <div key={s.id} onClick={() => navigate(`/sessions/${s.id}`)} className="px-5 py-3 hover:bg-gray-800/30 cursor-pointer flex items-center gap-3">
                <StatusBadge status={s.status} />
                <span className="flex-1 truncate text-sm">{s.task_description}</span>
                <span className="text-xs text-gray-600">{s.created_at.slice(0, 10)}</span>
              </div>
            ))}
            {(!sessions || sessions.sessions.length === 0) && <p className="px-5 py-8 text-center text-gray-600 text-sm">No sessions yet</p>}
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl">
          <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
            <h2 className="font-semibold">Quick Actions</h2>
          </div>
          <div className="p-5 space-y-3">
            <button onClick={() => navigate('/repos')} className="w-full text-left p-4 rounded-lg bg-adel-500/10 hover:bg-adel-500/20 border border-adel-500/20 transition-colors">
              <p className="font-medium text-adel-400">New Session</p>
              <p className="text-xs text-gray-500 mt-0.5">Pick a repo and let Claude Code work</p>
            </button>
            <button onClick={() => navigate('/repos')} className="w-full text-left p-4 rounded-lg bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 transition-colors">
              <p className="font-medium">Sync Repositories</p>
              <p className="text-xs text-gray-500 mt-0.5">Pull latest repos from GitHub</p>
            </button>
            <button onClick={() => navigate('/billing')} className="w-full text-left p-4 rounded-lg bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 transition-colors">
              <p className="font-medium">View Usage</p>
              <p className="text-xs text-gray-500 mt-0.5">Check billing and subscription</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
