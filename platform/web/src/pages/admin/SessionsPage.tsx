import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFetch } from '../../hooks/useFetch'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { DataTable } from '../../components/DataTable'
import { StatusBadge } from '../../components/StatusBadge'
import type { Session } from '../../types'
import { Search, RefreshCw, XCircle } from 'lucide-react'

export function AdminSessionsPage() {
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [sq, setSq] = useState('')
  const navigate = useNavigate()
  const { data, loading, refetch } = useFetch(
    () => api.admin.sessions(`status_filter=${statusFilter}&search=${sq}&limit=100`),
    [statusFilter, sq]
  )

  const cancelSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Cancel this session?')) return
    await api.admin.cancelSession(id)
    refetch()
  }

  const columns = [
    {
      key: 'user', header: 'User', render: (s: Session) => (
        <div className="flex items-center gap-2">
          {s.avatar_url && <img src={s.avatar_url} className="w-6 h-6 rounded-full" />}
          <span className="text-sm">{s.username || '—'}</span>
        </div>
      )
    },
    { key: 'status', header: 'Status', render: (s: Session) => <StatusBadge status={s.status} /> },
    { key: 'task', header: 'Task', render: (s: Session) => <span className="truncate max-w-[200px] block text-sm">{s.task_description}</span> },
    { key: 'duration', header: 'Duration', render: (s: Session) => <span className="text-gray-400 text-sm">{s.duration_seconds ? `${(s.duration_seconds / 60).toFixed(1)}m` : '—'}</span> },
    { key: 'cost', header: 'Cost', render: (s: Session) => <span className="text-gray-400 text-sm">{s.cost_cents > 0 ? `$${(s.cost_cents / 100).toFixed(2)}` : '—'}</span> },
    { key: 'date', header: 'Date', render: (s: Session) => <span className="text-xs text-gray-500">{s.created_at.slice(0, 10)}</span> },
    {
      key: 'actions', header: '', render: (s: Session) => {
        const active = ['running', 'agent_working', 'provisioning'].includes(s.status)
        return active ? <button onClick={(e) => cancelSession(s.id, e)} className="text-red-400 hover:text-red-300"><XCircle className="w-4 h-4" /></button> : null
      }
    },
  ]

  const statuses = ['', 'pending', 'provisioning', 'running', 'agent_working', 'pushing', 'completed', 'failed', 'cancelled']

  return (
    <div>
      <PageHeader title="All Sessions" subtitle={`${data?.total ?? 0} total`}
        actions={<button onClick={refetch} className="p-2 hover:bg-gray-800 rounded-lg"><RefreshCw className="w-4 h-4 text-gray-400" /></button>}
      />

      <div className="mb-4 flex gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && setSq(search)}
            placeholder="Search tasks..." className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm focus:outline-none focus:border-adel-500" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm focus:outline-none">
          {statuses.map(s => <option key={s} value={s}>{s || 'All statuses'}</option>)}
        </select>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {loading ? <div className="p-12 text-center text-gray-500">Loading...</div> :
          <DataTable columns={columns} data={data?.sessions ?? []} onRowClick={s => navigate(`/sessions/${s.id}`)} />
        }
      </div>
    </div>
  )
}
