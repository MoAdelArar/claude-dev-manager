import { useParams, useNavigate } from 'react-router-dom'
import { useFetch } from '../../hooks/useFetch'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'
import { ArrowLeft, Terminal, FileEdit, AlertCircle, Bot, GitCommit, Clock, Search } from 'lucide-react'
import clsx from 'clsx'

export function SessionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: session } = useFetch(() => api.sessions.get(id!), [id])
  const { data: events } = useFetch(() => api.sessions.events(id!), [id])

  if (!session) return <div className="text-center py-12 text-gray-500">Loading...</div>

  const isActive = ['running', 'agent_working', 'provisioning', 'pushing'].includes(session.status)

  const cancelSession = async () => {
    if (!confirm('Cancel this session?')) return
    await api.sessions.cancel(id!)
    window.location.reload()
  }

  return (
    <div>
      <PageHeader
        title="Session Detail"
        actions={
          <div className="flex items-center gap-3">
            {isActive && <button onClick={cancelSession} className="px-4 py-2 bg-red-500/15 text-red-400 hover:bg-red-500/25 rounded-lg text-sm font-medium">Cancel</button>}
            <button onClick={() => navigate('/sessions')} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-800 rounded-lg text-sm text-gray-400"><ArrowLeft className="w-4 h-4" /> Back</button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <StatusBadge status={session.status} />
              {isActive && <span className="flex items-center gap-1 text-xs text-adel-400"><span className="w-1.5 h-1.5 bg-adel-400 rounded-full animate-pulse" /> Live</span>}
            </div>

            <p className="text-sm">{session.task_description}</p>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><p className="text-gray-500">Branch</p><p className="font-mono">{session.branch}</p></div>
              <div><p className="text-gray-500">Duration</p><p>{session.duration_seconds ? `${(session.duration_seconds / 60).toFixed(1)} min` : '—'}</p></div>
              <div><p className="text-gray-500">Cost</p><p>{session.cost_cents > 0 ? `$${(session.cost_cents / 100).toFixed(2)}` : '—'}</p></div>
              <div><p className="text-gray-500">Tokens</p><p>{session.tokens_used > 0 ? session.tokens_used.toLocaleString() : '—'}</p></div>
            </div>

            {session.commit_sha && (
              <div className="flex items-center gap-2 p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <GitCommit className="w-4 h-4 text-emerald-400" />
                <code className="text-xs text-emerald-400">{session.commit_sha.slice(0, 7)}</code>
                {session.files_changed && <span className="text-xs text-gray-500">{session.files_changed} files</span>}
              </div>
            )}

            {session.error_message && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-xs text-red-400">{session.error_message}</p>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-800 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium">Event Log</span>
              <span className="text-xs text-gray-600 ml-auto">{events?.length ?? 0} events</span>
            </div>
            <div className="max-h-[600px] overflow-y-auto divide-y divide-gray-800/30">
              {events?.map(e => {
                const Icon = e.event_type === 'agent_action' ? (e.content.includes('Bash') ? Terminal : e.content.includes('Read') || e.content.includes('Write') ? FileEdit : Search) : e.event_type === 'error' ? AlertCircle : e.event_type === 'agent_message' ? Bot : Clock
                const color = e.event_type === 'error' ? 'text-red-400' : e.event_type === 'agent_action' ? 'text-cyan-400' : e.event_type === 'command_output' ? 'text-gray-500' : e.event_type === 'agent_message' ? 'text-gray-300' : 'text-gray-500'
                return (
                  <div key={e.id} className="px-4 py-2 flex gap-2 text-xs">
                    <Icon className={clsx('w-3.5 h-3.5 mt-0.5 shrink-0', color)} />
                    <span className={clsx('font-mono whitespace-pre-wrap break-all', e.event_type === 'command_output' ? 'text-gray-500' : color)}>{e.content}</span>
                  </div>
                )
              })}
              {(!events || events.length === 0) && <p className="p-8 text-center text-gray-600 text-sm">No events yet</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
