import { useFetch } from '../../hooks/useFetch'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { StatCard } from '../../components/StatCard'
import { Users, Terminal, Container, CreditCard, TrendingUp, Activity, FolderGit2, Clock } from 'lucide-react'

export function AdminOverviewPage() {
  const { data: stats } = useFetch(() => api.admin.stats())

  if (!stats) return <div className="text-center py-12 text-gray-500">Loading...</div>

  return (
    <div>
      <PageHeader title="Admin Overview" subtitle="System-wide metrics and health" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Users" value={stats.users.total} subtitle={`${stats.users.new_30d} new in 30d`} icon={Users} color="text-adel-400" />
        <StatCard title="Active Sessions" value={stats.sessions.active} subtitle={`${stats.sessions.total} total`} icon={Activity} color="text-emerald-400" />
        <StatCard title="Repositories" value={stats.repositories.total} icon={FolderGit2} color="text-cyan-400" />
        <StatCard title="Revenue (30d)" value={`$${(stats.billing.revenue_30d_cents / 100).toFixed(2)}`} subtitle={`$${(stats.billing.total_revenue_cents / 100).toFixed(2)} all time`} icon={CreditCard} color="text-amber-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="font-semibold mb-4 flex items-center gap-2"><Terminal className="w-4 h-4 text-gray-500" /> Sessions</h2>
          <div className="grid grid-cols-2 gap-4">
            <Metric label="Last 7 days" value={stats.sessions.last_7d} />
            <Metric label="Last 30 days" value={stats.sessions.last_30d} />
            <Metric label="Completed" value={stats.sessions.completed} color="text-emerald-400" />
            <Metric label="Failed" value={stats.sessions.failed} color="text-red-400" />
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="font-semibold mb-4 flex items-center gap-2"><Users className="w-4 h-4 text-gray-500" /> Subscriptions</h2>
          <div className="grid grid-cols-2 gap-4">
            {Object.entries(stats.subscriptions).map(([tier, count]) => (
              <Metric key={tier} label={tier.charAt(0).toUpperCase() + tier.slice(1)} value={count} />
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Active Users" value={stats.users.active} icon={Users} color="text-adel-400" />
        <StatCard title="Total Dev Minutes" value={`${stats.billing.total_minutes.toFixed(0)}`} icon={Clock} color="text-cyan-400" />
        <StatCard title="All-Time Revenue" value={`$${(stats.billing.total_revenue_cents / 100).toFixed(2)}`} icon={TrendingUp} color="text-emerald-400" />
      </div>
    </div>
  )
}

function Metric({ label, value, color = 'text-gray-100' }: { label: string; value: number | string; color?: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  )
}
