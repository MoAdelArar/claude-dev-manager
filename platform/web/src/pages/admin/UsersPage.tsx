import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFetch } from '../../hooks/useFetch'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { DataTable } from '../../components/DataTable'
import { StatusBadge } from '../../components/StatusBadge'
import type { AdminUser } from '../../types'
import { Search, RefreshCw } from 'lucide-react'

export function AdminUsersPage() {
  const [search, setSearch] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const navigate = useNavigate()
  const { data, loading, refetch } = useFetch(
    () => api.admin.users(`search=${searchQuery}&limit=100`),
    [searchQuery]
  )

  const doSearch = () => setSearchQuery(search)

  const columns = [
    {
      key: 'user', header: 'User', render: (u: AdminUser) => (
        <div className="flex items-center gap-3">
          {u.avatar_url && <img src={u.avatar_url} className="w-8 h-8 rounded-full" />}
          <div>
            <p className="font-medium text-sm">{u.github_username}</p>
            <p className="text-xs text-gray-500">{u.email || '—'}</p>
          </div>
        </div>
      )
    },
    { key: 'tier', header: 'Tier', render: (u: AdminUser) => <StatusBadge status={u.tier} /> },
    { key: 'status', header: 'Status', render: (u: AdminUser) => <StatusBadge status={u.is_active ? 'active' : 'inactive'} /> },
    { key: 'admin', header: 'Role', render: (u: AdminUser) => u.is_admin ? <span className="text-xs text-adel-400 font-medium">Admin</span> : <span className="text-xs text-gray-500">User</span> },
    { key: 'sessions', header: 'Sessions', render: (u: AdminUser) => <span className="text-gray-400">{u.session_count}</span> },
    { key: 'joined', header: 'Joined', render: (u: AdminUser) => <span className="text-xs text-gray-500">{u.created_at.slice(0, 10)}</span> },
  ]

  return (
    <div>
      <PageHeader title="User Management" subtitle={`${data?.total ?? 0} users`}
        actions={<button onClick={refetch} className="p-2 hover:bg-gray-800 rounded-lg"><RefreshCw className="w-4 h-4 text-gray-400" /></button>}
      />

      <div className="mb-4 flex gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()}
            placeholder="Search username or email..."
            className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm focus:outline-none focus:border-adel-500" />
        </div>
        <button onClick={doSearch} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm border border-gray-700">Search</button>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {loading ? <div className="p-12 text-center text-gray-500">Loading...</div> :
          <DataTable columns={columns} data={data?.users ?? []} onRowClick={u => navigate(`/admin/users/${u.id}`)} />
        }
      </div>
    </div>
  )
}
