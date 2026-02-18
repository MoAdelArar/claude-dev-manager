import { useAuth } from '../../lib/auth'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'

export function SettingsPage() {
  const { user, logout } = useAuth()

  return (
    <div>
      <PageHeader title="Settings" />

      <div className="max-w-2xl space-y-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="font-semibold mb-4">Account</h2>
          <div className="flex items-center gap-4 mb-6">
            {user?.avatar_url && <img src={user.avatar_url} className="w-16 h-16 rounded-full" />}
            <div>
              <p className="text-lg font-medium">{user?.display_name || user?.github_username}</p>
              <p className="text-sm text-gray-500">@{user?.github_username}</p>
              {user?.email && <p className="text-sm text-gray-500">{user.email}</p>}
            </div>
            {user?.is_admin && <StatusBadge status="pro" className="ml-auto" />}
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-gray-500">User ID</p><p className="font-mono text-xs">{user?.id}</p></div>
            <div><p className="text-gray-500">Role</p><p>{user?.is_admin ? 'Admin' : 'User'}</p></div>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="font-semibold mb-4">Authentication</h2>
          <p className="text-sm text-gray-400 mb-4">Your account is linked to GitHub. Sign out to disconnect.</p>
          <button onClick={logout} className="px-4 py-2 bg-red-500/15 text-red-400 hover:bg-red-500/25 rounded-lg text-sm font-medium">Sign Out</button>
        </div>
      </div>
    </div>
  )
}
