import { useState } from 'react'
import { useFetch } from '../../hooks/useFetch'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { FolderGit2, Lock, Globe, RefreshCw, Search, GitBranch, Loader2 } from 'lucide-react'

export function ReposPage() {
  const { data: repos, loading, refetch } = useFetch(() => api.repos.list())
  const [search, setSearch] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null)
  const [task, setTask] = useState('')
  const [branch, setBranch] = useState('')
  const [creating, setCreating] = useState(false)

  const sync = async () => {
    setSyncing(true)
    await api.repos.sync().catch(() => {})
    await refetch()
    setSyncing(false)
  }

  const filtered = repos?.filter(r =>
    r.full_name.toLowerCase().includes(search.toLowerCase())
  ) ?? []

  const selected = repos?.find(r => r.id === selectedRepo)

  const createSession = async () => {
    if (!selectedRepo || !task.trim()) return
    setCreating(true)
    try {
      const session = await api.sessions.create({ repository_id: selectedRepo, task_description: task, branch: branch || undefined })
      window.location.href = `/sessions/${session.id}`
    } catch { setCreating(false) }
  }

  return (
    <div>
      <PageHeader title="Repositories" subtitle="Select a repo to start a Claude Code session"
        actions={
          <button onClick={sync} disabled={syncing} className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm border border-gray-700 disabled:opacity-50">
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Sync
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search repositories..." className="w-full pl-10 pr-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg text-sm focus:outline-none focus:border-adel-500" />
          </div>

          {loading && <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-500" /></div>}

          <div className="space-y-2">
            {filtered.map(r => (
              <button key={r.id} onClick={() => { setSelectedRepo(r.id); setBranch(r.default_branch) }}
                className={`w-full text-left p-4 rounded-xl border transition-colors ${selectedRepo === r.id ? 'bg-adel-500/10 border-adel-500/30' : 'bg-gray-900 border-gray-800 hover:border-gray-700'}`}>
                <div className="flex items-center gap-2">
                  {r.is_private ? <Lock className="w-4 h-4 text-gray-500" /> : <Globe className="w-4 h-4 text-gray-500" />}
                  <span className="font-medium text-sm">{r.full_name}</span>
                  {r.language && <span className="ml-auto text-xs text-gray-500">{r.language}</span>}
                </div>
                {r.description && <p className="mt-1 text-xs text-gray-500 truncate">{r.description}</p>}
                <div className="mt-2 flex items-center gap-1 text-xs text-gray-600">
                  <GitBranch className="w-3 h-3" /> {r.default_branch}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 h-fit sticky top-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <FolderGit2 className="w-4 h-4 text-adel-400" /> New Session
          </h2>
          {selected ? (
            <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">Repository</p>
                <p className="text-sm font-medium">{selected.full_name}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500">Branch</label>
                <input value={branch} onChange={e => setBranch(e.target.value)} className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-adel-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Task for Claude Code</label>
                <textarea value={task} onChange={e => setTask(e.target.value)} rows={5} placeholder="Describe what you want Claude Code to do..." className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm resize-none focus:outline-none focus:border-adel-500" />
              </div>
              <button onClick={createSession} disabled={!task.trim() || creating}
                className="w-full py-2.5 bg-adel-500 hover:bg-adel-600 disabled:opacity-50 text-white font-medium rounded-lg text-sm flex items-center justify-center gap-2 transition-colors">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Start Session
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Select a repository to start</p>
          )}
        </div>
      </div>
    </div>
  )
}
