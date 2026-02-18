import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useFetch } from '../../hooks/useFetch'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { StatCard } from '../../components/StatCard'
import { StatusBadge } from '../../components/StatusBadge'
import { ArrowLeft, Terminal, CreditCard, Timer, Shield, Ban, UserCheck } from 'lucide-react'

export function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: user, refetch } = useFetch(() => api.admin.userDetail(id!), [id])
  const [saving, setSaving] = useState(false)

  if (!user) return <div className="text-center py-12 text-gray-500">Loading...</div>

  const toggleActive = async () => {
    setSaving(true)
    await api.admin.updateUser(id!, { is_active: !user.is_active })
    await refetch()
    setSaving(false)
  }

  const toggleAdmin = async () => {
    setSaving(true)
    await api.admin.updateUser(id!, { is_admin: !user.is_admin })
    await refetch()
    setSaving(false)
  }

  const changeTier = async (tier: string) => {
    setSaving(true)
    await api.admin.updateUser(id!, { tier })
    await refetch()
    setSaving(false)
  }

  return (
    <div>
      <PageHeader title="User Detail"
        actions={<button onClick={() => navigate('/admin/users')} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-800 rounded-lg text-sm text-gray-400"><ArrowLeft className="w-4 h-4" /> Back</button>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center gap-4 mb-4">
              {user.avatar_url && <img src={user.avatar_url} className="w-14 h-14 rounded-full" />}
              <div>
                <p className="text-lg font-semibold">{user.display_name || user.github_username}</p>
                <p className="text-sm text-gray-500">@{user.github_username}</p>
              </div>
            </div>
            <div className="flex gap-2 mb-4 flex-wrap">
              <StatusBadge status={user.is_active ? 'active' : 'inactive'} />
              <StatusBadge status={user.subscription.tier} />
              {user.is_admin && <StatusBadge status="pro" />}
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-gray-500">Email</span><span>{user.email || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">GitHub ID</span><span>{user.github_id}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">User ID</span><span className="font-mono text-[10px]">{user.id}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Joined</span><span>{user.created_at.slice(0, 10)}</span></div>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
            <h3 className="font-semibold text-sm">Actions</h3>
            <button onClick={toggleActive} disabled={saving}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${user.is_active ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25' : 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'}`}>
              {user.is_active ? <><Ban className="w-4 h-4" /> Deactivate</> : <><UserCheck className="w-4 h-4" /> Activate</>}
            </button>
            <button onClick={toggleAdmin} disabled={saving}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-adel-500/15 text-adel-400 hover:bg-adel-500/25">
              <Shield className="w-4 h-4" /> {user.is_admin ? 'Remove Admin' : 'Make Admin'}
            </button>

            <div>
              <p className="text-xs text-gray-500 mb-2">Change Tier</p>
              <div className="flex gap-2 flex-wrap">
                {['free', 'pro', 'team', 'enterprise'].map(t => (
                  <button key={t} onClick={() => changeTier(t)} disabled={saving}
                    className={`px-3 py-1 rounded text-xs font-medium border ${user.subscription.tier === t ? 'bg-adel-500/15 border-adel-500/30 text-adel-400' : 'border-gray-700 text-gray-400 hover:border-gray-600'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <StatCard title="Sessions" value={user.stats.total_sessions} icon={Terminal} color="text-adel-400" />
            <StatCard title="Minutes" value={user.stats.total_minutes.toFixed(0)} icon={Timer} color="text-cyan-400" />
            <StatCard title="Spent" value={`$${(user.stats.total_spent_cents / 100).toFixed(2)}`} icon={CreditCard} color="text-amber-400" />
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-800"><h3 className="font-semibold text-sm">Recent Sessions</h3></div>
            <div className="divide-y divide-gray-800/50">
              {user.recent_sessions.map(s => (
                <div key={s.id} onClick={() => navigate(`/sessions/${s.id}`)} className="px-5 py-3 hover:bg-gray-800/30 cursor-pointer flex items-center gap-3">
                  <StatusBadge status={s.status} />
                  <span className="flex-1 truncate text-sm">{s.task_description}</span>
                  <span className="text-xs text-gray-500">{s.duration_seconds ? `${(s.duration_seconds / 60).toFixed(1)}m` : '—'}</span>
                  <span className="text-xs text-gray-600">{s.created_at.slice(0, 10)}</span>
                </div>
              ))}
              {user.recent_sessions.length === 0 && <p className="p-6 text-center text-gray-600 text-sm">No sessions</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
