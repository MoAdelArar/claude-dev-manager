export interface User {
  id: string
  github_username: string
  email: string | null
  avatar_url: string | null
  display_name: string | null
  is_active: boolean
  is_admin: boolean
}

export interface Repository {
  id: string
  github_repo_id: number
  full_name: string
  name: string
  description: string | null
  default_branch: string
  language: string | null
  is_private: boolean
  clone_url: string
  created_at: string
  updated_at: string
}

export interface Session {
  id: string
  user_id?: string
  username?: string
  avatar_url?: string
  repository_id: string
  status: string
  branch: string
  task_description: string
  container_id: string | null
  started_at: string | null
  ended_at: string | null
  duration_seconds: number | null
  cost_cents: number
  tokens_used: number
  commit_sha: string | null
  commit_message: string | null
  files_changed: number | null
  error_message: string | null
  created_at: string
  updated_at?: string
}

export interface SessionEvent {
  id: string
  session_id: string
  event_type: string
  sequence: number
  content: string
  metadata_json: string | null
  timestamp: string
}

export interface UsageSummary {
  subscription: {
    tier: string
    is_active: boolean
    minutes_used_this_period: number
    minutes_limit: number
    max_concurrent_sessions: number
    current_period_start: string | null
    current_period_end: string | null
  }
  totals: {
    total_spent_cents: number
    total_sessions: number
    total_minutes: number
  }
}

export interface BillingRecord {
  id: string
  user_id?: string
  session_id?: string
  billing_type: string
  amount_cents: number
  description: string
  created_at: string
}

export interface Plan {
  tier: string
  price_cents_monthly: number
  minutes_per_month: number
  max_concurrent_sessions: number
}

export interface AdminStats {
  users: { total: number; active: number; new_30d: number }
  sessions: { total: number; active: number; completed: number; failed: number; last_30d: number; last_7d: number }
  repositories: { total: number }
  billing: { total_revenue_cents: number; revenue_30d_cents: number; total_minutes: number }
  subscriptions: Record<string, number>
}

export interface AdminUser {
  id: string
  github_username: string
  email: string | null
  avatar_url: string | null
  display_name: string | null
  is_active: boolean
  is_admin: boolean
  created_at: string
  updated_at: string
  tier: string
  session_count: number
}

export interface AdminUserDetail extends AdminUser {
  github_id: number
  subscription: { tier: string; is_active: boolean; minutes_used: number }
  stats: { total_sessions: number; total_spent_cents: number; total_minutes: number }
  recent_sessions: { id: string; status: string; task_description: string; created_at: string; duration_seconds: number | null; cost_cents: number }[]
}

export interface Container {
  id: string
  name: string
  status: string
  image: string
  session_id: string
  created_at: string
}
