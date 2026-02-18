import { useState } from 'react'
import { useFetch } from '../../hooks/useFetch'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { StatCard } from '../../components/StatCard'
import { CreditCard, Receipt, Calendar } from 'lucide-react'

export function AdminBillingPage() {
  const [days, setDays] = useState(30)
  const { data } = useFetch(() => api.admin.billingOverview(days), [days])

  return (
    <div>
      <PageHeader title="Billing Overview"
        actions={
          <select value={days} onChange={e => setDays(Number(e.target.value))}
            className="px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm focus:outline-none">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </select>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard title="Revenue" value={data ? `$${(data.revenue_cents / 100).toFixed(2)}` : '—'} icon={CreditCard} color="text-emerald-400" subtitle={`Last ${days} days`} />
        <StatCard title="Records" value={data?.record_count ?? '—'} icon={Receipt} color="text-adel-400" />
        <StatCard title="Period" value={`${days}d`} icon={Calendar} color="text-amber-400" />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800"><h2 className="font-semibold">Recent Transactions</h2></div>
        <div className="divide-y divide-gray-800/50">
          {data?.recent_records.map(r => (
            <div key={r.id} className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm">{r.description}</p>
                <p className="text-xs text-gray-600">{r.created_at.slice(0, 19).replace('T', ' ')} &middot; {r.billing_type}</p>
              </div>
              <span className="text-sm font-medium font-mono">${(r.amount_cents / 100).toFixed(2)}</span>
            </div>
          ))}
          {(!data || data.recent_records.length === 0) && <p className="p-8 text-center text-sm text-gray-600">No records in this period</p>}
        </div>
      </div>
    </div>
  )
}
