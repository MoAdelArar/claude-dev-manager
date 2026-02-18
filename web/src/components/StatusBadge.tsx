import clsx from 'clsx'

const colors: Record<string, string> = {
  completed: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
  running: 'bg-blue-500/15 text-blue-400 ring-blue-500/30',
  agent_working: 'bg-violet-500/15 text-violet-400 ring-violet-500/30',
  provisioning: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  pushing: 'bg-cyan-500/15 text-cyan-400 ring-cyan-500/30',
  pending: 'bg-gray-500/15 text-gray-400 ring-gray-500/30',
  failed: 'bg-red-500/15 text-red-400 ring-red-500/30',
  cancelled: 'bg-orange-500/15 text-orange-400 ring-orange-500/30',
  timed_out: 'bg-orange-500/15 text-orange-400 ring-orange-500/30',
  free: 'bg-gray-500/15 text-gray-400 ring-gray-500/30',
  pro: 'bg-adel-500/15 text-adel-400 ring-adel-500/30',
  team: 'bg-cyan-500/15 text-cyan-400 ring-cyan-500/30',
  enterprise: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  active: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
  inactive: 'bg-red-500/15 text-red-400 ring-red-500/30',
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const c = colors[status] || colors.pending
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ring-1 ring-inset', c, className)}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}
