const BASE = '/api/v1'

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts.headers as Record<string, string> || {}),
  }
  const res = await fetch(`${BASE}${path}`, { ...opts, headers })
  if (res.status === 401) {
    localStorage.removeItem('token')
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

const get = <T>(p: string) => request<T>(p)
const post = <T>(p: string, body?: unknown) => request<T>(p, { method: 'POST', body: body ? JSON.stringify(body) : undefined })
const patch = <T>(p: string, body: unknown) => request<T>(p, { method: 'PATCH', body: JSON.stringify(body) })
const del = <T>(p: string) => request<T>(p, { method: 'DELETE' })

export const api = {
  auth: {
    githubUrl: (redirectUri?: string) => get<{ url: string; state: string }>(`/auth/github/url${redirectUri ? `?redirect_uri=${encodeURIComponent(redirectUri)}` : ''}`),
    callback: (code: string) => post<{ access_token: string; user: import('../types').User }>('/auth/github/callback', { code }),
    me: () => get<import('../types').User>('/auth/me'),
  },
  repos: {
    list: () => get<import('../types').Repository[]>('/repositories/'),
    sync: () => post<import('../types').Repository[]>('/repositories/sync'),
    get: (id: string) => get<import('../types').Repository>(`/repositories/${id}`),
    branches: (id: string) => get<{ name: string; sha: string }[]>(`/repositories/${id}/branches`),
  },
  sessions: {
    create: (body: { repository_id: string; task_description: string; branch?: string }) => post<import('../types').Session>('/sessions/', body),
    list: (limit = 20, offset = 0) => get<{ sessions: import('../types').Session[]; total: number }>(`/sessions/?limit=${limit}&offset=${offset}`),
    get: (id: string) => get<import('../types').Session>(`/sessions/${id}`),
    events: (id: string) => get<import('../types').SessionEvent[]>(`/sessions/${id}/events`),
    cancel: (id: string) => post<import('../types').Session>(`/sessions/${id}/cancel`),
  },
  billing: {
    usage: () => get<import('../types').UsageSummary>('/billing/usage'),
    history: (limit = 50) => get<import('../types').BillingRecord[]>(`/billing/history?limit=${limit}`),
    plans: () => get<import('../types').Plan[]>('/billing/plans'),
  },
  admin: {
    stats: () => get<import('../types').AdminStats>('/admin/stats'),
    users: (params = '') => get<{ users: import('../types').AdminUser[]; total: number }>(`/admin/users?${params}`),
    userDetail: (id: string) => get<import('../types').AdminUserDetail>(`/admin/users/${id}`),
    updateUser: (id: string, body: Record<string, unknown>) => patch<{ ok: boolean }>(`/admin/users/${id}`, body),
    deactivateUser: (id: string) => del<{ ok: boolean }>(`/admin/users/${id}`),
    sessions: (params = '') => get<{ sessions: import('../types').Session[]; total: number }>(`/admin/sessions?${params}`),
    cancelSession: (id: string) => post<{ ok: boolean }>(`/admin/sessions/${id}/cancel`),
    containers: () => get<{ containers: import('../types').Container[]; total: number }>('/admin/containers'),
    killContainer: (id: string) => del<{ ok: boolean }>(`/admin/containers/${id}`),
    cleanupContainers: () => post<{ cleaned: number }>('/admin/containers/cleanup'),
    billingOverview: (days = 30) => get<{ period_days: number; revenue_cents: number; record_count: number; recent_records: import('../types').BillingRecord[] }>(`/admin/billing/overview?days=${days}`),
  },
}
