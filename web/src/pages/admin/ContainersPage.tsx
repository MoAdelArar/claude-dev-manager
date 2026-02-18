import { useFetch } from '../../hooks/useFetch'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { DataTable } from '../../components/DataTable'
import { StatusBadge } from '../../components/StatusBadge'
import type { Container } from '../../types'
import { RefreshCw, Trash2, Sparkles, Loader2 } from 'lucide-react'
import { useState } from 'react'

export function AdminContainersPage() {
  const { data, loading, refetch } = useFetch(() => api.admin.containers())
  const [cleaning, setCleaning] = useState(false)

  const killContainer = async (id: string) => {
    if (!confirm(`Kill container ${id}?`)) return
    await api.admin.killContainer(id)
    refetch()
  }

  const cleanup = async () => {
    setCleaning(true)
    const res = await api.admin.cleanupContainers()
    alert(`Cleaned ${res.cleaned} expired containers`)
    setCleaning(false)
    refetch()
  }

  const columns = [
    { key: 'id', header: 'ID', render: (c: Container) => <code className="text-xs">{c.id}</code> },
    { key: 'name', header: 'Name', render: (c: Container) => <span className="text-sm font-medium">{c.name}</span> },
    { key: 'status', header: 'Status', render: (c: Container) => <StatusBadge status={c.status} /> },
    { key: 'image', header: 'Image', render: (c: Container) => <span className="text-xs text-gray-400">{c.image}</span> },
    { key: 'session', header: 'Session', render: (c: Container) => <code className="text-xs text-gray-500">{c.session_id.slice(0, 8)}...</code> },
    { key: 'created', header: 'Created', render: (c: Container) => <span className="text-xs text-gray-500">{c.created_at.slice(0, 19).replace('T', ' ')}</span> },
    {
      key: 'actions', header: '', render: (c: Container) => (
        <button onClick={() => killContainer(c.id)} className="text-red-400 hover:text-red-300" title="Kill container">
          <Trash2 className="w-4 h-4" />
        </button>
      )
    },
  ]

  return (
    <div>
      <PageHeader title="Containers" subtitle={`${data?.total ?? 0} running`}
        actions={
          <div className="flex gap-3">
            <button onClick={cleanup} disabled={cleaning}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 rounded-lg text-sm font-medium border border-amber-500/20">
              {cleaning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Cleanup Expired
            </button>
            <button onClick={refetch} className="p-2 hover:bg-gray-800 rounded-lg"><RefreshCw className="w-4 h-4 text-gray-400" /></button>
          </div>
        }
      />

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {loading ? <div className="p-12 text-center text-gray-500">Loading...</div> :
          <DataTable columns={columns} data={data?.containers ?? []} emptyMessage="No running containers" />
        }
      </div>
    </div>
  )
}
