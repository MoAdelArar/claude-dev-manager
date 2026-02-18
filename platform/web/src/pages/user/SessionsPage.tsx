import { useNavigate } from 'react-router-dom'
import { useFetch } from '../../hooks/useFetch'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { DataTable } from '../../components/DataTable'
import { StatusBadge } from '../../components/StatusBadge'
import type { Session } from '../../types'
import { RefreshCw } from 'lucide-react'

export function SessionsPage() {
  const { data, loading, refetch } = useFetch(() => api.sessions.list(50))
  const navigate = useNavigate()

  const columns = [
    { key: 'status', header: 'Status', render: (s: Session) => <StatusBadge status={s.status} /> },
    { key: 'task', header: 'Task', render: (s: Session) => <span className="truncate max-w-xs block">{s.task_description}</span> },
    { key: 'branch', header: 'Branch', render: (s: Session) => <code className="text-xs text-gray-400">{s.branch}</code> },
    { key: 'duration', header: 'Duration', render: (s: Session) => <span className="text-gray-400">{s.duration_seconds ? `${(s.duration_seconds / 60).toFixed(1)}m` : '—'}</span> },
    { key: 'cost', header: 'Cost', render: (s: Session) => <span className="text-gray-400">{s.cost_cents > 0 ? `$${(s.cost_cents / 100).toFixed(2)}` : '—'}</span> },
    { key: 'commit', header: 'Commit', render: (s: Session) => s.commit_sha ? <code className="text-xs text-emerald-400">{s.commit_sha.slice(0, 7)}</code> : <span className="text-gray-600">—</span> },
    { key: 'date', header: 'Date', render: (s: Session) => <span className="text-xs text-gray-500">{s.created_at.slice(0, 10)}</span> },
  ]

  return (
    <div>
      <PageHeader title="Sessions" subtitle={`${data?.total ?? 0} total sessions`}
        actions={<button onClick={refetch} className="p-2 hover:bg-gray-800 rounded-lg"><RefreshCw className="w-4 h-4 text-gray-400" /></button>} />

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {loading ? <div className="p-12 text-center text-gray-500">Loading...</div> :
          <DataTable columns={columns} data={data?.sessions ?? []} onRowClick={s => navigate(`/sessions/${s.id}`)} emptyMessage="No sessions yet. Start one from Repositories." />
        }
      </div>
    </div>
  )
}
