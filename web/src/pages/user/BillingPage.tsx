import { useFetch } from '../../hooks/useFetch'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { StatCard } from '../../components/StatCard'
import { StatusBadge } from '../../components/StatusBadge'
import { CreditCard, Timer, Terminal, TrendingUp } from 'lucide-react'

export function BillingPage() {
  const { data: usage } = useFetch(() => api.billing.usage())
  const { data: history } = useFetch(() => api.billing.history())
  const { data: plans } = useFetch(() => api.billing.plans())

  const pct = usage ? Math.min(100, (usage.subscription.minutes_used_this_period / usage.subscription.minutes_limit) * 100) : 0

  return (
    <div>
      <PageHeader title="Billing & Usage" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Current Plan" value={usage?.subscription.tier.toUpperCase() ?? '—'} icon={CreditCard} color="text-adel-400" />
        <StatCard title="Minutes Used" value={usage ? `${usage.subscription.minutes_used_this_period.toFixed(0)} / ${usage.subscription.minutes_limit}` : '—'} icon={Timer} color="text-cyan-400" />
        <StatCard title="Total Sessions" value={usage?.totals.total_sessions ?? '—'} icon={Terminal} color="text-emerald-400" />
        <StatCard title="Total Spent" value={usage ? `$${(usage.totals.total_spent_cents / 100).toFixed(2)}` : '—'} icon={TrendingUp} color="text-amber-400" />
      </div>

      {usage && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Period Usage</span>
            <span className="text-sm font-medium">{pct.toFixed(0)}%</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2.5">
            <div className={`h-full rounded-full transition-all ${pct > 80 ? 'bg-amber-500' : 'bg-adel-500'}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {plans && plans.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Available Plans</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map(p => (
              <div key={p.tier} className={`p-5 rounded-xl border ${p.tier === usage?.subscription.tier ? 'bg-adel-500/10 border-adel-500/30' : 'bg-gray-900 border-gray-800'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold capitalize">{p.tier}</span>
                  {p.tier === usage?.subscription.tier && <StatusBadge status="active" />}
                </div>
                <p className="text-2xl font-bold">{p.price_cents_monthly === 0 ? 'Free' : `$${p.price_cents_monthly / 100}`}<span className="text-sm text-gray-500 font-normal">/mo</span></p>
                <div className="mt-3 space-y-1 text-xs text-gray-400">
                  <p>{p.minutes_per_month > 0 ? `${p.minutes_per_month} min/month` : 'Unlimited'}</p>
                  <p>{p.max_concurrent_sessions > 0 ? `${p.max_concurrent_sessions} concurrent` : 'Unlimited'} sessions</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800"><h2 className="font-semibold">Billing History</h2></div>
        <div className="divide-y divide-gray-800/50">
          {history?.map(r => (
            <div key={r.id} className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm">{r.description}</p>
                <p className="text-xs text-gray-600">{r.created_at.slice(0, 10)}</p>
              </div>
              <span className="text-sm font-medium">${(r.amount_cents / 100).toFixed(2)}</span>
            </div>
          ))}
          {(!history || history.length === 0) && <p className="p-8 text-center text-sm text-gray-600">No billing records</p>}
        </div>
      </div>
    </div>
  )
}
